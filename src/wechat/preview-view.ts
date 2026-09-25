import { ItemView, MarkdownView, Menu, TFile, type WorkspaceLeaf } from "obsidian";
import type QiaomuAgentPlugin from "../main";
import { buildWechatHtml, listWechatThemes, resolveWechatTheme } from "./export-html";
import { renderNoteForWechat, type RenderedNote } from "./render-note";
import { copyWechatHtml } from "./copy-html";
import { mapScrollTop } from "./scroll-sync";

export const WECHAT_PREVIEW_VIEW = "qiaomu-wechat-preview";

/** A live, read-only companion to the current Markdown note. */
export class WechatPreviewView extends ItemView {
  private file: TFile | null = null;
  private note: RenderedNote | null = null;
  private timer: number | null = null;
  private generation = 0;
  private wechatHtml = "";
  private frame!: HTMLElement;
  private shadow!: ShadowRoot;
  private status!: HTMLElement;
  private phone = true;
  private dark = false;
  private scrollSync = true;
  private sourceView: MarkdownView | null = null;
  private pendingSourceTop = -1;
  private pendingPreviewTop = -1;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: QiaomuAgentPlugin) { super(leaf); }
  getViewType(): string { return WECHAT_PREVIEW_VIEW; }
  getDisplayText(): string { return "公众号预览"; }
  override getIcon(): string { return "smartphone"; }

  override async onOpen(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "qiaomu-wechat-live-preview" });
    this.addAction("sparkles", "返回乔木 Agent", () => void this.plugin.activateView());
    this.addAction("sliders-horizontal", "预览选项", (event) => this.openOptions(event));
    this.addAction("copy", "复制公众号格式", () => void this.copy());
    this.addAction("send", "打开草稿发布", () => { if (this.file) this.plugin.openWechatPublish(this.file); });
    this.status = root.createDiv({ cls: "qiaomu-wechat-preview-status", attr: { role: "status" } });
    this.frame = root.createDiv({ cls: "qiaomu-wechat-preview-frame is-phone" });
    this.shadow = this.frame.createDiv({ cls: "qiaomu-wechat-preview-paper" }).attachShadow({ mode: "open" });
    this.registerDomEvent(this.frame, "scroll", this.onPreviewScroll, { passive: true });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.bindMatchingSource()));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file.path === this.file?.path) this.schedule(); }));
    this.followActiveFile();
  }

  private openOptions(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("手机宽度").setIcon("smartphone").setChecked(this.phone).onClick(() => {
      this.phone = true;
      this.frame.toggleClass("is-phone", true);
    }));
    menu.addItem((item) => item.setTitle("宽幅预览").setIcon("panel-top").setChecked(!this.phone).onClick(() => {
      this.phone = false;
      this.frame.toggleClass("is-phone", false);
    }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("同步滚动").setIcon("arrow-down-up").setChecked(this.scrollSync).onClick(() => {
      this.scrollSync = !this.scrollSync;
      if (this.scrollSync) this.syncFromSource();
    }));
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

  private getSourceScroller(): HTMLElement | null {
    const view = this.sourceView;
    if (!view || view.file?.path !== this.file?.path) return null;
    const selector = view.getMode() === "preview" ? ".markdown-preview-view" : ".cm-scroller";
    const scroller = view.containerEl.querySelector<HTMLElement>(selector);
    return scroller?.clientHeight ? scroller : null;
  }

  private bindSource(view: MarkdownView | null): void {
    if (view === this.sourceView) return;
    this.sourceView?.containerEl.removeEventListener("scroll", this.onSourceScroll, true);
    this.sourceView = view;
    this.pendingSourceTop = -1;
    this.pendingPreviewTop = -1;
    view?.containerEl.addEventListener("scroll", this.onSourceScroll, { capture: true, passive: true });
    if (view) this.syncFromSource();
  }

  private bindMatchingSource(): void {
    const file = this.file;
    if (!file) return;
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === file.path) { this.bindSource(active); return; }
    if (this.getSourceScroller()) return;
    const matching = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === file.path)
      .find((view) => {
        const selector = view.getMode() === "preview" ? ".markdown-preview-view" : ".cm-scroller";
        return Boolean(view.containerEl.querySelector<HTMLElement>(selector)?.clientHeight);
      });
    this.bindSource(matching ?? null);
  }

  private readonly onSourceScroll = (event: Event): void => {
    if (!this.scrollSync || event.target !== this.getSourceScroller()) return;
    const source = event.target as HTMLElement;
    if (this.pendingSourceTop >= 0 && Math.abs(source.scrollTop - this.pendingSourceTop) < 2) {
      this.pendingSourceTop = -1;
      return;
    }
    this.pendingSourceTop = -1;
    this.syncFromSource();
  };

  private readonly onPreviewScroll = (): void => {
    if (!this.scrollSync) return;
    if (this.pendingPreviewTop >= 0 && Math.abs(this.frame.scrollTop - this.pendingPreviewTop) < 2) {
      this.pendingPreviewTop = -1;
      return;
    }
    this.pendingPreviewTop = -1;
    const source = this.getSourceScroller();
    if (!source) return;
    const target = mapScrollTop(this.frame.scrollTop, this.frame.scrollHeight - this.frame.clientHeight, source.scrollHeight - source.clientHeight);
    if (Math.abs(source.scrollTop - target) < 2) return;
    this.pendingSourceTop = target;
    source.scrollTop = target;
  };

  private syncFromSource(): void {
    if (!this.scrollSync || !this.wechatHtml) return;
    const source = this.getSourceScroller();
    if (!source) return;
    const target = mapScrollTop(source.scrollTop, source.scrollHeight - source.clientHeight, this.frame.scrollHeight - this.frame.clientHeight);
    if (Math.abs(this.frame.scrollTop - target) < 2) return;
    this.pendingPreviewTop = target;
    this.frame.scrollTop = target;
  }

  private async copy(): Promise<void> {
    if (!this.note || !this.wechatHtml) return;
    this.status.setText("正在准备复制…");
    try {
      await copyWechatHtml(this.app, this.wechatHtml, this.note.images);
      this.status.setText("已复制，可粘贴到公众号编辑器。");
    } catch (error) {
      this.status.setText(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  override async onClose(): Promise<void> {
    this.generation++;
    this.bindSource(null);
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.note?.dispose();
    this.note = null;
    this.contentEl.empty();
  }

  setFile(file: TFile): void { this.file = file; this.bindMatchingSource(); this.schedule(); }

  private followActiveFile(): void {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = active?.file ?? this.app.workspace.getActiveFile();
    if (file?.extension !== "md") return;
    if (file.path !== this.file?.path) this.setFile(file);
    else if (active) this.bindSource(active);
  }

  private schedule(): void {
    this.generation++;
    this.wechatHtml = "";
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.refresh(); }, 350);
  }

  private async refresh(): Promise<void> {
    const file = this.file;
    if (!file || !this.frame?.isConnected) { if (this.status) this.status.setText("打开一篇 Markdown 笔记以预览。"); return; }
    const generation = ++this.generation;
    this.wechatHtml = "";
    this.status.setText(`正在排版：${file.basename}`);
    try {
      const note = await renderNoteForWechat(this.app, file, this);
      if (generation !== this.generation || !this.frame.isConnected) { note.dispose(); return; }
      const themeField = [note.frontmatter.wechat_theme, note.frontmatter["公众号主题"]].find((value) => typeof value === "string");
      const themeId = typeof themeField === "string" && listWechatThemes().some((theme) => theme.id === themeField)
        ? themeField : this.plugin.settings.wechat.themeId;
      const html = buildWechatHtml(note.html, resolveWechatTheme(themeId));
      this.note?.dispose();
      this.note = note;
      this.wechatHtml = html;
      this.shadow.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = ":host{display:block}.article{box-sizing:border-box;padding:22px 12px 36px;background:#fff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.article img{max-width:100%}";
      this.shadow.append(style);
      const article = document.createElement("div");
      article.className = "article";
      article.innerHTML = html;
      this.shadow.append(article);
      this.updateStatus();
      this.syncFromSource();
    } catch (error) { if (generation === this.generation) this.status.setText(`预览失败：${error instanceof Error ? error.message : String(error)}`); }
  }
}
