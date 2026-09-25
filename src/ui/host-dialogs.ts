import { App, ButtonComponent, FuzzySuggestModal, Modal, Setting, Notice, TFile, TFolder } from "obsidian";
import type { PromptTemplate } from "../types";
import { appendReply, undoReply } from "../services/note-actions";

export class FilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly choose: (file: TFile) => void, private readonly markdownOnly = false) { super(app); this.setPlaceholder("搜索文件名或路径…"); }
  getItems(): TFile[] { return this.markdownOnly ? this.app.vault.getMarkdownFiles() : this.app.vault.getFiles(); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}
export class FolderPicker extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private readonly choose: (folder: TFolder) => void) { super(app); this.setPlaceholder("搜索文件夹…"); }
  getItems(): TFolder[] { return this.app.vault.getAllLoadedFiles().filter((item): item is TFolder => item instanceof TFolder && !item.isRoot()); }
  getItemText(folder: TFolder): string { return folder.path; }
  onChooseItem(folder: TFolder): void { this.choose(folder); }
}
export class PromptManager extends Modal {
  constructor(app: App, private readonly prompts: PromptTemplate[], private readonly save: (prompts: PromptTemplate[]) => Promise<void>, private readonly draft = "") { super(app); }
  override onOpen(): void { if (this.draft.trim()) this.edit({ id: crypto.randomUUID(), name: "", body: this.draft }); else this.draw(); }
  private async update(next: PromptTemplate[]): Promise<void> {
    await this.save(next);
    this.prompts.splice(0, this.prompts.length, ...next);
    this.draw();
  }
  private draw(): void {
    this.contentEl.empty(); this.titleEl.setText("Prompt 库");
    if (!this.prompts.length) this.contentEl.createEl("p", { text: "还没有保存的 Prompt。" });
    for (const [index, item] of this.prompts.entries()) new Setting(this.contentEl).setName(item.name)
      .setDesc(item.body.length > 90 ? `${item.body.slice(0, 90)}…` : item.body)
      .addExtraButton((b) => b.setIcon(item.pinned ? "pin-off" : "pin").setTooltip(item.pinned ? "从常用条移除" : "加入常用条").onClick(async () => {
        if (!item.pinned && this.prompts.filter((p) => p.pinned).length >= 5) { new Notice("常用条最多固定 5 条"); return; }
        b.setDisabled(true);
        try { await this.update(this.prompts.map((p) => p.id === item.id ? { ...p, pinned: !p.pinned } : p)); }
        catch { new Notice("保存失败，请重试"); b.setDisabled(false); }
      }))
      .addExtraButton((b) => b.setIcon("arrow-up").setTooltip("上移").onClick(async () => {
        if (index === 0) return;
        b.setDisabled(true); const next = [...this.prompts]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
        try { await this.update(next); } catch { new Notice("保存失败，请重试"); b.setDisabled(false); }
      }))
      .addExtraButton((b) => b.setIcon("arrow-down").setTooltip("下移").onClick(async () => {
        if (index === this.prompts.length - 1) return;
        b.setDisabled(true); const next = [...this.prompts]; [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
        try { await this.update(next); } catch { new Notice("保存失败，请重试"); b.setDisabled(false); }
      }))
      .addExtraButton((b) => b.setIcon("pencil").setTooltip("编辑").onClick(() => this.edit(item)))
      .addExtraButton((b) => b.setIcon("copy").setTooltip("复制模板").onClick(() => this.edit({ ...item, id: crypto.randomUUID(), name: `${item.name} 副本`, pinned: false })))
      .addExtraButton((b) => b.setIcon("trash-2").setTooltip("删除").onClick(() => {
        const confirm = new Modal(this.app); confirm.titleEl.setText(`删除「${item.name}」？`);
        new Setting(confirm.contentEl).addButton((cancel) => cancel.setButtonText("取消").onClick(() => confirm.close())).addButton((remove) => remove.setButtonText("删除模板").setWarning().onClick(async () => {
          remove.setDisabled(true);
          const next = this.prompts.filter((p) => p.id !== item.id);
          try { await this.update(next); confirm.close(); }
          catch { new Notice("保存失败，模板未删除"); remove.setDisabled(false); }
        })); confirm.open();
      }));
    new Setting(this.contentEl).addButton((b) => b.setButtonText("新建 Prompt").setCta().onClick(() => this.edit({ id: crypto.randomUUID(), name: "", body: "" })));
  }
  private edit(item: PromptTemplate): void {
    this.contentEl.empty(); this.titleEl.setText(item.name ? "编辑 Prompt" : "新建 Prompt"); let name = item.name; let body = item.body;
    new Setting(this.contentEl).setName("名称").addText((t) => t.setValue(name).onChange((v) => name = v));
    new Setting(this.contentEl).setName("内容").addTextArea((t) => { t.setValue(body).onChange((v) => body = v); t.inputEl.rows = 8; t.inputEl.style.width = "100%"; });
    new Setting(this.contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.draw())).addButton((b) => b.setButtonText("保存").setCta().onClick(async () => {
      if (!name.trim() || !body.trim()) { new Notice("请填写名称和内容"); return; }
      const updated = { ...item, name: name.trim(), body: body.trim() };
      const index = this.prompts.findIndex((p) => p.id === item.id);
      const next = [...this.prompts]; if (index < 0) next.push(updated); else next[index] = updated;
      b.setDisabled(true);
      try { await this.update(next); }
      catch { new Notice("保存失败，请重试"); b.setDisabled(false); }
    }));
  }
  override onClose(): void { this.contentEl.empty(); }
}
export class AppendDialog extends Modal {
  constructor(app: App, private readonly path: string, private readonly text: string, private readonly prepare?: () => Promise<void>) { super(app); }
  override onOpen(): void {
    this.titleEl.setText("追加回复");
    this.contentEl.createEl("p", { text: this.path });
    const preview = this.contentEl.createEl("pre", { text: this.text }); preview.style.maxHeight = "240px"; preview.style.overflow = "auto"; preview.style.whiteSpace = "pre-wrap";
    new Setting(this.contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.close())).addButton((b) => b.setButtonText("追加到文件末尾").setCta().onClick(async () => {
      b.setDisabled(true);
      try {
        await this.prepare?.();
        const receipt = await appendReply(this.app, this.path, this.text);
        this.contentEl.empty(); this.titleEl.setText("已追加"); this.contentEl.createEl("p", { text: this.path });
        new Setting(this.contentEl).addButton((open) => open.setButtonText("打开笔记").onClick(() => { void this.app.workspace.openLinkText(this.path, "", true); this.close(); }))
          .addButton((undo) => undo.setButtonText("撤销本次追加").onClick(async () => {
            undo.setDisabled(true);
            try { await undoReply(this.app, receipt); new Notice("已撤销本次追加"); this.close(); }
            catch (e) { new Notice(String(e)); undo.setDisabled(false); }
          }));
      } catch (e) { new Notice(String(e)); b.setDisabled(false); }
    }));
  }
  override onClose(): void { this.contentEl.empty(); }
}

/** Shown once, the first time full access is turned on: what it allows and what still asks. */
export class FullAccessDialog extends Modal {
  constructor(app: App, private readonly accept: () => void) { super(app); }
  override onOpen(): void {
    this.setTitle("开启完全访问");
    this.contentEl.addClass("qa-full-access-dialog");
    this.contentEl.createEl("p", { text: "Agent 将可以不经询问地读写这台电脑上的文件并运行命令，像在终端里工作一样。" });
    const list = this.contentEl.createEl("ul");
    for (const line of [
      "读到的文件内容和命令输出会发送给当前模型服务商。",
      "每一轮修改都会记录，可以一键撤销；删除会移到废纸篓。",
      "读取凭据、改动启动项、删除大范围目录或运行破坏性命令时，仍会先问你。",
      "网页或文件里的恶意指令可能诱导 Agent 行事，只在你信任当前任务时开启。",
    ]) list.createEl("li", { text: line });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("开启完全访问").setWarning().onClick(() => { this.close(); this.accept(); }));
  }
  override onClose(): void { this.contentEl.empty(); }
}
/** Asks for a web address; `read` resolves once the page is attached, or rejects with a reason to show. */
export class WebPageDialog extends Modal {
  constructor(app: App, private readonly read: (url: string, signal: AbortSignal) => Promise<void>) { super(app); }
  private controller: AbortController | null = null;
  override onOpen(): void {
    this.setTitle("添加网页");
    const input = this.contentEl.createEl("input", { cls: "qa-web-page-input", type: "url", attr: { placeholder: "https://", "aria-label": "网页地址" } });
    const status = this.contentEl.createEl("p", { cls: "qa-web-page-status", attr: { role: "status" } });
    let submit: ButtonComponent | null = null;
    const start = () => {
      const url = input.value.trim();
      if (!url || this.controller) return;
      this.controller = new AbortController();
      status.setText("正在读取网页…"); submit?.setDisabled(true); input.disabled = true;
      void this.read(url, this.controller.signal).then(() => this.close()).catch((error) => {
        if (this.controller?.signal.aborted) return;
        this.controller = null;
        status.setText(error instanceof Error ? error.message : String(error));
        submit?.setDisabled(false); input.disabled = false; input.focus();
      });
    };
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); start(); } });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => { submit = button; button.setButtonText("读取").setCta().onClick(start); });
    window.setTimeout(() => input.focus());
  }
  override onClose(): void { this.controller?.abort(); this.contentEl.empty(); }
}
