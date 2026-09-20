import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { ChatView, VIEW_TYPE_QIAOMU_AGENT } from "./chat-view";
import { DEFAULT_SETTINGS, normalizeSettings } from "./defaults";
import { BackendService } from "./services/backend-service";
import { discoverLocalClis } from "./services/cli-discovery";
import { SkillService } from "./services/skill-service";
import { ObsidianCliService } from "./services/obsidian-cli";
import { QiaomuSettingTab } from "./settings-tab";
import type { QiaomuSettings } from "./types";

export default class QiaomuAgentPlugin extends Plugin {
  override settings: QiaomuSettings = { ...DEFAULT_SETTINGS, api: { ...DEFAULT_SETTINGS.api } };
  backendService!: BackendService;
  skillService!: SkillService;
  obsidianCliService!: ObsidianCliService;

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.backendService = new BackendService(this.app, () => this.settings);
    this.skillService = new SkillService(this.app);
    this.obsidianCliService = new ObsidianCliService();

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

    this.app.workspace.onLayoutReady(() => {
      void this.refreshIntegrations();
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.eachView((view) => view.refreshControls()))
    );
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
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_QIAOMU_AGENT)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
      await leaf?.setViewState({ type: VIEW_TYPE_QIAOMU_AGENT, active: true });
    }
    if (!leaf) {
      new Notice("无法创建乔木 Agent 侧边栏");
      return;
    }
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ChatView && prefill) view.setComposer(prefill);
  }

  getActiveMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file?.extension === "md" ? file : null;
  }

  private eachView(callback: (view: ChatView) => void): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QIAOMU_AGENT)) {
      if (leaf.view instanceof ChatView) callback(leaf.view);
    }
  }
}
