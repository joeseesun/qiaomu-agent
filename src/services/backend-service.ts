import { Platform, type App } from "obsidian";
import type { ChatBackend, CliDetection, QiaomuSettings } from "../types";
import { ApiBackend } from "./api-backend";
import { CliBackend } from "./cli-backend";
import { NativeAgentBackend, nativeTransportFor, nativeTransportLabel } from "./native-agent-backend";

export interface AgentConnectionOption {
  value: string;
  label: string;
  description: string;
  ready: boolean;
  transport: string;
  version?: string;
}

export class BackendService {
  private detections: CliDetection[] = [];
  private readonly nativeBackends = new Map<string, NativeAgentBackend>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => QiaomuSettings
  ) {}

  setDetections(detections: CliDetection[]): void {
    this.detections = Platform.isDesktopApp ? detections : [];
  }

  getDetections(): CliDetection[] {
    return [...this.detections];
  }

  getBackendOptions(): Array<{ value: string; label: string; ready: boolean }> {
    const local = this.detections
      .filter((detection) => detection.callable)
      .map((detection) => ({
        value: `cli:${detection.id}`,
        label: nativeTransportLabel(detection.id)
          ? `${detection.label} · ${nativeTransportLabel(detection.id)}`
          : detection.label,
        ready: true,
      }));
    return [
      { value: "auto", label: "自动", ready: local.length > 0 || this.hasApiKey() },
      ...local,
      { value: "api", label: this.getSettings().api.model || "模型 API", ready: this.hasApiKey() },
    ];
  }

  getConnectionOptions(): AgentConnectionOption[] {
    const detected = this.detections.map((detection) => {
      const transport = nativeTransportLabel(detection.id) || "CLI";
      return {
        value: `cli:${detection.id}`,
        label: detection.label,
        description: detection.callable
          ? `已检测到本机 ${detection.label}，通过 ${transport} 连接。`
          : detection.note || `未在本机发现可调用的 ${detection.label}。`,
        ready: detection.callable,
        transport,
        version: detection.version || undefined,
      };
    });
    const api = this.getSettings().api;
    return [
      {
        value: "auto",
        label: "自动选择",
        description: Platform.isDesktopApp ? "优先使用首选的本地 Agent；不可用时回退到模型 API。" : "此设备使用模型 API；本地 CLI 仅限桌面端。",
        ready: detected.some((option) => option.ready) || this.hasApiKey(),
        transport: "智能路由",
      },
      ...detected,
      {
        value: "api",
        label: api.model || "模型 API",
        description: this.hasApiKey()
          ? `已配置 ${api.provider}，适用于桌面端和移动端。`
          : "尚未配置 API Key；可在插件设置中完成。",
        ready: this.hasApiKey(),
        transport: "模型 API",
      },
    ];
  }

  effectiveSelection(selected: string): string {
    // Do not rewrite synced desktop preferences when opening the same vault on a phone.
    return !Platform.isDesktopApp ? "api" : selected;
  }

  resolve(selected: string, owner = "default"): ChatBackend {
    selected = this.effectiveSelection(selected);
    const settings = this.getSettings();
    if (selected.startsWith("cli:")) {
      const id = selected.slice(4);
      const detection = this.detections.find((item) => item.id === id && item.callable);
      if (!detection) throw new Error("所选本地 Agent 当前不可用，请重新检测");
      return this.localBackend(detection, owner);
    }
    if (selected === "api") return this.apiBackend();

    const preferred = settings.preferredCli
      ? this.detections.find((item) => item.id === settings.preferredCli && item.callable)
      : undefined;
    const first = preferred ?? this.detections.find((item) => item.callable);
    if (first) return this.localBackend(first, owner);
    return this.apiBackend();
  }

  resetSessions(owner = "default"): void {
    for (const [key, backend] of this.nativeBackends) {
      if (JSON.parse(key)[0] === owner) backend.resetSession();
    }
  }

  async release(owner: string): Promise<void> {
    const owned = [...this.nativeBackends].filter(([key]) => JSON.parse(key)[0] === owner);
    for (const [key] of owned) this.nativeBackends.delete(key);
    await Promise.all(owned.map(([, backend]) => backend.shutdown()));
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.nativeBackends.values()].map((backend) => backend.shutdown()));
    this.nativeBackends.clear();
  }

  private localBackend(detection: CliDetection, owner: string): ChatBackend {
    if (!nativeTransportFor(detection.id)) return new CliBackend(detection);
    const key = JSON.stringify([owner, detection.id]);
    let backend = this.nativeBackends.get(key);
    if (!backend) {
      backend = new NativeAgentBackend(detection);
      this.nativeBackends.set(key, backend);
    }
    return backend;
  }

  private apiBackend(): ApiBackend {
    const settings = this.getSettings();
    const key = this.app.secretStorage.getSecret(settings.api.secretId) ?? "";
    return new ApiBackend(settings.api, key);
  }

  private hasApiKey(): boolean {
    return Boolean(this.app.secretStorage.getSecret(this.getSettings().api.secretId));
  }
}
