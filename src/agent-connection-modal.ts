import { App, Modal, Notice, setIcon } from "obsidian";
import type QiaomuAgentPlugin from "./main";
import type { AgentConnectionOption } from "./services/backend-service";

export class AgentConnectionModal extends Modal {
  private selected: string;
  private options: AgentConnectionOption[] = [];

  constructor(
    app: App,
    private readonly plugin: QiaomuAgentPlugin,
    selected: string,
    private readonly onSelect: (value: string) => void
  ) {
    super(app);
    this.selected = selected;
  }

  override onOpen(): void {
    this.modalEl.addClass("qiaomu-agent-connect-modal");
    this.options = this.plugin.backendService.getConnectionOptions();
    if (!this.options.some((option) => option.value === this.selected)) this.selected = "auto";
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const content = this.contentEl;
    content.empty();
    content.createEl("h2", { text: "连接 Agent" });
    content.createEl("p", {
      cls: "qiaomu-agent-connect__subtitle",
      text: "选择一个本地 Agent 或模型服务，立即开始对话。",
    });

    const grid = content.createDiv({ cls: "qiaomu-agent-connect__grid" });
    for (const option of this.options) {
      const card = grid.createEl("button", {
        cls: `qiaomu-agent-connect__card${option.value === this.selected ? " is-selected" : ""}`,
        attr: { type: "button", "aria-pressed": String(option.value === this.selected) },
      });
      if (!option.ready) card.addClass("is-unavailable");
      const icon = card.createSpan({ cls: "qiaomu-agent-connect__card-icon" });
      setIcon(icon, option.value === "auto" ? "wand-sparkles" : option.value === "api" ? "cloud" : "terminal");
      card.createSpan({ cls: "qiaomu-agent-connect__card-label", text: option.label });
      card.createSpan({
        cls: "qiaomu-agent-connect__card-state",
        text: option.ready ? option.transport : "未连接",
      });
      if (option.value === this.selected) {
        const check = card.createSpan({ cls: "qiaomu-agent-connect__check" });
        setIcon(check, "check");
      }
      card.addEventListener("click", () => {
        this.selected = option.value;
        this.render();
      });
    }

    const option = this.options.find((item) => item.value === this.selected) ?? this.options[0];
    if (option) this.renderDetails(content, option);

    const privacy = content.createDiv({ cls: "qiaomu-agent-connect__privacy" });
    setIcon(privacy.createSpan(), "shield-check");
    privacy.createSpan({ text: "API Key 仅保存在 Obsidian 的本地 SecretStorage 中。" });

    const footer = content.createDiv({ cls: "qiaomu-agent-connect__footer" });
    const refresh = footer.createEl("button", { text: "重新检测" });
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      refresh.setText("检测中…");
      await this.plugin.refreshIntegrations();
      this.options = this.plugin.backendService.getConnectionOptions();
      new Notice("本地 Agent 检测完成");
      this.render();
    });
    const actions = footer.createDiv({ cls: "qiaomu-agent-connect__actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-cta", text: "使用此 Agent" });
    confirm.disabled = !option?.ready;
    confirm.addEventListener("click", () => {
      if (!option?.ready) return;
      this.onSelect(option.value);
      this.close();
    });
  }

  private renderDetails(content: HTMLElement, option: AgentConnectionOption): void {
    const details = content.createDiv({ cls: "qiaomu-agent-connect__details" });
    const heading = details.createDiv({ cls: "qiaomu-agent-connect__details-heading" });
    heading.createEl("strong", { text: option.ready ? `${option.label} 已就绪` : `${option.label} 尚未就绪` });
    heading.createSpan({ cls: option.ready ? "is-ready" : "is-warning", text: option.ready ? "可用" : "需配置" });
    details.createEl("p", { text: option.description });
    const facts = details.createDiv({ cls: "qiaomu-agent-connect__facts" });
    facts.createSpan({ text: option.transport });
    if (option.version) facts.createSpan({ text: option.version });
    if (!option.ready && option.value === "api") {
      details.createEl("p", { cls: "qiaomu-agent-connect__hint", text: "请在 设置 → 乔木 Agent 中填写 API Key 和模型名称。" });
    }
  }
}
