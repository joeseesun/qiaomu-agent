import { Component, ItemView, MarkdownRenderer, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type QiaomuAgentPlugin from "./main";
import type { AgentSkill, ChatMessage } from "./types";
import { createId } from "./utils";

export const VIEW_TYPE_QIAOMU_AGENT = "qiaomu-agent-view";

export class ChatView extends ItemView {
  private messages: ChatMessage[] = [];
  private messagesEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private backendSelect!: HTMLSelectElement;
  private textarea!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private contextEl!: HTMLElement;
  private skillButton!: HTMLButtonElement;
  private selectedSkill: AgentSkill | null = null;
  private selectedBackend = "auto";
  private abortController: AbortController | null = null;
  private renderComponents = new Map<string, Component>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: QiaomuAgentPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_QIAOMU_AGENT;
  }

  getDisplayText(): string {
    return "乔木 Agent";
  }

  override getIcon(): string {
    return "sparkles";
  }

  override async onOpen(): Promise<void> {
    this.messages = [...this.plugin.settings.lastConversation];
    const root = this.contentEl;
    root.empty();
    root.addClass("qiaomu-agent");

    const header = root.createDiv({ cls: "qiaomu-agent__header" });
    const identity = header.createDiv({ cls: "qiaomu-agent__identity" });
    identity.createDiv({ cls: "qiaomu-agent__mark", text: "乔" });
    const heading = identity.createDiv();
    heading.createEl("h2", { text: "乔木 Agent" });
    heading.createDiv({ cls: "qiaomu-agent__subtitle", text: "与知识库一起思考" });

    const actions = header.createDiv({ cls: "qiaomu-agent__header-actions" });
    this.backendSelect = actions.createEl("select", { cls: "qiaomu-agent__backend" });
    this.backendSelect.addEventListener("change", () => {
      this.selectedBackend = this.backendSelect.value;
    });
    const newButton = actions.createEl("button", { cls: "qiaomu-agent__new", text: "新对话" });
    newButton.addEventListener("click", () => this.newConversation());

    this.messagesEl = root.createDiv({ cls: "qiaomu-agent__messages" });
    this.emptyEl = this.messagesEl.createDiv({ cls: "qiaomu-agent__empty" });
    this.renderEmptyState();
    for (const message of this.messages) await this.renderMessage(message);

    this.buildComposer(root);
    this.refreshControls();
    this.updateEmptyState();
  }

  override async onClose(): Promise<void> {
    this.abortController?.abort();
    this.releaseRenderers();
  }

  setComposer(text: string): void {
    this.textarea.value = text;
    this.resizeComposer();
    this.textarea.focus();
  }

  newConversation(): void {
    if (this.abortController) this.abortController.abort();
    this.messages = [];
    this.plugin.settings.lastConversation = [];
    this.releaseRenderers();
    this.messagesEl.querySelectorAll(".qiaomu-agent__message").forEach((element) => element.remove());
    this.updateEmptyState();
    this.setStatus("新对话已开始");
    void this.plugin.saveSettings();
  }

  refreshControls(): void {
    if (!this.backendSelect) return;
    const current = this.selectedBackend;
    this.backendSelect.empty();
    for (const option of this.plugin.backendService.getBackendOptions()) {
      const element = this.backendSelect.createEl("option", {
        value: option.value,
        text: option.ready ? option.label : `${option.label}（未配置）`,
      });
      element.disabled = !option.ready && option.value !== "auto";
    }
    const fallback = this.plugin.settings.backendKind === "cli" && this.plugin.settings.preferredCli
      ? `cli:${this.plugin.settings.preferredCli}`
      : this.plugin.settings.backendKind;
    const values = Array.from(this.backendSelect.options).map((option) => option.value);
    this.selectedBackend = values.includes(current) ? current : values.includes(fallback) ? fallback : "auto";
    this.backendSelect.value = this.selectedBackend;
    this.updateContext();
  }

  private buildComposer(root: HTMLElement): void {
    const composer = root.createDiv({ cls: "qiaomu-agent__composer" });
    const contextRow = composer.createDiv({ cls: "qiaomu-agent__context-row" });
    this.contextEl = contextRow.createDiv({ cls: "qiaomu-agent__context" });

    this.skillButton = contextRow.createEl("button", { cls: "qiaomu-agent__chip", text: "技能" });
    this.skillButton.addEventListener("click", (event) => this.openSkillMenu(event));

    const mode = contextRow.createEl("select", { cls: "qiaomu-agent__mode" });
    mode.createEl("option", { value: "plan", text: "仅建议" });
    mode.createEl("option", { value: "edit", text: "允许修改" });
    mode.value = this.plugin.settings.permissionMode;
    mode.addEventListener("change", () => {
      this.plugin.settings.permissionMode = mode.value === "edit" ? "edit" : "plan";
      void this.plugin.saveSettings();
    });

    const inputRow = composer.createDiv({ cls: "qiaomu-agent__input-row" });
    this.textarea = inputRow.createEl("textarea", {
      cls: "qiaomu-agent__input",
      attr: { placeholder: "询问、整理或修改你的知识库…", rows: "1" },
    });
    this.textarea.addEventListener("input", () => this.resizeComposer());
    this.textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.submit();
      }
    });

    this.sendButton = inputRow.createEl("button", { cls: "qiaomu-agent__send" });
    setIcon(this.sendButton, "arrow-up");
    this.sendButton.createSpan({ cls: "qiaomu-agent__sr-only", text: "发送" });
    this.sendButton.addEventListener("click", () => {
      if (this.abortController) this.abortController.abort();
      else void this.submit();
    });

    this.statusEl = composer.createDiv({ cls: "qiaomu-agent__status", text: "准备就绪" });
  }

  private renderEmptyState(): void {
    this.emptyEl.empty();
    this.emptyEl.createDiv({ cls: "qiaomu-agent__empty-mark", text: "乔" });
    this.emptyEl.createEl("h3", { text: "从当前笔记开始" });
    this.emptyEl.createEl("p", { text: "我可以阅读、整理和协助修改库内内容。" });
    const prompts = this.emptyEl.createDiv({ cls: "qiaomu-agent__quick-prompts" });
    for (const prompt of this.plugin.settings.quickPrompts.slice(0, 4)) {
      const button = prompts.createEl("button", { text: prompt });
      button.addEventListener("click", () => {
        this.setComposer(prompt);
        void this.submit();
      });
    }
  }

  private async submit(): Promise<void> {
    const prompt = this.textarea.value.trim();
    if (!prompt || this.abortController) return;

    let mcpConfig: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(this.plugin.settings.mcpConfig || "{}");
      if (parsed && typeof parsed === "object") mcpConfig = parsed as Record<string, unknown>;
    } catch {
      new Notice("MCP 配置不是有效 JSON，请在设置中修正");
      return;
    }

    const history = [...this.messages];
    const userMessage: ChatMessage = { id: createId(), role: "user", content: prompt, createdAt: Date.now() };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    this.messages.push(userMessage, assistantMessage);
    this.textarea.value = "";
    this.resizeComposer();
    this.updateEmptyState();
    await this.renderMessage(userMessage);
    const assistantEl = await this.renderMessage(assistantMessage);
    this.setRunning(true);

    try {
      const backend = this.plugin.backendService.resolve(this.selectedBackend);
      assistantMessage.backend = backend.label;
      const activeFile = this.plugin.settings.autoAttachActiveNote ? this.plugin.getActiveMarkdownFile() : null;
      const activeFileContent = activeFile ? await this.app.vault.cachedRead(activeFile) : undefined;
      this.abortController = new AbortController();
      let renderTimer: number | null = null;
      const scheduleRender = (): void => {
        if (renderTimer !== null) return;
        renderTimer = window.setTimeout(() => {
          renderTimer = null;
          void this.renderMessageContent(assistantMessage, assistantEl);
        }, 90);
      };
      await backend.send(
        {
          prompt,
          systemPrompt: this.plugin.settings.systemPrompt,
          cwd: this.plugin.skillService.getVaultRoot(),
          model: backend.id === "api" ? this.plugin.settings.api.model : undefined,
          permissionMode: this.plugin.settings.permissionMode,
          activeFilePath: activeFile?.path,
          activeFileContent,
          skill: this.selectedSkill ?? undefined,
          mcpConfig,
          history,
        },
        {
          onText: (text) => {
            assistantMessage.content += text;
            scheduleRender();
          },
          onStatus: (status) => this.setStatus(status),
        },
        this.abortController.signal
      );
      if (renderTimer !== null) window.clearTimeout(renderTimer);
      if (!assistantMessage.content) assistantMessage.content = "已完成，但模型没有返回可显示的文本。";
      await this.renderMessageContent(assistantMessage, assistantEl);
      this.setStatus(`完成 · ${backend.label}`);
    } catch (error) {
      const aborted = this.abortController?.signal.aborted;
      assistantMessage.content = aborted
        ? `${assistantMessage.content}\n\n_已停止_`.trim()
        : `运行失败：${error instanceof Error ? error.message : String(error)}`;
      await this.renderMessageContent(assistantMessage, assistantEl);
      this.setStatus(aborted ? "已停止" : "运行失败");
    } finally {
      this.abortController = null;
      this.setRunning(false);
      this.plugin.settings.lastConversation = this.messages.slice(-80);
      await this.plugin.saveSettings();
    }
  }

  private async renderMessage(message: ChatMessage): Promise<HTMLElement> {
    const article = this.messagesEl.createEl("article", {
      cls: `qiaomu-agent__message qiaomu-agent__message--${message.role}`,
    });
    const meta = article.createDiv({ cls: "qiaomu-agent__message-meta" });
    meta.createSpan({ text: message.role === "user" ? "你" : message.backend || "乔木" });
    const content = article.createDiv({ cls: "qiaomu-agent__message-content" });
    await this.renderMessageContent(message, content);
    this.scrollToBottom();
    return content;
  }

  private async renderMessageContent(message: ChatMessage, element: HTMLElement): Promise<void> {
    const previous = this.renderComponents.get(message.id);
    if (previous) {
      this.removeChild(previous);
      this.renderComponents.delete(message.id);
    }
    element.empty();
    if (!message.content) {
      element.createDiv({ cls: "qiaomu-agent__thinking", text: "正在思考…" });
      return;
    }
    const component = new Component();
    this.addChild(component);
    this.renderComponents.set(message.id, component);
    const sourcePath = this.plugin.getActiveMarkdownFile()?.path ?? "";
    await MarkdownRenderer.render(this.app, message.content, element, sourcePath, component);
    this.scrollToBottom();
  }

  private openSkillMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle("不使用技能").setChecked(!this.selectedSkill).onClick(() => this.selectSkill(null))
    );
    for (const skill of this.plugin.skillService.list()) {
      menu.addItem((item) =>
        item.setTitle(skill.name).setChecked(this.selectedSkill?.path === skill.path).onClick(() => this.selectSkill(skill))
      );
    }
    if (this.plugin.skillService.list().length === 0) {
      menu.addSeparator();
      menu.addItem((item) => item.setTitle("未发现技能").setDisabled(true));
    }
    menu.showAtMouseEvent(event);
  }

  private selectSkill(skill: AgentSkill | null): void {
    this.selectedSkill = skill;
    this.skillButton.setText(skill ? `技能：${skill.name}` : "技能");
  }

  private updateContext(): void {
    if (!this.contextEl) return;
    const file = this.plugin.getActiveMarkdownFile();
    this.contextEl.setText(
      this.plugin.settings.autoAttachActiveNote && file ? `上下文：${file.basename}` : "未附加当前笔记"
    );
  }

  private updateEmptyState(): void {
    this.emptyEl.toggle(this.messages.length === 0);
  }

  private setRunning(running: boolean): void {
    this.sendButton.empty();
    setIcon(this.sendButton, running ? "square" : "arrow-up");
    this.sendButton.createSpan({ cls: "qiaomu-agent__sr-only", text: running ? "停止" : "发送" });
    this.backendSelect.disabled = running;
  }

  private setStatus(status: string): void {
    this.statusEl.setText(status);
  }

  private resizeComposer(): void {
    this.textarea.style.height = "auto";
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 180)}px`;
  }

  private scrollToBottom(): void {
    window.requestAnimationFrame(() => this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight }));
  }

  private releaseRenderers(): void {
    for (const component of this.renderComponents.values()) {
      this.removeChild(component);
    }
    this.renderComponents.clear();
  }
}
