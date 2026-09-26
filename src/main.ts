import { MarkdownView, Menu, Notice, Platform, Plugin, TFile, WorkspaceLeaf, type Editor, type MarkdownFileInfo } from "obsidian";
import { ChatView, VIEW_TYPE_QIAOMU_AGENT } from "./chat-view";
import { DEFAULT_SETTINGS, normalizeSettings } from "./defaults";
import { BackendService } from "./services/backend-service";
import { discoverLocalClis } from "./services/cli-discovery";
import { SkillService } from "./services/skill-service";
import { ObsidianCliService } from "./services/obsidian-cli";
import { ADD_COMMANDS, type AddKind } from "./services/hotkeys";
import { QiaomuSettingTab } from "./settings-tab";
import type { QiaomuSettings } from "./types";
import { InlineEditModal } from "./ui/inline-edit-modal";
import { CapabilitiesModal } from "./ui/capabilities-modal";
import { ReadingContextService } from "./integrations/reading-context";
import { createAgentApi } from "./integrations/agent-api";
import { createHomeProvider } from "./integrations/home";
import { notifyHomeChanged, type HomeProvider } from "./integrations/qiaomu-home";
import type { AgentApi } from "./integrations/qiaomu-context";

export default class QiaomuAgentPlugin extends Plugin {
  override settings: QiaomuSettings = { ...DEFAULT_SETTINGS, api: { ...DEFAULT_SETTINGS.api } };
  backendService!: BackendService;
  skillService!: SkillService;
  obsidianCliService!: ObsidianCliService;
  /** What the user is reading in other plugins and views. */
  reading!: ReadingContextService;
  /** Found by other plugins at `app.plugins.plugins["qiaomu-agent"].api` (Qiaomu Context Protocol). */
  api!: AgentApi;
  /** Recent conversations and a "new conversation" action on Qiaomu Home (see integrations/qiaomu-home.ts). */
  qiaomuHome?: HomeProvider;

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    // A lone default connection is only kept as a provider when a key was actually saved for it.
    const api = this.settings.api;
    if (!this.settings.providers.some((p) => p.secretId === api.secretId) && this.app.secretStorage.getSecret(api.secretId)) {
      this.settings.providers.push({ ...api, id: this.settings.providers.some((p) => p.id === api.provider) ? `${api.provider}-legacy` : api.provider });
    }
    this.backendService = new BackendService(this.app, () => this.settings);
    this.skillService = new SkillService(this.app);
    this.obsidianCliService = new ObsidianCliService();

    this.registerView(VIEW_TYPE_QIAOMU_AGENT, (leaf) => new ChatView(leaf, this));
    this.reading = this.addChild(new ReadingContextService(this.app, VIEW_TYPE_QIAOMU_AGENT, () => this.eachView((view) => view.refreshReading())));
    this.api = createAgentApi({
      pin: (snapshot) => this.reading.pin(snapshot),
      open: (prompt) => this.activateView(prompt, true),
      compose: async (prompt, submit) => {
        await this.activateView();
        this.firstView()?.compose(prompt, submit);
      },
    });
    this.qiaomuHome = createHomeProvider(this);
    this.addSettingTab(new QiaomuSettingTab(this.app, this));

    this.addRibbonIcon("tree-deciduous", "打开乔木 Agent", () => void this.activateView());
    this.addCommand({
      id: "open-agent",
      name: "打开 Agent 对话",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "new-conversation",
      name: "新建 Agent 对话",
      callback: () => this.eachView((view) => view.newConversation()),
    });
    for (const [kind, command] of Object.entries(ADD_COMMANDS) as [AddKind, typeof ADD_COMMANDS[AddKind]][]) this.addCommand({
      id: command.id,
      name: command.name,
      callback: () => void this.activateView().then(() => this.eachView((view) => view.requestAdd(kind))),
    });
    this.addCommand({
      id: "manage-capabilities",
      name: "管理技能与工具连接",
      callback: () => new CapabilitiesModal(this.app, this).open(),
    });
    this.addCommand({
      id: "ask-about-selection",
      name: "询问选中的文本",
      editorCallback: (editor) => {
        const selection = editor.getSelection().trim();
        void this.activateView(selection ? `请分析这段内容：\n\n${selection}` : undefined);
      },
    });
    this.addCommand({
      id: "rewrite-selection-inline",
      name: "改写选中内容（预览后替换）",
      editorCheckCallback: (checking, editor, ctx) => {
        if (!editor.getSelection().trim() || !ctx.file) return false;
        if (!checking) this.openInlineEdit(editor, ctx);
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu: Menu, editor, ctx) => {
      if (!editor.getSelection().trim() || !ctx.file) return;
      menu.addItem((item) => item.setTitle("用乔木 Agent 改写选中内容…").setIcon("pencil-line")
        .setSection("action").onClick(() => this.openInlineEdit(editor, ctx)));
    }));

    this.app.workspace.onLayoutReady(() => {
      this.eachView((view) => void view.ensureReady());
      void this.refreshIntegrations();
    });
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.eachView((view) => void view.ensureReady());
      })
    );
    // Focus back in a note: its own selection is visible again, so drop our mirror highlight.
    this.registerDomEvent(document, "focusin", (event) => {
      if ((event.target as HTMLElement | null)?.closest?.(".cm-editor")) (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.delete("qiaomu-selection");
    });
    // CodeMirror changes the editor selection before the chat composer receives focus.
    this.registerDomEvent(document, "selectionchange", () => {
      this.eachView((view) => view.refreshSelection());
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.eachView((view) => view.refreshControls());
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.eachView((view) => view.refreshControls());
      })
    );
  }

  override onunload(): void {
    void this.backendService?.shutdown();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    notifyHomeChanged(this.app, this.manifest.id);
    this.eachView((view) => view.refreshControls());
  }

  async refreshIntegrations(): Promise<void> {
    const [detections, skills] = await Promise.all([
      discoverLocalClis(),
      this.skillService.refresh(this.settings.skillDirectories),
      this.obsidianCliService.detect(),
    ]);
    this.backendService.setDetections(detections);
    this.eachView((view) => view.refreshControls());
    if (skills.length > 0) console.debug(`Qiaomu Agent: loaded ${skills.length} skills`);
  }

  async activateView(prefill?: string, focus = false): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_QIAOMU_AGENT)[0];
    if (!leaf) {
      leaf = Platform.isDesktopApp ? this.app.workspace.getRightLeaf(false) ?? undefined : this.app.workspace.getLeaf("tab");
      await leaf?.setViewState({ type: VIEW_TYPE_QIAOMU_AGENT, active: true });
    }
    if (!leaf) {
      new Notice("无法创建乔木 Agent 侧边栏");
      return;
    }
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ChatView) {
      await view.ensureReady();
      if (prefill) view.setComposer(prefill);
      else if (focus) view.focusComposer();
    }
  }

  private openInlineEdit(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): void {
    const original = editor.getSelection();
    if (!original.trim() || !ctx.file) { new Notice("请先在笔记中选中要改写的文字"); return; }
    new InlineEditModal(this.app, this, {
      editor, path: ctx.file.path, from: editor.getCursor("from"), to: editor.getCursor("to"),
      original, document: editor.getValue(),
    }).open();
  }

  /**
   * The note on screen in the main area. When the main area shows something else (an article, a PDF,
   * a web page), no note is being looked at, so none is returned rather than an older one.
   */
  getActiveMarkdownFile(): TFile | null {
    const leaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    return leaf?.view instanceof MarkdownView && leaf.view.file?.extension === "md" ? leaf.view.file : null;
  }

  firstView(): ChatView | null {
    const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_QIAOMU_AGENT)[0]?.view;
    return view instanceof ChatView ? view : null;
  }

  private eachView(callback: (view: ChatView) => void): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QIAOMU_AGENT)) {
      if (leaf.view instanceof ChatView) callback(leaf.view);
    }
  }
}
