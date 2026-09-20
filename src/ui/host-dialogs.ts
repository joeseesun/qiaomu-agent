import { App, FuzzySuggestModal, Modal, Setting, Notice, TFile } from "obsidian";
import type { ModelChoice, PromptTemplate } from "../types";
import { appendReply, undoReply } from "../services/note-actions";

export class FilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly choose: (file: TFile) => void, private readonly markdownOnly = false) { super(app); this.setPlaceholder("搜索文件名或路径…"); }
  getItems(): TFile[] { return this.markdownOnly ? this.app.vault.getMarkdownFiles() : this.app.vault.getFiles(); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}
export class ModelPicker extends FuzzySuggestModal<ModelChoice> {
  constructor(app: App, private readonly choices: ModelChoice[], private readonly choose: (model: ModelChoice) => void) { super(app); this.setPlaceholder("搜索模型…"); }
  getItems(): ModelChoice[] { return this.choices; }
  getItemText(model: ModelChoice): string { return `${model.name}${model.name !== model.id ? ` · ${model.id}` : ""}`; }
  onChooseItem(model: ModelChoice): void { this.choose(model); }
}
export class ModelIdDialog extends Modal {
  constructor(app: App, private readonly current: string, private readonly choose: (model: ModelChoice) => void) { super(app); }
  override onOpen(): void {
    this.titleEl.setText("指定模型"); let value = this.current;
    new Setting(this.contentEl).setName("模型 ID").setDesc("使用当前连接支持的模型名称；可用性由服务端验证。").addText((t) => t.setValue(value).onChange((v) => value = v));
    new Setting(this.contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.close())).addButton((b) => b.setButtonText("使用模型").setCta().onClick(() => {
      if (!value.trim()) { new Notice("请输入模型 ID"); return; }
      this.choose({ id: value.trim(), name: value.trim(), efforts: [] }); this.close();
    }));
  }
  override onClose(): void { this.contentEl.empty(); }
}
export class PromptManager extends Modal {
  constructor(app: App, private readonly prompts: PromptTemplate[], private readonly save: (prompts: PromptTemplate[]) => Promise<void>) { super(app); }
  override onOpen(): void { this.draw(); }
  private draw(): void {
    this.contentEl.empty(); this.titleEl.setText("我的 Prompt");
    for (const item of this.prompts) new Setting(this.contentEl).setName(item.name)
      .addExtraButton((b) => b.setIcon("pencil").setTooltip("编辑").onClick(() => this.edit(item)))
      .addExtraButton((b) => b.setIcon("copy").setTooltip("复制模板").onClick(() => this.edit({ ...item, id: crypto.randomUUID(), name: `${item.name} 副本` })))
      .addExtraButton((b) => b.setIcon("trash-2").setTooltip("删除").onClick(() => {
        const confirm = new Modal(this.app); confirm.titleEl.setText(`删除「${item.name}」？`);
        new Setting(confirm.contentEl).addButton((cancel) => cancel.setButtonText("取消").onClick(() => confirm.close())).addButton((remove) => remove.setButtonText("删除模板").setWarning().onClick(async () => {
          remove.setDisabled(true);
          const next = this.prompts.filter((p) => p.id !== item.id);
          try { await this.save(next); this.prompts.splice(0, this.prompts.length, ...next); confirm.close(); this.draw(); }
          catch { new Notice("保存失败，模板未删除"); remove.setDisabled(false); }
        })); confirm.open();
      }));
    new Setting(this.contentEl).addButton((b) => b.setButtonText("新建 Prompt").setCta().onClick(() => this.edit({ id: crypto.randomUUID(), name: "", body: "" })));
  }
  private edit(item: PromptTemplate): void {
    this.contentEl.empty(); let name = item.name; let body = item.body;
    new Setting(this.contentEl).setName("名称").addText((t) => t.setValue(name).onChange((v) => name = v));
    new Setting(this.contentEl).setName("内容").addTextArea((t) => { t.setValue(body).onChange((v) => body = v); t.inputEl.rows = 8; t.inputEl.style.width = "100%"; });
    new Setting(this.contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.draw())).addButton((b) => b.setButtonText("保存").setCta().onClick(async () => {
      if (!name.trim() || !body.trim()) { new Notice("请填写名称和内容"); return; }
      const updated = { id: item.id, name: name.trim(), body: body.trim() };
      const next = this.prompts.filter((p) => p.id !== item.id); next.push(updated);
      b.setDisabled(true);
      try { await this.save(next); this.prompts.splice(0, this.prompts.length, ...next); this.draw(); }
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
