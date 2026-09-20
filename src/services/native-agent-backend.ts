import type {
  ChatActivity,
  ChatActivityStatus,
  ChatBackend,
  ChatCallbacks,
  ChatRequest,
  CliDetection,
  PermissionMode,
} from "../types";
import { promptWithContext } from "./cli-profiles";
import { JsonRpcProcess } from "./json-rpc-process";

const ACP_AGENTS = new Set(["gemini", "opencode", "qwen", "kimi"]);

export function nativeTransportFor(agentId: string): "app-server" | "acp" | null {
  if (agentId === "codex") return "app-server";
  return ACP_AGENTS.has(agentId) ? "acp" : null;
}

export function nativeTransportLabel(agentId: string): string | null {
  const transport = nativeTransportFor(agentId);
  return transport === "app-server" ? "App Server" : transport === "acp" ? "ACP" : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringAt(value: unknown, ...keys: string[]): string | null {
  let current: unknown = value;
  for (const key of keys) current = record(current)?.[key];
  return typeof current === "string" ? current : null;
}

function arrayAt(value: unknown, ...keys: string[]): unknown[] {
  let current: unknown = value;
  for (const key of keys) current = record(current)?.[key];
  return Array.isArray(current) ? current : [];
}

function activityStatus(value: unknown): ChatActivityStatus {
  switch (value) {
    case "in_progress":
    case "inProgress": return "running";
    case "completed": return "completed";
    case "failed": return "failed";
    case "cancelled":
    case "canceled": return "cancelled";
    default: return "pending";
  }
}

function effectivePrompt(request: ChatRequest, includeSystemPrompt: boolean): string {
  const prompt = promptWithContext(request);
  return includeSystemPrompt ? `${request.systemPrompt}\n\n${prompt}` : prompt;
}

export function acpLaunch(agentId: string, permissionMode: PermissionMode): string[] {
  if (agentId === "kimi") return ["acp"];
  if (agentId === "opencode") return ["acp"];
  if (agentId === "qwen") return ["--acp", "--approval-mode", permissionMode === "edit" ? "auto-edit" : "plan"];
  return ["--acp", "--approval-mode", permissionMode === "edit" ? "auto_edit" : "plan"];
}

export function acpMcpServers(config: Record<string, unknown> | undefined): unknown[] {
  const servers = record(config?.mcpServers);
  if (!servers) return [];
  const result: unknown[] = [];
  for (const [name, raw] of Object.entries(servers)) {
    const server = record(raw);
    if (!server) continue;
    if (typeof server.command === "string") {
      const environment = record(server.env);
      result.push({
        name,
        command: server.command,
        args: Array.isArray(server.args) ? server.args.filter((item): item is string => typeof item === "string") : [],
        env: environment ? Object.entries(environment).map(([key, value]) => ({ name: key, value: String(value) })) : [],
      });
    } else if (typeof server.url === "string") {
      result.push({ type: "http", name, url: server.url, headers: [] });
    }
  }
  return result;
}

export class NativeAgentBackend implements ChatBackend {
  readonly id: string;
  readonly label: string;
  private process: JsonRpcProcess | null = null;
  private sessionId: string | null = null;
  private activeCallbacks: ChatCallbacks | null = null;
  private activePermissionMode: PermissionMode = "plan";
  private connectedMode: PermissionMode | null = null;
  private ready = false;
  private activeTurnId: string | null = null;

  constructor(private readonly detection: CliDetection) {
    if (!detection.path || !nativeTransportFor(detection.id)) throw new Error("该 Agent 没有可用的原生协议");
    this.id = `cli:${detection.id}`;
    this.label = `${detection.label} · ${nativeTransportLabel(detection.id)}`;
  }

  async send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void> {
    if (this.activeCallbacks) throw new Error(`${this.detection.label} 正在处理另一条消息`);
    this.activeCallbacks = callbacks;
    this.activePermissionMode = request.permissionMode;
    const abort = (): void => this.cancel();
    signal.addEventListener("abort", abort, { once: true });
    try {
      await this.ensureConnected(request);
      if (!this.process) throw new Error("原生 Agent 连接未建立");
      callbacks.onStatus(`${this.label} · 已连接`);
      if (this.detection.id === "codex") await this.sendCodex(request);
      else await this.sendAcp(request);
    } finally {
      signal.removeEventListener("abort", abort);
      this.activeCallbacks = null;
    }
  }

  resetSession(): void {
    this.sessionId = null;
  }

  async shutdown(): Promise<void> {
    this.sessionId = null;
    this.ready = false;
    this.connectedMode = null;
    const process = this.process;
    this.process = null;
    await process?.stop();
  }

  private async ensureConnected(request: ChatRequest): Promise<void> {
    const path = this.detection.path;
    if (!path) throw new Error(`${this.detection.label} 当前不可用`);
    const transport = nativeTransportFor(this.detection.id);
    const modeChanged = transport === "acp" && this.connectedMode !== null && this.connectedMode !== request.permissionMode;
    if (modeChanged) await this.shutdown();
    if (this.process?.running && this.ready) return;
    const args = transport === "app-server"
      ? ["app-server", "--listen", "stdio://"]
      : acpLaunch(this.detection.id, request.permissionMode);
    const process = new JsonRpcProcess({
      executablePath: path,
      args,
      ...(request.cwd ? { cwd: request.cwd } : {}),
      env: (window as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env,
      includeJsonRpc: transport === "acp",
      onNotification: (method, params) => this.handleNotification(method, params),
      onServerRequest: (id, method, params) => this.handleServerRequest(id, method, params),
      onLog: (message) => console.debug(`Qiaomu Agent ${this.detection.id}: ${message}`),
      onClose: (reason) => {
        this.ready = false;
        this.activeCallbacks?.onStatus(`${this.detection.label} · 连接中断`);
        console.warn(`Qiaomu Agent ${this.detection.id} native transport closed: ${reason}`);
      },
    });
    this.process = process;
    process.start();
    if (transport === "app-server") {
      await process.request("initialize", {
        clientInfo: { name: "qiaomu_agent_obsidian", title: "Qiaomu Agent for Obsidian", version: "0.1.0" },
      }, 15_000);
      process.notify("initialized", {});
    } else {
      const initialized = await process.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "qiaomu-agent", title: "Qiaomu Agent for Obsidian", version: "0.1.0" },
      }, 15_000);
      const protocolVersion = record(initialized)?.protocolVersion;
      if (protocolVersion !== 1) throw new Error(`不支持 ACP 协议版本 ${String(protocolVersion)}`);
    }
    this.ready = true;
    this.connectedMode = request.permissionMode;
  }

  private async sendCodex(request: ChatRequest): Promise<void> {
    if (!this.process) return;
    if (!this.sessionId) {
      const result = await this.process.request("thread/start", {
        cwd: request.cwd,
        approvalPolicy: "never",
        sandbox: request.permissionMode === "edit" ? "workspace-write" : "read-only",
        developerInstructions: request.systemPrompt,
        serviceName: "qiaomu_agent_obsidian",
      }, 30_000);
      this.sessionId = stringAt(result, "thread", "id");
      if (!this.sessionId) throw new Error("Codex App Server 未返回 threadId");
    }
    const params = {
      threadId: this.sessionId,
      input: [{ type: "text", text: effectivePrompt(request, false), text_elements: [] }],
      cwd: request.cwd,
      approvalPolicy: "never",
      sandboxPolicy: request.permissionMode === "edit"
        ? { type: "workspaceWrite", writableRoots: request.cwd ? [request.cwd] : [], networkAccess: false }
        : { type: "readOnly" },
    };
    const completion = this.waitForTurn();
    const result = await this.process.request("turn/start", params, 30_000);
    this.activeTurnId = stringAt(result, "turn", "id");
    await completion;
  }

  private async sendAcp(request: ChatRequest): Promise<void> {
    if (!this.process) return;
    const firstPrompt = !this.sessionId;
    if (!this.sessionId) {
      const result = await this.process.request("session/new", {
        cwd: request.cwd,
        mcpServers: acpMcpServers(request.mcpConfig),
      }, 30_000);
      this.sessionId = stringAt(result, "sessionId");
      if (!this.sessionId) throw new Error("ACP Agent 未返回 sessionId");
    }
    await this.process.request("session/prompt", {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text: effectivePrompt(request, firstPrompt) }],
    }, 60 * 60 * 1_000);
  }

  private turnResolve: (() => void) | null = null;

  private waitForTurn(): Promise<void> {
    return new Promise((resolve) => { this.turnResolve = resolve; });
  }

  private cancel(): void {
    if (!this.process || !this.sessionId) return;
    if (this.detection.id === "codex") {
      if (!this.activeTurnId) return;
      void this.process.request("turn/interrupt", { threadId: this.sessionId, turnId: this.activeTurnId }, 5_000).catch(() => {});
    } else {
      this.process.notify("session/cancel", { sessionId: this.sessionId });
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (this.detection.id === "codex") {
      if (method === "item/agentMessage/delta" || method === "item/plan/delta") {
        const delta = stringAt(params, "delta");
        if (delta) this.activeCallbacks?.onText(delta);
      } else if (method === "item/started" || method === "item/completed") {
        const item = record(record(params)?.item);
        if (item) this.emitCodexActivity(item, method === "item/completed");
      } else if (method === "turn/completed") {
        this.activeTurnId = null;
        this.turnResolve?.();
        this.turnResolve = null;
      }
      return;
    }
    if (method !== "session/update") return;
    const update = record(record(params)?.update);
    if (!update) return;
    const kind = update.sessionUpdate;
    if (kind === "agent_message_chunk") {
      const text = stringAt(update, "content", "text");
      if (text) this.activeCallbacks?.onText(text);
      return;
    }
    if (kind === "tool_call" || kind === "tool_call_update") {
      const id = typeof update.toolCallId === "string" ? update.toolCallId : `tool-${Date.now()}`;
      this.activeCallbacks?.onActivity?.({
        id,
        label: typeof update.title === "string" ? update.title : typeof update.name === "string" ? update.name : "工具调用",
        status: activityStatus(update.status),
        detail: toolDetail(update.content),
      });
    }
  }

  private emitCodexActivity(item: Record<string, unknown>, completed: boolean): void {
    const type = typeof item.type === "string" ? item.type : "tool";
    if (type === "userMessage" || type === "agentMessage" || type === "plan" || type === "thinking" || type === "reasoning") return;
    const id = typeof item.id === "string" ? item.id : `${type}-${Date.now()}`;
    const labels: Record<string, string> = {
      commandExecution: "执行命令",
      fileChange: "修改文件",
      mcpToolCall: "调用 MCP 工具",
      webSearch: "搜索网络",
      imageGeneration: "生成图片",
    };
    this.activeCallbacks?.onActivity?.({
      id,
      label: typeof item.title === "string" ? item.title : labels[type] ?? type,
      status: completed ? activityStatus(item.status ?? "completed") : "running",
      detail: typeof item.command === "string" ? item.command : undefined,
    });
  }

  private handleServerRequest(id: number | string, method: string, params: unknown): void {
    if (!this.process) return;
    if (method === "session/request_permission") {
      const options = arrayAt(params, "options").map(record).filter((item): item is Record<string, unknown> => Boolean(item));
      const desired = this.activePermissionMode === "edit" ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
      const selected = options.find((option) => desired.includes(String(option.kind)));
      if (selected && typeof selected.optionId === "string") {
        this.process.respond(id, { outcome: { outcome: "selected", optionId: selected.optionId } });
      } else {
        this.process.respond(id, { outcome: { outcome: "cancelled" } });
      }
      return;
    }
    this.process.reject(id, -32601, `Unsupported client method: ${method}`);
  }
}

function toolDetail(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    const item = record(entry);
    const text = stringAt(item, "content", "text");
    if (text) return text.slice(0, 300);
    if (typeof item?.path === "string") return item.path;
  }
  return undefined;
}
