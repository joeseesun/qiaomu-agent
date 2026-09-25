import { ItemView, setIcon, TFile, type WorkspaceLeaf } from "obsidian";
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
    const toolbar = root.createDiv({ cls: "qiaomu-wechat-preview-toolbar" });
    const phoneButton = toolbar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "切换手机宽度预览" } });
    setIcon(phoneButton, "smartphone");
    phoneButton.onclick = () => { this.phone = !this.phone; this.frame.toggleClass("is-phone", this.phone); phoneButton.setAttribute("aria-pressed", String(this.phone)); };
    phoneButton.setAttribute("aria-pressed", "true");
    const darkButton = toolbar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "切换微信深色模式模拟" } });
    setIcon(darkButton, "moon");
    darkButton.onclick = () => { this.dark = !this.dark; this.frame.toggleClass("is-dark", this.dark); darkButton.setAttribute("aria-pressed", String(this.dark)); };
    darkButton.setAttribute("aria-pressed", "false");
    const sendButton = toolbar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "打开草稿发布与复制" } });
    setIcon(sendButton, "send");
    sendButton.onclick = () => { if (this.file) this.plugin.openWechatPublish(this.file); };
    this.status = root.createDiv({ cls: "qiaomu-wechat-preview-status", attr: { role: "status" } });
    this.frame = root.createDiv({ cls: "qiaomu-wechat-preview-frame is-phone" });
    this.shadow = this.frame.attachShadow({ mode: "open" });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file.path === this.file?.path) this.schedule(); }));
    this.followActiveFile();
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
      style.textContent = ":host{display:block}.article{box-sizing:border-box;padding:18px 14px;background:#fff;color:#1a1a1a;min-height:100%}.article img{max-width:100%}";
      this.shadow.append(style);
      const article = document.createElement("div");
      article.className = "article";
      article.innerHTML = html;
      this.shadow.append(article);
      this.status.setText(note.warnings.length ? `预览完成 · ${note.warnings.length} 条排版提醒 · 深色模式为模拟` : "预览完成 · 深色模式为模拟");
    } catch (error) { if (generation === this.generation) this.status.setText(`预览失败：${error instanceof Error ? error.message : String(error)}`); }
  }
}
