import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Chat } from "@ai-sdk/react";
import type QiaomuAgentPlugin from "./main";
import type { AgentSkill, PermissionMode, ChatAttachment, ChatRequest, ModelChoice } from "./types";
import { FilePicker, ModelIdDialog, PromptManager, AppendDialog } from "./ui/host-dialogs";
import { readAttachment, validateAttachments, MAX_ATTACHMENT_BYTES } from "./services/attachments";
import { AgentConnectionModal } from "./agent-connection-modal";
import { AgentTransport, fromStoredMessage, toStoredMessage, messageText, type AgentMessage } from "./services/chat-transport";
import { ChatPanel } from "./ui/chat-panel";

export const VIEW_TYPE_QIAOMU_AGENT = "qiaomu-agent-view";

export class ChatView extends ItemView {
  chat!: Chat<AgentMessage>;
  private root: Root | null = null;
  private selectedSkill: AgentSkill | null = null;
  private selectedBackend = "auto";
  private attachNote = true;
  private prefill = "";
  private prefillVersion = 0;
  private statusText = "";
  private models: ModelChoice[] = [];
  private modelLoading = false;
  private modelGeneration = 0;
  private capabilitiesKey = "";
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly backendOwner = crypto.randomUUID();

  constructor(leaf: WorkspaceLeaf, readonly plugin: QiaomuAgentPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE_QIAOMU_AGENT; }
  getDisplayText(): string { return "乔木 Agent"; }
  override getIcon(): string { return "sparkles"; }
  override async onOpen(): Promise<void> { await this.ensureReady(); }

  async ensureReady(): Promise<void> {
    if (this.root) return;
    this.attachNote = this.plugin.settings.autoAttachActiveNote;
    this.contentEl.empty();
    this.contentEl.addClass("qiaomu-agent", "qiaomu-agent--react");
    this.chat = new Chat<AgentMessage>({
      messages: this.plugin.settings.lastConversation.map(fromStoredMessage),
      transport: new AgentTransport(async (messages, signal) => {
        // Capture every input before the first await: navigation cannot change this turn.
        const settings = this.plugin.settings;
        const backend = this.plugin.backendService.resolve(this.selectedBackend, this.backendOwner);
        const file = this.attachNote ? this.plugin.getActiveMarkdownFile() : null;
        const last = messages.at(-1);
        if (!last || last.role !== "user") throw new Error("没有待发送的用户消息");
        const parsed: unknown = backend.id === "api" ? {} : JSON.parse(settings.mcpConfig || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("MCP 配置需要是 JSON 对象");
        const request = {
          prompt: messageText(last), systemPrompt: settings.systemPrompt,
          cwd: this.plugin.skillService.getVaultRoot(),
          model: settings.modelSelections?.[this.selectionKey()]?.model || (backend.id === "api" ? settings.api.model : undefined),
          reasoningEffort: settings.modelSelections?.[this.selectionKey()]?.effort || undefined,
          attachments: last.metadata?.attachments,
          permissionMode: settings.permissionMode, skill: this.selectedSkill ?? undefined,
          activeFilePath: file?.path,
          mcpConfig: parsed as Record<string, unknown>,
          obsidianCli: settings.useObsidianCli ? this.plugin.obsidianCliService.getConnection() : undefined,
          history: messages.slice(0, -1).map(toStoredMessage),
        };
        validateAttachments(request.attachments ?? [], backend.id);
        const activeFileContent = file ? await this.app.vault.cachedRead(file) : undefined;
        signal.throwIfAborted();
        return { backend, request: { ...request, activeFileContent } };
      }),
      onData: (part) => {
        if (part.type === "data-status") { this.statusText = part.data; this.render(); }
      },
      onFinish: () => { this.statusText = ""; void this.persist(); this.render(); },
      onError: () => { this.statusText = ""; void this.persist(); this.render(); },
    });
    this.root = createRoot(this.contentEl);
    this.refreshControls();
  }

  override async onClose(): Promise<void> {
    this.modelGeneration++;
    if (!this.chat) return;
    await this.chat.stop();
    await this.plugin.backendService.release(this.backendOwner);
    await this.persist();
    this.root?.unmount();
    this.root = null;
  }

  setComposer(text: string): void { this.prefill = text; this.prefillVersion++; this.render(); }
  newConversation(): void {
    if (this.running()) return;
    // Existing conversation is archived before clearing, never silently discarded.
    const stored = this.chat.messages.map(toStoredMessage);
    if (stored.length) {
      this.plugin.settings.conversations = [
        { id: crypto.randomUUID(), title: stored.find((m) => m.role === "user")?.content.slice(0, 60) || "对话", messages: stored.slice(-80) },
        ...(this.plugin.settings.conversations ?? []),
      ].slice(0, 30);
    }
    this.chat.messages = [];
    this.chat.clearError();
    this.plugin.backendService.resetSessions(this.backendOwner);
    this.statusText = "";
    void this.persist();
    this.render();
  }
  refreshControls(): void {
    const settings = this.plugin.settings;
    const selected = this.plugin.backendService.effectiveSelection(settings.backendKind === "cli" && settings.preferredCli ? `cli:${settings.preferredCli}` : settings.backendKind);
    if (selected !== this.selectedBackend) { this.models = []; this.capabilitiesKey = ""; this.modelGeneration++; this.modelLoading = false; }
    this.selectedBackend = selected;
    this.render();
    const ready = this.plugin.backendService.getBackendOptions().find((option) => option.value === selected)?.ready;
    if (this.root && ready && !this.running() && !this.modelLoading) {
      const key = this.selectionKey();
      if (this.capabilitiesKey !== key && this.plugin.settings.modelSelections?.[key]) { this.capabilitiesKey = key; void this.openModels(false); }
    }
  }
  private selectionKey(): string {
    const backend = this.plugin.backendService.resolve(this.selectedBackend, this.backendOwner);
    const api = this.plugin.settings.api;
    return backend.id === "api" ? `api:${api.provider}:${api.baseUrl}` : backend.id;
  }
  private async openModels(showPicker = true, anchor?: { x: number; y: number }): Promise<void> {
    if (this.running() || this.modelLoading) return;
    const generation = ++this.modelGeneration;
    this.modelLoading = true; this.render();
    try {
      const backend = this.plugin.backendService.resolve(this.selectedBackend, this.backendOwner);
      const settings = this.plugin.settings;
      const key = this.selectionKey();
      const request: ChatRequest = { prompt: "", systemPrompt: settings.systemPrompt, cwd: this.plugin.skillService.getVaultRoot(), permissionMode: settings.permissionMode, history: [], mcpConfig: backend.id === "api" ? {} : JSON.parse(settings.mcpConfig || "{}") as Record<string, unknown> };
      let choices: ModelChoice[] = [];
      try { choices = await backend.listModels?.(request) ?? []; }
      catch (e) { new Notice(String(e)); }
      if (generation !== this.modelGeneration || !this.root) return;
      const configured = settings.modelSelections?.[key]?.model || (backend.id === "api" ? settings.api.model : "");
      if (configured && !choices.some((m) => m.id === configured)) choices.unshift({ id: configured, name: configured, efforts: [] });
      this.models = choices;
      if (!showPicker) return;
      const selectModel = (model: ModelChoice) => {
        if (this.running() || generation !== this.modelGeneration) return;
        settings.modelSelections ??= {};
        settings.modelSelections[key] = { model: model.id, effort: "" };
        this.plugin.backendService.resetSessions(this.backendOwner);
        void this.plugin.saveSettings(); this.render();
      };
      const manual = () => new ModelIdDialog(this.app, configured, selectModel).open();
      const menu = new Menu().setUseNativeMenu(false);
      for (const model of choices) menu.addItem((item) => item.setTitle(model.name).setChecked(model.id === configured).onClick(() => selectModel(model)));
      if (choices.length) menu.addSeparator();
      menu.addItem((item) => item.setTitle("输入模型 ID…").setIcon("pencil").onClick(manual));
      menu.showAtPosition(anchor ?? { x: 0, y: 0 }, this.contentEl.ownerDocument);
    } catch (e) { new Notice(String(e)); }
    finally { if (generation === this.modelGeneration) { this.modelLoading = false; this.render(); } }
  }
  private chooseFile(choose: (attachment: ChatAttachment) => void): void {
    new FilePicker(this.app, (file) => {
      if (file.stat.size > MAX_ATTACHMENT_BYTES) { new Notice("附件超过 5 MB 限制"); return; }
      void this.app.vault.readBinary(file).then((data) => readAttachment(new File([data], file.name), file.path)).then(choose).catch((e) => new Notice(String(e)));
    }).open();
  }
  private async append(text: string, daily: boolean): Promise<void> {
    if (!daily) { new FilePicker(this.app, (file) => new AppendDialog(this.app, file.path, text).open(), true).open(); return; }
    try {
      const cwd = this.plugin.skillService.getVaultRoot();
      if (!cwd) throw new Error("今日日记需要桌面 Obsidian CLI；此设备请使用指定文件追加");
      const path = (await this.plugin.obsidianCliService.run({ type: "daily-path" }, cwd)).trim();
      if (!path || path.includes("\n") || !path.endsWith(".md") || path.startsWith("/") || path.split("/").includes("..")) throw new Error("无法解析日记路径，请先启用日记插件");
      new AppendDialog(this.app, path, text, async () => {
        if (!this.app.vault.getAbstractFileByPath(path)) await this.plugin.obsidianCliService.run({ type: "daily-open" }, cwd);
      }).open();
    } catch (e) { new Notice(String(e)); }
  }
  private running(): boolean { return this.chat?.status === "submitted" || this.chat?.status === "streaming"; }

  private persist(): Promise<void> {
    const snapshot = this.chat.messages.slice(-80).map(toStoredMessage);
    this.persistQueue = this.persistQueue.catch(() => {}).then(async () => {
      this.plugin.settings.lastConversation = snapshot;
      await this.plugin.saveSettings();
    });
    return this.persistQueue.catch(() => { new Notice("对话保存失败，请勿关闭窗口"); });
  }
  private openConnection(): void {
    new AgentConnectionModal(this.app, this.plugin, this.selectedBackend, (value) => {
      if (this.running()) return;
      this.plugin.settings.backendKind = value.startsWith("cli:") ? "cli" : value === "api" ? "api" : "auto";
      if (value.startsWith("cli:")) this.plugin.settings.preferredCli = value.slice(4);
      void this.plugin.saveSettings();
    }).open();
  }
  private openSkillMenu(event: MouseEvent): void {
    const menu = new Menu();
    const choose = (skill: AgentSkill | null) => { if (!this.running()) { this.selectedSkill = skill; this.render(); } };
    menu.addItem((item) => item.setTitle("不使用技能").setChecked(!this.selectedSkill).onClick(() => choose(null)));
    for (const skill of this.plugin.skillService.list()) menu.addItem((item) => item.setTitle(skill.name).setChecked(skill.path === this.selectedSkill?.path).onClick(() => choose(skill)));
    menu.showAtMouseEvent(event);
  }
  private openHistory(event: MouseEvent): void {
    const menu = new Menu();
    const history = this.plugin.settings.conversations ?? [];
    if (!history.length) menu.addItem((item) => item.setTitle("暂无历史对话").setDisabled(true));
    for (const entry of history) menu.addItem((item) => item.setTitle(entry.title).onClick(() => {
      if (this.running()) return;
      this.newConversation();
      this.chat.messages = entry.messages.map(fromStoredMessage);
      void this.persist(); this.render();
    }));
    menu.showAtMouseEvent(event);
  }
  private render(): void {
    if (!this.root) return;
    const file = this.plugin.getActiveMarkdownFile();
    const label = this.plugin.backendService.getBackendOptions().find((o) => o.value === this.selectedBackend)?.label.replace(/\s*·.*$/, "") || "连接 Agent";
    let key = ""; try { key = this.selectionKey(); } catch { /* connection can be unavailable */ }
    const selection = this.plugin.settings.modelSelections?.[key];
    const model = this.models.find((m) => m.id === selection?.model);
    this.root.render(createElement(ChatPanel, {
      chat: this.chat, app: this.app, parent: this,
      backendLabel: this.modelLoading ? "加载模型…" : model?.name || selection?.model || (key.startsWith("api:") ? this.plugin.settings.api.model : `${label} 默认模型`), skillLabel: this.selectedSkill?.name || "技能",
      efforts: model?.efforts ?? (selection?.effort ? [selection.effort] : []), effort: selection?.effort ?? "", modelLoading: this.modelLoading,
      onModels: (anchor: { x: number; y: number }) => void this.openModels(true, anchor),
      onEffort: (effort: string) => { if (this.running() || !selection) return; selection.effort = effort; this.plugin.backendService.resetSessions(this.backendOwner); void this.plugin.saveSettings(); },
      customPrompts: this.plugin.settings.customPrompts ?? [],
      onManagePrompts: () => new PromptManager(this.app, [...(this.plugin.settings.customPrompts ?? [])], async (prompts) => { this.plugin.settings.customPrompts = prompts; await this.plugin.saveSettings(); }).open(),
      onPickFile: (choose: (attachment: ChatAttachment) => void) => this.chooseFile(choose),
      onValidateAttachments: (attachments: ChatAttachment[]) => validateAttachments(attachments, this.plugin.backendService.resolve(this.selectedBackend, this.backendOwner).id),
      onAppend: (text: string, daily: boolean) => void this.append(text, daily),
      permission: this.plugin.settings.permissionMode, note: this.attachNote ? file : null,
      statusText: this.statusText, prompts: this.plugin.settings.quickPrompts,
      prefill: this.prefill, prefillVersion: this.prefillVersion,
      onConnection: () => this.openConnection(), onNew: () => this.newConversation(),
      onHistory: (event: MouseEvent) => this.openHistory(event),
      onSkill: (event: MouseEvent) => this.openSkillMenu(event),
      onPermission: (mode: PermissionMode) => { this.plugin.settings.permissionMode = mode; void this.plugin.saveSettings(); },
      onToggleNote: () => { this.attachNote = !this.attachNote; this.render(); },
      onPersist: () => this.persist(),
    }));
  }
}
