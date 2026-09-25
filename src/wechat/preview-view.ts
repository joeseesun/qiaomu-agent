import { ItemView, Menu, TFile, type WorkspaceLeaf } from "obsidian";
import type QiaomuAgentPlugin from "../main";
import { buildWechatHtml, resolveWechatTheme } from "./export-html";
import { renderNoteForWechat, type RenderedNote } from "./render-note";

export const WECHAT_PREVIEW_VIEW = "qiaomu-wechat-preview";

/** A live, read-only companion to the current Markdown note. */
export class WechatPreviewView extends ItemView {
  private file: TFile | null = null;
  private note: RenderedNote | null = null;
  private timer: number | null = null;
  private generation = 0;
  private frame!: HTMLElement;
  private screen!: HTMLElement;
  private shadow!: ShadowRoot;
  private status!: HTMLElement;
  private phone = true;
  private dark = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: QiaomuAgentPlugin) { super(leaf); }
  getViewType(): string { return WECHAT_PREVIEW_VIEW; }
  getDisplayText(): string { return "公众号预览"; }
  override getIcon(): string { return "smartphone"; }

  override async onOpen(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "qiaomu-wechat-live-preview" });
    this.addAction("sparkles", "返回乔木 Agent", () => void this.plugin.activateView());
    this.addAction("sliders-horizontal", "预览选项", (event) => this.openOptions(event));
    this.addAction("send", "打开草稿发布与复制", () => { if (this.file) this.plugin.openWechatPublish(this.file); });
    this.status = root.createDiv({ cls: "qiaomu-wechat-preview-status", attr: { role: "status" } });
    this.frame = root.createDiv({ cls: "qiaomu-wechat-preview-frame is-phone" });
    const device = this.frame.createDiv({ cls: "qiaomu-wechat-preview-device" });
    device.createDiv({ cls: "qiaomu-wechat-preview-device-top", attr: { "aria-hidden": "true" } });
    this.screen = device.createDiv({ cls: "qiaomu-wechat-preview-screen" });
    this.shadow = this.screen.attachShadow({ mode: "open" });
    const resizeObserver = new ResizeObserver(() => this.syncPreviewScale());
    resizeObserver.observe(this.screen);
    this.register(() => resizeObserver.disconnect());
    device.createDiv({ cls: "qiaomu-wechat-preview-device-bottom", attr: { "aria-hidden": "true" } });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file.path === this.file?.path) this.schedule(); }));
    this.followActiveFile();
  }

  private openOptions(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("手机预览").setIcon("smartphone").setChecked(this.phone).onClick(() => {
      this.phone = true;
      this.frame.toggleClass("is-phone", true);
      this.syncPreviewScale();
    }));
    menu.addItem((item) => item.setTitle("宽幅预览").setIcon("panel-top").setChecked(!this.phone).onClick(() => {
      this.phone = false;
      this.frame.toggleClass("is-phone", false);
      this.syncPreviewScale();
    }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("深色模拟").setIcon("moon").setChecked(this.dark).onClick(() => {
      this.dark = !this.dark;
      this.frame.toggleClass("is-dark", this.dark);
      this.updateStatus();
    }));
    menu.showAtMouseEvent(event);
  }

  private updateStatus(): void {
    const warnings = this.note?.warnings.length ?? 0;
    this.status.setText([warnings ? `${warnings} 条排版提醒` : "", this.dark ? "深色仅为模拟" : ""].filter(Boolean).join(" · "));
  }

  /** Keep a 390 CSS-pixel article viewport when the phone mockup shrinks to fit the pane. */
  private syncPreviewScale(): void {
    const article = this.shadow?.querySelector<HTMLElement>(".article");
    if (!article || !this.screen?.clientWidth) return;
    article.style.width = this.phone ? "390px" : "";
    article.style.setProperty("zoom", this.phone ? String(this.screen.clientWidth / 390) : "1");
  }

  override async onClose(): Promise<void> {
    this.generation++;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.note?.dispose();
    this.note = null;
    this.contentEl.empty();
  }

  setFile(file: TFile): void { this.file = file; this.schedule(); }

  private followActiveFile(): void {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension === "md" && file.path !== this.file?.path) this.setFile(file);
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.refresh(); }, 350);
  }

  private async refresh(): Promise<void> {
    const file = this.file;
    if (!file || !this.frame?.isConnected) { if (this.status) this.status.setText("打开一篇 Markdown 笔记以预览。"); return; }
    const generation = ++this.generation;
    this.status.setText(`正在排版：${file.basename}`);
    try {
      const note = await renderNoteForWechat(this.app, file, this);
      if (generation !== this.generation || !this.frame.isConnected) { note.dispose(); return; }
      const html = buildWechatHtml(note.html, resolveWechatTheme(this.plugin.settings.wechat.themeId));
      this.note?.dispose();
      this.note = note;
      this.shadow.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = ":host{display:block}.article{box-sizing:border-box;padding:22px 12px 36px;background:#fff;color:#1a1a1a;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.article-header{margin:0 0 24px}.article-title{font-size:22px;line-height:1.4;font-weight:600;letter-spacing:0}.article-author{margin-top:12px;color:#777;font-size:14px;line-height:1.5}.article img{max-width:100%}";
      this.shadow.append(style);
      const article = document.createElement("div");
      article.className = "article";
      const heading = article.createDiv({ cls: "article-header" });
      heading.createDiv({ cls: "article-title", text: note.title });
      const author = note.frontmatter.author ?? note.frontmatter["作者"] ?? this.plugin.settings.wechat.author;
      if (typeof author === "string" && author.trim()) heading.createDiv({ cls: "article-author", text: author.trim() });
      article.createDiv({ cls: "article-content" }).innerHTML = html;
      this.shadow.append(article);
      this.syncPreviewScale();
      this.updateStatus();
    } catch (error) { if (generation === this.generation) this.status.setText(`预览失败：${error instanceof Error ? error.message : String(error)}`); }
  }
}
