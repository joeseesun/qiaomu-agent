import type { ChatBackend, ChatCallbacks, ChatRequest, CliDetection } from "../types";
import { promptWithContext } from "./cli-profiles";
import { getRuntimeRequire } from "./runtime-require";

export function zcodeArgs(request: ChatRequest): string[] {
  if (request.model?.trim()) throw new Error("请在 ZCode 中选择模型，插件使用它的默认模型");
  const history = request.history.filter(m => m.role === "user" || m.role === "assistant").slice(-20).map(m => m.role + ": " + m.content).join("\n\n");
  return ["--prompt", [request.systemPrompt, history, promptWithContext(request)].filter(Boolean).join("\n\n"),
    "--json", "--mode", request.permissionMode === "full" ? "yolo" : request.permissionMode,
    ...(request.cwd ? ["--cwd", request.cwd] : [])];
}

export function zcodeResponse(stdout: string): string {
  let value: { response?: unknown; projection?: { status?: string } };
  try { value = JSON.parse(stdout); } catch { throw new Error("ZCode 未返回有效的 JSON 结果"); }
  if (!value || typeof value.response !== "string") throw new Error("ZCode 未返回可显示的回复");
  if (["failed", "error", "cancelled"].includes(value.projection?.status ?? "")) throw new Error(value.response || "ZCode 任务未完成");
  return value.response;
}

export function zcodeError(stderr: string, fallback: string): string {
  if (stderr.includes("1309") || stderr.includes("套餐已到期")) return "ZCode 当前模型的 GLM Coding Plan 套餐已到期，请在 ZCode 中切换可用模型或续订后重试";
  // Never render provider stacks, headers or cookies in chat.
  const line = stderr.split(/\r?\n/).find(line => /^(Error:|ProviderBusinessError:)/.test(line));
  return (line || fallback).slice(0, 600);
}

interface Child { kill(signal: string): boolean; exitCode?: number | null; }
interface Processes {
  execFile(command: string, args: string[], options: object, callback: (error: Error | null, stdout: string, stderr: string) => void): Child;
}

/** ZCode 0.16.x JSON summary interface; approvals fail closed in headless mode. */
export class ZcodeBackend implements ChatBackend {
  readonly id = "cli:zcode";
  readonly label = "ZCode";
  private active = new Set<AbortController>();
  constructor(private readonly detection: CliDetection) {}
  resetSession(): void { /* Every request carries conversation context explicitly. */ }
  async shutdown(): Promise<void> { for (const controller of this.active) controller.abort(); }
  async send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const require = getRuntimeRequire();
    if (!require || !this.detection.path) throw new Error("ZCode 需要桌面端的可用 CLI");
    const args = [...(this.detection.argsPrefix ?? []), ...zcodeArgs(request)];
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    this.active.add(controller);
    const runtime = require("process") as { env: Record<string, string | undefined> };
    callbacks.onStatus("正在通过 ZCode 处理，完成后显示回复…");
    try {
      const output = await new Promise<string>((resolve, reject) => {
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const child = (require("child_process") as Processes).execFile(this.detection.path!, args, {
          cwd: request.cwd ?? undefined, env: { ...runtime.env, ...this.detection.env },
          windowsHide: true, shell: false, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 300_000,
        }, (error, stdout, stderr) => {
          if (killTimer) clearTimeout(killTimer);
          controller.signal.removeEventListener("abort", abort);
          if (controller.signal.aborted) reject(new DOMException("已取消", "AbortError"));
          else if (error) reject(new Error(zcodeError(stderr, error.message)));
          else resolve(stdout);
        });
        const abort = () => {
          child.kill("SIGTERM");
          killTimer = setTimeout(() => { if (child.exitCode == null) child.kill("SIGKILL"); }, 2000);
        };
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
      });
      controller.signal.throwIfAborted();
      callbacks.onText(zcodeResponse(output));
    } finally {
      signal.removeEventListener("abort", cancel);
      this.active.delete(controller);
    }
  }
}
