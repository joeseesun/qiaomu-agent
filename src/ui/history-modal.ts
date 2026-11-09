import { Modal, Notice, setIcon, type App } from "obsidian";
import type { ChatMessage, QiaomuSettings } from "../types";
import { clearActiveConversation, conversationTitle, deleteConversation } from "../services/conversations";

/** What the view lets the dialog do; deletion is the only write, everything else is read. */
export interface HistoryActions {
  persist: () => Promise<void>;
  /** Messages of the conversation currently open, so the row can show its real size. */
  activeMessages: () => ChatMessage[];
  /** Shows an archived conversation. */
  open: (id: string) => void;
  /** The active conversation was deleted: the view drops its messages. */
  cleared: () => void;
}

interface Row {
  id: string;
  title: string;
  createdAt: number;
  count: number;
  active: boolean;
  fork: boolean;
}

function stamp(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Lists the active conversation and the archived history, and deletes either one.
 * Deletion is permanent and asks once inline; the host has no undo for it.
 */
export class ConversationHistoryModal extends Modal {
  private pendingDelete: string | null = null;
  private pendingClear = false;

  constructor(app: App, private readonly settings: QiaomuSettings, private readonly actions: HistoryActions) { super(app); }

  override onOpen(): void {
    this.setTitle("对话历史");
    this.modalEl.addClass("qa-history-modal");
    this.contentEl.addClass("qa-history");
    this.draw();
  }

  override onClose(): void {
    this.contentEl.empty();
    this.pendingDelete = null;
    this.pendingClear = false;
  }

  private rows(): Row[] {
    const messages = this.actions.activeMessages();
    const active = this.settings.activeConversation;
    const rows: Row[] = [];
    if (messages.length || active?.title) rows.push({
      id: active?.id ?? "", title: active?.title || conversationTitle(messages),
      createdAt: active?.createdAt ?? Date.now(), count: messages.length, active: true, fork: Boolean(active?.fork),
    });
    for (const item of this.settings.conversations ?? []) rows.push({
      id: item.id, title: item.title || conversationTitle(item.messages),
      createdAt: item.createdAt, count: item.messages.length, active: false, fork: Boolean(item.fork),
    });
    return rows;
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    const rows = this.rows();
    const archived = this.settings.conversations ?? [];

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: archived.length
        ? `共 ${rows.length} 个对话，历史最多保留 30 条。删除后无法恢复。`
        : "还没有归档的历史对话；当前对话可以直接删除。",
    });

    if (!rows.length) {
      contentEl.createDiv({ cls: "qa-history-empty", text: "还没有对话记录。" });
      return;
    }

    const list = contentEl.createDiv({ cls: "qa-history-list" });
    for (const item of rows) this.renderRow(list, item);

    if (archived.length) {
      const footer = contentEl.createDiv({ cls: "qa-history-footer" });
      const button = footer.createEl("button", { cls: this.pendingClear ? "mod-warning" : "mod-muted" });
      button.setText(this.pendingClear ? `确认清空 ${archived.length} 条历史？` : `清空全部历史（${archived.length}）`);
      button.addEventListener("click", () => { void this.clearAll(); });
      if (this.pendingClear) {
        const cancel = footer.createEl("button", { text: "取消" });
        cancel.addEventListener("click", () => { this.pendingClear = false; this.draw(); });
      }
    }
  }

  private renderRow(parent: HTMLElement, item: Row): void {
    const row = parent.createDiv({ cls: "qa-history-item" });
    if (item.active) row.addClass("is-active");
    if (this.pendingDelete === item.id) { this.renderConfirm(row, item); return; }

    const main = row.createEl("button", { cls: "qa-history-main", attr: { type: "button" } });
    main.disabled = item.active && this.actions.activeMessages().length === 0;
    const title = main.createDiv({ cls: "qa-history-title" });
    if (item.fork) { const icon = title.createSpan({ cls: "qa-history-branch" }); setIcon(icon, "git-branch"); }
    title.createSpan({ text: item.title });
    if (item.active) title.createSpan({ cls: "qa-history-tag", text: "当前" });
    main.createDiv({ cls: "qa-history-meta", text: `${stamp(item.createdAt)} · ${item.count} 条消息` });
    main.addEventListener("click", () => {
      if (item.active) return;
      this.close();
      this.actions.open(item.id);
    });

    const remove = row.createEl("button", {
      cls: "qa-history-delete",
      attr: { type: "button", "aria-label": `删除对话：${item.title}`, title: item.active ? "删除当前对话" : "删除这条对话" },
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", () => { this.pendingDelete = item.id; this.pendingClear = false; this.draw(); });
  }

  private renderConfirm(row: HTMLElement, item: Row): void {
    row.addClass("is-confirming");
    row.createDiv({
      cls: "qa-history-warn",
      text: item.active ? "删除当前对话？未归档的内容会一起消失。" : `删除「${item.title}」？无法恢复。`,
    });
    const actions = row.createDiv({ cls: "qa-history-actions" });
    const confirm = actions.createEl("button", { cls: "mod-warning", text: "删除" });
    confirm.addEventListener("click", () => { void this.remove(item); });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => { this.pendingDelete = null; this.draw(); });
  }

  private async remove(item: Row): Promise<void> {
    this.pendingDelete = null;
    if (item.active) {
      clearActiveConversation(this.settings);
      await this.actions.persist();
      this.actions.cleared();
      new Notice("已删除当前对话");
    } else if (deleteConversation(this.settings, item.id)) {
      await this.actions.persist();
      new Notice("已删除对话");
    }
    this.draw();
  }

  private async clearAll(): Promise<void> {
    if (!this.pendingClear) { this.pendingClear = true; this.draw(); return; }
    const count = (this.settings.conversations ?? []).length;
    this.settings.conversations = [];
    this.pendingClear = false;
    await this.actions.persist();
    new Notice(`已清空 ${count} 条历史对话`);
    this.draw();
  }
}
