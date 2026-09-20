import type { App } from "obsidian";
import type { ChatBackend, CliDetection, QiaomuSettings } from "../types";
import { ApiBackend } from "./api-backend";
import { CliBackend } from "./cli-backend";

export class BackendService {
  private detections: CliDetection[] = [];

  constructor(
    private readonly app: App,
    private readonly getSettings: () => QiaomuSettings
  ) {}

  setDetections(detections: CliDetection[]): void {
    this.detections = detections;
  }

  getDetections(): CliDetection[] {
    return [...this.detections];
  }

  getBackendOptions(): Array<{ value: string; label: string; ready: boolean }> {
    const local = this.detections
      .filter((detection) => detection.callable)
      .map((detection) => ({ value: `cli:${detection.id}`, label: detection.label, ready: true }));
    return [
      { value: "auto", label: "自动", ready: local.length > 0 || this.hasApiKey() },
      ...local,
      { value: "api", label: this.getSettings().api.model || "模型 API", ready: this.hasApiKey() },
    ];
  }

  resolve(selected: string): ChatBackend {
    const settings = this.getSettings();
    if (selected.startsWith("cli:")) {
      const id = selected.slice(4);
      const detection = this.detections.find((item) => item.id === id && item.callable);
      if (!detection) throw new Error("所选本地 Agent 当前不可用，请重新检测");
      return new CliBackend(detection);
    }
    if (selected === "api") return this.apiBackend();

    const preferred = settings.preferredCli
      ? this.detections.find((item) => item.id === settings.preferredCli && item.callable)
      : undefined;
    const first = preferred ?? this.detections.find((item) => item.callable);
    if (first) return new CliBackend(first);
    return this.apiBackend();
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
