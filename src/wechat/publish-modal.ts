import { type App, Component, Modal, Notice, setIcon, Setting, type TFile } from "obsidian";
import type { WechatPublishSettings } from "../types";
import type { WechatAccount } from "./bridge-client";
import { WechatTransportRouter } from "./transport-router";
import { buildWechatHtml, listWechatThemes, resolveWechatTheme } from "./export-html";
import { type DraftMeta, metaFromFrontmatter, preflight, publishDraft, recordDraft, resolveCover } from "./publisher";
import { renderNoteForWechat, type ArticleImage, type RenderedNote } from "./render-note";
import { copyWechatHtml } from "./copy-html";

const PREVIEW_CSS = `:host{display:block}.frame{max-width:677px;margin:0 auto;padding:16px 12px;background:#fff;color:#1a1a1a}img{max-width:100%}`;

export class WechatPublishModal extends Modal {
  private readonly component = new Component();
  private note: RenderedNote | null = null;
  private meta: DraftMeta | null = null;
  private themeId: string;
  private wechatHtml = "";
  private accounts: WechatAccount[] = [];
  private client: WechatTransportRouter | null = null;
  private clientError = "";
  private abort: AbortController | null = null;
  private busy = false;
  private checksEl!: HTMLElement;
  private previewRoot!: ShadowRoot;
  private statusEl!: HTMLElement;
  private publishButton!: HTMLButtonElement;
  private copyButton!: HTMLButtonElement;

  constructor(app: App, private readonly file: TFile, private readonly settings: WechatPublishSettings) {
    super(app);
    this.themeId = settings.themeId;
  }

  override onOpen(): void {
    this.component.load();
    this.modalEl.addClass("qiaomu-wechat-modal");
    this.setTitle("发布到公众号草稿箱");
    this.statusEl = this.contentEl.createDiv({ cls: "qiaomu-wechat-status", text: "正在排版…" });
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    void this.load();
  }

  override onClose(): void {
    this.abort?.abort();
    this.note?.dispose();
    this.component.unload();
    this.contentEl.empty();
  }

  private async load(): Promise<void> {
    try {
      this.client = new WechatTransportRouter(this.app, this.settings);
      const [note, accounts] = await Promise.all([
        renderNoteForWechat(this.app, this.file, this.component),
        this.client.listAccounts().catch((error: unknown) => {
          this.clientError = `无法连接公众号：${error instanceof Error ? error.message : String(error)}`;
          return [] as WechatAccount[];
        }),
      ]);
      if (!this.contentEl.isConnected) { note.dispose(); return; }
      this.note = note;
      this.accounts = accounts;
      if (!accounts.length) this.clientError ||= this.client.errors.join("；") || "尚未连接公众号";
      this.meta = metaFromFrontmatter(note.frontmatter, note.title, {
        accountId: this.settings.defaultAccountId,
        author: this.settings.author,
        openComment: this.settings.openComment,
      });
      if (this.accounts.length && !this.accounts.some((account) => account.id === this.meta!.accountId)) this.meta.accountId = this.accounts[0]!.id;
      const themeField = [note.frontmatter.wechat_theme, note.frontmatter["公众号主题"]].find((value) => typeof value === "string");
      if (typeof themeField === "string" && listWechatThemes().some((theme) => theme.id === themeField)) this.themeId = themeField;
      this.renderForm();
    } catch (error) {
      this.statusEl.setText(`排版失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private renderForm(): void {
    const note = this.note!;
    const meta = this.meta!;
    this.statusEl.remove();
    const { contentEl } = this;
    const form = contentEl.createDiv({ cls: "qiaomu-wechat-form" });

    new Setting(form).setName("公众号").addDropdown((dropdown) => {
      if (this.accounts.length === 0) dropdown.addOption("", this.clientError ? "未连接" : "无可用公众号");
      for (const account of this.accounts) dropdown.addOption(account.id, account.name);
      dropdown.setValue(meta.accountId).onChange((value) => { meta.accountId = value; this.refreshChecks(); });
      dropdown.setDisabled(this.accounts.length === 0);
    });
    new Setting(form).setName("排版主题").addDropdown((dropdown) => {
      for (const theme of listWechatThemes()) dropdown.addOption(theme.id, theme.name);
      dropdown.setValue(resolveWechatTheme(this.themeId).id).onChange((value) => { this.themeId = value; this.renderPreview(); });
    });
    new Setting(form).setName("标题").addText((text) => {
      text.setValue(meta.title).onChange((value) => { meta.title = value.trim(); this.refreshChecks(); });
      text.inputEl.addClass("qiaomu-wechat-wide");
    });
    new Setting(form).setName("作者").addText((text) => text.setValue(meta.author).onChange((value) => { meta.author = value.trim(); this.refreshChecks(); }));
    new Setting(form).setName("摘要").setDesc("留空时公众号自动截取正文开头。").addTextArea((area) => {
      area.setValue(meta.digest).onChange((value) => { meta.digest = value.trim(); this.refreshChecks(); });
      area.inputEl.rows = 2;
      area.inputEl.addClass("qiaomu-wechat-wide");
    });
    new Setting(form).setName("封面").setDesc(this.coverLabel(note.images));

    this.checksEl = contentEl.createEl("ul", { cls: "qiaomu-wechat-checks" });
    this.checksEl.setAttribute("aria-label", "发布前检查");
    const preview = contentEl.createDiv({ cls: "qiaomu-wechat-preview" });
    preview.setAttribute("aria-label", "公众号排版预览");
    this.previewRoot = preview.attachShadow({ mode: "open" });

    const footer = contentEl.createDiv({ cls: "qiaomu-wechat-footer" });
    this.statusEl = footer.createDiv({ cls: "qiaomu-wechat-status" });
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    const actions = footer.createDiv({ cls: "qiaomu-wechat-actions" });
    this.copyButton = actions.createEl("button", { text: "复制公众号格式" });
    this.copyButton.addEventListener("click", () => void this.copy());
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    this.publishButton = actions.createEl("button", { text: "发到草稿箱", cls: "mod-cta" });
    this.publishButton.addEventListener("click", () => void this.publish());
    this.renderPreview();
  }

  private coverLabel(images: ArticleImage[]): string {
    const cover = resolveCover(this.app, this.file.path, this.meta!, images);
    if (!cover) return "未设置：请在属性中添加 cover，或在正文放一张图片。";
    if (this.meta!.cover) return `属性 cover：${this.meta!.cover}`;
    return `正文第一张图片：${cover.kind === "url" ? cover.url : cover.image.name}`;
  }

  private renderPreview(): void {
    if (!this.note) return;
    try {
      this.wechatHtml = buildWechatHtml(this.note.html, resolveWechatTheme(this.themeId));
    } catch (error) {
      this.wechatHtml = "";
      this.statusEl.setText(`排版失败：${error instanceof Error ? error.message : String(error)}`);
    }
    this.previewRoot.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = PREVIEW_CSS;
    const frame = document.createElement("div");
    frame.className = "frame";
    frame.innerHTML = this.wechatHtml;
    this.previewRoot.append(style, frame);
    this.refreshChecks();
  }

  private refreshChecks(): void {
    if (!this.note || !this.meta) return;
    const hasCover = Boolean(resolveCover(this.app, this.file.path, this.meta, this.note.images));
    const checks = preflight(this.meta, this.wechatHtml, hasCover, this.note.warnings);
    if (this.clientError) checks.unshift({ level: "error", message: this.clientError, fix: "在 设置 → 乔木 Agent → 发布 中连接公众号；也可以先复制公众号格式。" });
    this.checksEl.empty();
    for (const check of checks) {
      const item = this.checksEl.createEl("li", { cls: `is-${check.level}` });
      const icon = item.createSpan({ cls: "qiaomu-wechat-check-icon" });
      setIcon(icon, check.level === "error" ? "circle-x" : check.level === "warning" ? "triangle-alert" : "info");
      icon.setAttribute("aria-hidden", "true");
      item.createSpan({ text: check.fix ? `${check.message} ${check.fix}` : check.message });
    }
    this.checksEl.toggleClass("is-empty", checks.length === 0);
    const blocked = checks.some((check) => check.level === "error") || !this.wechatHtml;
    this.publishButton.disabled = blocked || this.busy;
    this.copyButton.disabled = !this.wechatHtml || this.busy;
  }

  private setBusy(busy: boolean, message = ""): void {
    this.busy = busy;
    this.statusEl.setText(message);
    this.refreshChecks();
  }

  private async copy(): Promise<void> {
    if (!this.note || !this.wechatHtml) return;
    this.setBusy(true, "正在准备复制…");
    try {
      await copyWechatHtml(this.app, this.wechatHtml, this.note.images);
      this.setBusy(false, "已复制，可粘贴到公众号编辑器。");
    } catch (error) {
      this.setBusy(false, `复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async publish(): Promise<void> {
    if (this.busy || !this.note || !this.meta || !this.client) return;
    this.abort = new AbortController();
    this.setBusy(true, "准备发送…");
    try {
      const result = await publishDraft({
        app: this.app,
        client: this.client,
        note: this.note,
        file: this.file,
        wechatHtml: this.wechatHtml,
        meta: this.meta,
        signal: this.abort.signal,
        onProgress: (message) => { if (this.contentEl.isConnected) this.statusEl.setText(message); },
      });
      if (this.settings.recordInNote) await recordDraft(this.app, this.file, this.meta.accountId, result.mediaId);
      new Notice(`已发送到「${result.accountName}」草稿箱，请在公众号后台检查后发布。`);
      this.close();
    } catch (error) {
      if (this.contentEl.isConnected) this.setBusy(false, `发送失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.abort = null;
    }
  }
}
