import { Menu, Notice, Platform, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { ChatView, VIEW_TYPE_QIAOMU_AGENT } from "./chat-view";
import { DEFAULT_SETTINGS, normalizeSettings } from "./defaults";
import { BackendService } from "./services/backend-service";
import { discoverLocalClis } from "./services/cli-discovery";
import { SkillService } from "./services/skill-service";
import { ObsidianCliService } from "./services/obsidian-cli";
import { QiaomuSettingTab } from "./settings-tab";
import type { QiaomuSettings } from "./types";
import { WechatPublishModal } from "./wechat/publish-modal";

export default class QiaomuAgentPlugin extends Plugin {
  override settings: QiaomuSettings = { ...DEFAULT_SETTINGS, api: { ...DEFAULT_SETTINGS.api } };
  backendService!: BackendService;
  skillService!: SkillService;
  obsidianCliService!: ObsidianCliService;
  private lastMarkdownFile: TFile | null = null;

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
    this.rememberActiveMarkdownFile();

    this.registerView(VIEW_TYPE_QIAOMU_AGENT, (leaf) => new ChatView(leaf, this));
    this.addSettingTab(new QiaomuSettingTab(this.app, this));

    this.addRibbonIcon("sparkles", "打开乔木 Agent", () => void this.activateView());
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
    this.addCommand({
      id: "ask-about-selection",
      name: "询问选中的文本",
      editorCallback: (editor) => {
        const selection = editor.getSelection().trim();
        void this.activateView(selection ? `请分析这段内容：\n\n${selection}` : undefined);
      },
    });

    this.addCommand({
      id: "publish-wechat-draft",
      name: "发布当前笔记到公众号草稿箱",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.extension !== "md") return false;
        if (!checking) this.openWechatPublish(file);
        return true;
      },
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((item) => item.setTitle("发布到公众号草稿箱").setIcon("send").setSection("action").onClick(() => this.openWechatPublish(file)));
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.rememberActiveMarkdownFile();
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
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.rememberActiveMarkdownFile();
        this.eachView((view) => view.refreshControls());
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file?.extension === "md") this.lastMarkdownFile = file;
        this.eachView((view) => view.refreshControls());
      })
    );
  }

  override onunload(): void {
    void this.backendService?.shutdown();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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

  async activateView(prefill?: string): Promise<void> {
    this.rememberActiveMarkdownFile();
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
    }
  }

  openWechatPublish(file: TFile): void {
    new WechatPublishModal(this.app, file, this.settings.wechat).open();
  }

  getActiveMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension === "md") this.lastMarkdownFile = file;
    return this.lastMarkdownFile;
  }

  private rememberActiveMarkdownFile(): void {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension === "md") {
      this.lastMarkdownFile = file;
      return;
    }
    if (this.lastMarkdownFile) return;
    for (const path of this.app.workspace.getLastOpenFiles()) {
      const recent = this.app.vault.getAbstractFileByPath(path);
      if (recent instanceof TFile && recent.extension === "md") {
        this.lastMarkdownFile = recent;
        return;
      }
    }
  }

  private eachView(callback: (view: ChatView) => void): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QIAOMU_AGENT)) {
      if (leaf.view instanceof ChatView) callback(leaf.view);
    }
  }
}
