import { useChat, type Chat } from "@ai-sdk/react";
import { Component, Keymap, MarkdownRenderer, Notice, Platform, type App, type TFile } from "obsidian";
import { Check, ChevronDown, ChevronRight, Copy, FileText, FilePlus, Folder, Link, History, Plus, SquarePen, X, AlertCircle, CalendarPlus, FilePlus2, Slash, Paperclip, TextSelect, Sparkles, Shield, FolderPen, ShieldAlert, Pencil, GitBranch, BookOpen, Globe, Newspaper, Shapes } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ChatActivity, PermissionMode, ChatAttachment, PromptTemplate } from "../types";
import type { ModelSource } from "../services/model-sources";
import { ModelPicker, type PickerSelection } from "./model-picker";
import { BrandIcon } from "./brand-icon";
import { ApprovalCard, ChangeSummary } from "./turn-review";
import { readAttachment, MAX_ATTACHMENTS } from "../services/attachments";
import { slashQuery, startsFileMention } from "../services/composer";
import type { AddKind } from "../services/hotkeys";
import { Attachments } from "../components/ai-elements/attachments";
import { type AgentMessage, messageText, messageUsage } from "../services/chat-transport";
import { Conversation, ConversationContent, ConversationScrollButton } from "../components/ai-elements/conversation";
import { Message, MessageContent, MessageAction, MessageActions } from "../components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputHeader, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "../components/ai-elements/prompt-input";
import { splitMermaid } from "../services/mermaid-content";
import { internalLinkTarget, tidyInternalLinks } from "../services/markdown-links";
import { MermaidDiagram } from "./mermaid-diagram";
import { ComposerPopover, effortLabel } from "./composer-popover";
import { ContextRing } from "./context-ring";
import { conversationImages } from "../services/conversation-images";
import { ConversationImageLightbox, referenceImageAttachment, showConversationImageMenu } from "./conversation-image";

interface Props {
  chat: Chat<AgentMessage>; app: App; parent: Component;
  conversationId: string; conversationTitle: string;
  branch: { parentId: string; parentTitle: string; messageId: string } | null;
  onOpenParent: (id: string) => void; onForkMessage: (messageId: string) => void;
  imageTargetNote: TFile | null;
  backendLabel: string; skillLabel: string; permission: PermissionMode; fileAccessAvailable: boolean; fullAccessAvailable: boolean; note: TFile | null; detachedNote?: TFile | null;
  statusText: string; prompts: string[]; prefill: string; prefillVersion: number; focusVersion?: number;
  addRequest?: { kind: AddKind; version: number }; addHotkeys?: Partial<Record<AddKind, string>>;
  onConnection: () => void; onNew: () => void; onHistory: (event: MouseEvent) => void;
  onSkill: (event: MouseEvent) => void; onPermission: (mode: PermissionMode) => void;
  onEditMessage: () => void;
  onToggleNote: () => void; onPersist: () => Promise<void>;
  editorSelection: { label: string; detail: string } | null; onDismissSelection: () => void; onComposerFocus: () => void;
  reading?: ReadingChip | null; onDismissReading?: () => void;
  onApprove: (id: string, choice: string | null) => void; onRevertChanges: (messageId: string) => void; onOpenFile: (path: string) => void;
  efforts: string[]; effort: string; modelLoading: boolean; onEffort: (effort: string) => void;
  sources: ModelSource[]; selection: PickerSelection | null; recentModels: PickerSelection[];
  onPickModel: (source: string, model: string) => void; onLoadModels: (source: string) => void; onManageModels: () => void;
  customPrompts: PromptTemplate[]; onManagePrompts: () => void;
  onPickFile: (choose: (attachment: ChatAttachment) => void) => void;
  onPickFolder: (choose: (attachment: ChatAttachment) => void) => void;
  /** Absent where pages cannot be read (mobile). */
  onPickWebPage?: (choose: (attachment: ChatAttachment) => void) => void;
  /** Web search state for the selected model; absent when it cannot search (local agents search on their own). */
  webSearch?: boolean; onToggleWebSearch?: () => void;
  onValidateAttachments: (attachments: ChatAttachment[]) => void;
  onAppend: (text: string, daily: boolean) => void;
}

/** Keep the Obsidian renderer and each render's resources inside the mounted component. */
function HostMarkdown({ text, sourcePath, app, parent }: { text: string; sourcePath: string; app: App; parent: Component }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = target.current;
    if (!host) return;
    let active = true;
    const child = new Component();
    parent.addChild(child);
    const staging = host.ownerDocument.createElement("div");
    staging.className = "qiaomu-agent__markdown";
    void MarkdownRenderer.render(app, text, staging, sourcePath, child).then(() => {
      tidyInternalLinks(staging);
      if (active) host.replaceChildren(staging);
    }).catch(() => { if (active) host.textContent = text; });
    return () => { active = false; parent.removeChild(child); };
  }, [text, sourcePath, app, parent]);
  // Rendered outside a note view, internal links get no host click handling; open them as a note would.
  useEffect(() => {
    const host = target.current;
    if (!host) return;
    const open = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;
      const anchor = event.target instanceof Element ? event.target.closest("a.internal-link") : null;
      const link = anchor && internalLinkTarget(anchor);
      if (!link) return;
      event.preventDefault();
      void app.workspace.openLinkText(link, sourcePath, event.button === 1 ? "tab" : Keymap.isModEvent(event));
    };
    host.addEventListener("click", open);
    host.addEventListener("auxclick", open);
    return () => { host.removeEventListener("click", open); host.removeEventListener("auxclick", open); };
  }, [app, sourcePath]);
  return <div className="qa-markdown-host" ref={target} />;
}

function NoteMarkdown(props: { text: string; sourcePath: string; app: App; parent: Component }) {
  let charts = 0;
  return <>{splitMermaid(props.text).map((part, index) => part.kind === "pending" ? <pre key={index}>{part.text}</pre> : part.kind === "mermaid"
    ? ++charts <= 6 ? <MermaidDiagram key={index} source={part.text} /> : <pre key={index}>{part.text}</pre>
    : <HostMarkdown key={index} {...props} text={part.text} />)}</>;
}

function Activities({ activities, running }: { activities: ChatActivity[]; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = activities.filter((a) => a.label !== "userMessage");
  const failed = visible.some((a) => a.status === "failed");
  useEffect(() => { if (failed) setExpanded(true); }, [failed]);
  if (!visible.length) return null;
  const current = running && visible.find((a) => a.status === "running");
  return <details className="qa-activities" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>{failed ? <AlertCircle size={14} /> : current ? <span className="qa-working-dot" /> : <Check size={14} />}
      <span>{current ? current.label : `${visible.length} 个执行步骤${failed ? " · 有失败" : ""}`}</span><ChevronRight className="qa-chevron" size={14} />
    </summary>
    {visible.map((activity) => <details key={activity.id} className="qa-activity">
      <summary><span>{activity.label}</span><span>{activity.status === "completed" ? "完成" : activity.status === "failed" ? "失败" : running ? "进行中" : "已结束"}</span></summary>
      {activity.detail && <pre>{activity.detail}</pre>}
    </details>)}
  </details>;
}

const messageTime = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

export function ChatPanel(props: Props) {
  const { messages, status, error, sendMessage, regenerate, setMessages, stop, clearError } = useChat({ chat: props.chat, experimental_throttle: 75 });
  const [input, setInput] = useState("");
  const [stopped, setStopped] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [reading, setReading] = useState(0);
  const [attachmentError, setAttachmentError] = useState("");
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  // The draft set aside when the add menu opens the prompt list; Escape brings it back.
  const draftBeforePrompts = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const previousConversation = useRef(props.conversationId);
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (previousConversation.current === props.conversationId) return;
    previousConversation.current = props.conversationId;
    setInput(""); setAttachments([]); setEditingId(null); setEditText(""); clearError();
  }, [props.conversationId, clearError]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const locked = useRef(false);
  const inputId = useId();
  const running = status === "submitted" || status === "streaming";
  // While the reply has no text yet, its placeholder carries the status instead of the composer.
  const lastMessage = messages.at(-1);
  const waitingText = running && lastMessage?.role === "assistant" && !messageText(lastMessage);
  const contextUsage = latestUsage(messages);
  const query = slashQuery(input);
  const promptChoices = [...props.prompts.map((body, i) => ({ id: `quick-${i}`, name: body, body })), ...props.customPrompts]
    .filter((p) => !query || `${p.name} ${p.body}`.toLocaleLowerCase().includes(query));
  const menuOpen = query !== null && !menuDismissed;
  const imageEditing = attachments.some((file) => file.intent === "edit");
  const permissionLabel = imageEditing ? "图片编辑只读" : props.permission === "full" ? "完全访问" : props.permission === "edit" ? "可写当前库" : "只读";
  const PermissionIcon = imageEditing ? Shield : props.permission === "full" ? ShieldAlert : props.permission === "edit" ? FolderPen : Shield;
  const choosePrompt = (index: number) => {
    const prompt = promptChoices[index];
    draftBeforePrompts.current = null;
    if (prompt) setInput(prompt.body); else { props.onManagePrompts(); setInput(""); }
    setMenuDismissed(true); textarea.current?.focus();
  };
  const addAttachment = (file: ChatAttachment) => {
    if (!mounted.current) return;
    setAttachments((current) => {
      if (current.length >= MAX_ATTACHMENTS || current.reduce((sum, a) => sum + a.size, file.size) > 10 * 1024 * 1024) { new Notice("最多 6 个附件，总计不超过 10 MB"); return current; }
      return [...current, file];
    });
  };
  const addFiles = async (files: File[]) => {
    setReading((n) => n + 1); setAttachmentError("");
    try { for (const file of files) { try { addAttachment(await readAttachment(file)); } catch (e) { if (mounted.current) setAttachmentError(String(e)); } } }
    finally { if (mounted.current) setReading((n) => n - 1); }
  };
  const addReferenceImage = (image: ChatAttachment) => {
    void referenceImageAttachment(props.app, image).then((file) => {
      addAttachment(file);
      textarea.current?.focus();
    }).catch((error) => setAttachmentError(error instanceof Error ? error.message : String(error)));
  };
  useEffect(() => {
    if (!props.prefillVersion) return;
    setInput(props.prefill); textarea.current?.focus();
  }, [props.prefill, props.prefillVersion]);
  useEffect(() => { if (props.focusVersion) textarea.current?.focus(); }, [props.focusVersion]);
  const runAdd = (kind: AddKind) => {
    if (kind === "upload") upload.current?.click();
    else (kind === "file" ? props.onPickFile : props.onPickFolder)(addAttachment);
  };
  // Only a new request runs the action; re-renders with the same version do not.
  useEffect(() => { if (props.addRequest?.version) runAdd(props.addRequest.kind); }, [props.addRequest?.version]);
  useEffect(() => {
    const el = textarea.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; }
  }, [input]);

  const submit = async (text: string) => {
    if ((!text.trim() && !attachments.length) || reading || running || locked.current) return;
    if (imageEditing && !text.trim()) { setAttachmentError("请描述希望如何修改图片"); textarea.current?.focus(); return; }
    try { props.onValidateAttachments(attachments); } catch (e) { setAttachmentError(e instanceof Error ? e.message : String(e)); return; }
    locked.current = true; clearError(); setStopped(false); setInput("");
    const sent = attachments; setAttachments([]); setAttachmentError("");
    try { await sendMessage({ text: text.trim() || "请分析这些附件。", metadata: { createdAt: Date.now(), sourcePath: props.note?.path, attachments: sent } }); }
    finally { locked.current = false; await props.onPersist(); }
  };
  const retry = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // A retry is explicit, not an automatic replay of possibly side-effecting tools.
    setInput(messageText(lastUser)); setAttachments(lastUser.metadata?.attachments ?? []); clearError(); textarea.current?.focus();
  };
  const beginEdit = (message: AgentMessage) => {
    setEditingId(message.id); setEditText(messageText(message));
  };
  const submitEdit = async (message: AgentMessage) => {
    const text = editText.trim();
    if (!text || running || locked.current) return;
    locked.current = true; clearError(); setStopped(false);
    props.onEditMessage();
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === message.id);
      if (index < 0) return current;
      const edited = { ...message, parts: message.parts.map((part) => part.type === "text" ? { ...part, text } : part) };
      return [...current.slice(0, index), edited];
    });
    setEditingId(null);
    try { await regenerate({ messageId: message.id }); }
    finally { locked.current = false; await props.onPersist(); }
  };
  const title = messages.find((m) => m.role === "user");
  const images = conversationImages(messages);
  const imageFromElement = (element: HTMLImageElement, index: number): ChatAttachment => {
    const id = element.closest("[data-qa-image-id]")?.getAttribute("data-qa-image-id");
    const existing = images.find((item) => item.id === id);
    if (existing) return existing;
    const url = element.currentSrc || element.src;
    const name = element.alt || `图片 ${index + 1}`;
    const mediaType = /^data:(image\/[^;,]+)/.exec(url)?.[1] || (/\.jpe?g(?:[?#]|$)/i.test(url) ? "image/jpeg" : /\.webp(?:[?#]|$)/i.test(url) ? "image/webp" : /\.gif(?:[?#]|$)/i.test(url) ? "image/gif" : "image/png");
    return { id: `rendered-${index}`, name, mediaType, size: 0, url };
  };
  const openRenderedImage = (image: ChatAttachment, event: MouseEvent) => {
    const root = (event.target as Element).closest(".qa-conversation-content");
    const elements = root ? Array.from(root.querySelectorAll<HTMLImageElement>(".qa-message-content img")) : [];
    const rendered = elements.length ? elements.map(imageFromElement) : images;
    const identity = (item: ChatAttachment) => item.size ? `${item.name}:${item.size}` : item.url || item.id;
    const all = rendered.filter((item, index) => rendered.findIndex((candidate) => identity(candidate) === identity(item)) === index);
    const clicked = elements.findIndex((element) => element === event.target || element.closest("[data-qa-image-id]") === event.target);
    const selected = rendered[clicked] ?? rendered.find((item) => item.id === image.id || item.url === image.url) ?? image;
    new ConversationImageLightbox(props.app, all, all.find((item) => identity(item) === identity(selected)) ?? selected, props.imageTargetNote, addReferenceImage).open();
  };
  return <>
    <header className="qa-header">
      <div className="qa-title-wrap"><div className="qa-title">{props.conversationTitle || (title ? messageText(title).split("\n")[0]?.slice(0, 60) : "新对话")}</div>
        {props.branch && <button type="button" className="qa-branch-parent" disabled={running} onClick={() => props.onOpenParent(props.branch!.parentId)}>
          <GitBranch size={12} /><span>返回原对话 · {props.branch.parentTitle}</span></button>}
      </div>
      <button type="button" disabled={running} onClick={(e) => props.onHistory(e.nativeEvent)}><History size={17} /><span className="qiaomu-agent__sr-only">历史对话</span></button>
      <button type="button" disabled={running} onClick={props.onNew}><SquarePen size={17} /><span className="qiaomu-agent__sr-only">新对话</span></button>
    </header>
    <Conversation>
      <ConversationContent onClick={(event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement) || !image.closest(".qa-markdown-host")) return;
        event.preventDefault(); openRenderedImage(imageFromElement(image, 0), event.nativeEvent);
      }} onContextMenu={(event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement) || !image.closest(".qa-markdown-host")) return;
        event.preventDefault(); showConversationImageMenu(props.app, imageFromElement(image, 0), event.nativeEvent, props.imageTargetNote, addReferenceImage);
      }}>
        {!messages.length && <div className="qa-empty">
          <h3>从一个想法开始</h3><p>围绕笔记提问、整理，或协作修改。输入 / 使用 Prompt，@ 引用库内文件。</p>
          <div className="qa-suggestions">{props.prompts.slice(0, 3).map((prompt) => <button key={prompt} type="button" onClick={() => { setInput(prompt); textarea.current?.focus(); }}>{prompt}</button>)}</div>
        </div>}
        {messages.filter((m) => m.role !== "system").map((message, index, visible) => {
          const text = messageText(message);
          const latest = index === visible.length - 1;
          const active = running && latest && message.role === "assistant";
          const activities = message.parts.filter((p) => p.type === "data-activity").map((p) => p.data);
          const approvals = message.parts.filter((p) => p.type === "data-approval").map((p) => p.data);
          const changes = message.parts.find((p) => p.type === "data-changes");
          const messageAttachments = new Map((message.metadata?.attachments ?? []).map((attachment) => [attachment.id, attachment]));
          for (const part of message.parts) if (part.type === "data-attachment") messageAttachments.set(part.data.id, part.data);
          return <Message key={message.id} from={message.role} className={`${editingId === message.id ? "is-editing" : ""}${latest ? " is-latest" : ""}`}>
            <MessageContent>
              <Attachments files={[...messageAttachments.values()]} variant={message.role === "assistant" ? "grid" : "inline"}
                onOpenImage={openRenderedImage}
                onImageMenu={(image, event) => showConversationImageMenu(props.app, image, event, props.imageTargetNote, addReferenceImage)} />
              <Activities activities={activities} running={active} />
              {approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} onChoose={(choice) => props.onApprove(approval.id, choice)} />)}
              {message.role === "user" && editingId === message.id ? <form className="qa-message-editor" onSubmit={(event) => { event.preventDefault(); void submitEdit(message); }}>
                <label className="qiaomu-agent__sr-only" htmlFor={`${inputId}-edit-${message.id}`}>编辑消息内容</label>
                <textarea id={`${inputId}-edit-${message.id}`} value={editText} onChange={(event) => setEditText(event.currentTarget.value)} autoFocus rows={3}
                  onKeyDown={(event) => { if (Platform.isDesktopApp && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submitEdit(message); } }} />
                <div className="qa-message-editor-actions"><button type="button" onClick={() => setEditingId(null)}>取消</button><button type="submit" className="mod-cta" disabled={!editText.trim()}>发送</button></div>
              </form> : text ? <NoteMarkdown text={text} sourcePath={message.metadata?.sourcePath ?? ""} app={props.app} parent={props.parent} /> : active ? <div className="qa-thinking" role="status">{props.statusText || (activities.find((a) => a.status === "running")?.label ?? "正在思考…")}</div> : <div className="qa-thinking">没有文本回复</div>}
              {changes?.type === "data-changes" && changes.data.files.length > 0 && <ChangeSummary changes={changes.data} disabled={running}
                onOpen={props.onOpenFile} onRevert={() => props.onRevertChanges(message.id)} />}
            </MessageContent>
            {message.role === "user" && text && editingId !== message.id && <div className="qa-user-message-meta">
              <time dateTime={new Date(message.metadata?.createdAt ?? Date.now()).toISOString()}>{messageTime.format(message.metadata?.createdAt ?? Date.now())}</time>
              <MessageActions>
                <MessageAction label="复制消息" onClick={() => void navigator.clipboard.writeText(text).then(() => new Notice("已复制")).catch(() => new Notice("复制失败，请手动选择文本"))}><Copy size={14} /></MessageAction>
                <MessageAction label="编辑消息" disabled={running} onClick={() => beginEdit(message)}><Pencil size={14} /></MessageAction>
              </MessageActions>
            </div>}
            {message.role === "assistant" && text && !active && <MessageActions>
              <MessageAction label="复制回复" onClick={() => void navigator.clipboard.writeText(text).then(() => new Notice("已复制")).catch(() => new Notice("复制失败，请手动选择文本"))}><Copy size={14} /></MessageAction>
              <MessageAction label="从这条回复创建分支" disabled={running} onClick={() => props.onForkMessage(message.id)}><GitBranch size={14} /></MessageAction>
              <MessageAction label="追加到今日日记" onClick={() => props.onAppend(text, true)}><CalendarPlus size={14} /></MessageAction>
              <MessageAction label="追加到指定文件" onClick={() => props.onAppend(text, false)}><FilePlus2 size={14} /></MessageAction>
            </MessageActions>}
          </Message>;
        })}
        {status === "submitted" && <div className="qa-thinking">正在连接…</div>}
        {stopped && !running && <div className="qa-thinking">已停止，已保留收到的内容。</div>}
        {error && <div className="qa-error" role="alert"><p>{error.message}</p><button type="button" onClick={() => void retry()}>编辑后重试</button><button type="button" onClick={props.onConnection}>检查连接</button></div>}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
    <div className="qa-composer">
      {menuOpen && <div className="qa-command-menu" id={`${inputId}-menu`} role="listbox" aria-label="Prompt 菜单">
        {promptChoices.map((p, index) => <button type="button" role="option" aria-selected={index === menuIndex} id={`${inputId}-option-${index}`} key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choosePrompt(index)}><Slash size={15} /><span>{p.name}</span></button>)}
        <button type="button" role="option" aria-selected={menuIndex === promptChoices.length} id={`${inputId}-option-${promptChoices.length}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choosePrompt(promptChoices.length)}><Plus size={15} /><span>管理自定义 Prompt…</span></button>
      </div>}
      {running && props.statusText && waitingText === false && <div className="qa-status" role="status">{props.statusText}</div>}
      {attachmentError && <div className="qa-error" role="alert">{attachmentError}</div>}
      <PromptInput onSubmit={(event) => { event.preventDefault(); void submit(input); }} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); } }}>
        <input type="file" multiple hidden ref={upload} onChange={(e) => { void addFiles(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ""; }} />
        <Attachments files={attachments} onRemove={(id) => setAttachments((current) => current.filter((a) => a.id !== id))} />
        {reading > 0 && <div className="qa-status">正在读取附件…</div>}
        {!imageEditing && (props.note || props.editorSelection || props.reading) && <PromptInputHeader>
          {props.note && <span className="qa-note"><FileText size={13} /><span>{props.note.basename}</span>
            <button type="button" disabled={running} onClick={props.onToggleNote}><X size={12} /><span className="qiaomu-agent__sr-only">不附加当前笔记</span></button></span>}
          {props.editorSelection && <span className="qa-note qa-selection-chip" title={props.editorSelection.detail.slice(0, 400)}><TextSelect size={13} /><span>{props.editorSelection.label}</span>
            <button type="button" disabled={running} onClick={props.onDismissSelection}><X size={12} /><span className="qiaomu-agent__sr-only">不附加选中的文字</span></button></span>}
          {props.reading && <span className="qa-note qa-reading-chip" title={props.reading.detail}><ReadingIcon chip={props.reading} /><span>{props.reading.label}</span>
            <button type="button" disabled={running} onClick={props.onDismissReading}><X size={12} /><span className="qiaomu-agent__sr-only">不附加正在阅读的内容</span></button></span>}
        </PromptInputHeader>}
        <label htmlFor={inputId} className="qiaomu-agent__sr-only">给 Agent 的消息</label>
        <PromptInputTextarea submitOnEnter={Platform.isDesktopApp} id={inputId} ref={textarea} value={input} onFocus={props.onComposerFocus} aria-controls={menuOpen ? `${inputId}-menu` : undefined} aria-activedescendant={menuOpen ? `${inputId}-option-${menuIndex}` : undefined}
          onKeyDown={(e) => {
            if (!menuOpen || e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((n) => (n + (e.key === "ArrowDown" ? 1 : promptChoices.length)) % (promptChoices.length + 1)); }
            if (e.key === "Escape") {
              e.preventDefault(); setMenuDismissed(true);
              if (draftBeforePrompts.current !== null) { setInput(draftBeforePrompts.current); draftBeforePrompts.current = null; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); choosePrompt(menuIndex); }
          }}
          onChange={(event) => {
            const value = event.currentTarget.value; const cursor = event.currentTarget.selectionStart;
            setInput(value); setMenuDismissed(false); setMenuIndex(0);
            if (!value.startsWith("/")) draftBeforePrompts.current = null;
            if (startsFileMention(value, cursor) && !(event.nativeEvent as InputEvent).isComposing) props.onPickFile((file) => { addAttachment(file); setInput((current) => current === value ? value.slice(0, cursor - 1) + value.slice(cursor) : current); textarea.current?.focus(); });
          }}
          onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { if (!e.clipboardData.getData("text/plain")) e.preventDefault(); void addFiles(files); } }}
          placeholder={imageEditing ? "描述要如何修改这张图片…" : "输入消息…"} />
        <PromptInputFooter><PromptInputTools>
          <ComposerPopover label="添加附件与工具" trigger={<Plus size={18} />} disabled={running}>
            {(close) => <div className="qa-add-menu">
              <div className="qa-add-group" role="group" aria-labelledby={`${inputId}-add`}>
                <div className="qa-add-heading" id={`${inputId}-add`}>添加</div>
                <button type="button" aria-label="上传文件或图片" onClick={() => { close(); runAdd("upload"); }}><Paperclip size={16} /><span>文件或图片</span><span className="qa-add-hint">也可拖入</span><AddKey keys={props.addHotkeys?.upload} /></button>
                <button type="button" aria-label="选择库内文件" onClick={() => { close(); runAdd("file"); }}><FileText size={16} /><span>库内文件</span><AddKey keys={props.addHotkeys?.file || "@"} /></button>
                <button type="button" aria-label="选择库内文件夹" onClick={() => { close(); runAdd("folder"); }}><Folder size={16} /><span>库内文件夹</span><span className="qa-add-hint">附加其中的笔记</span><AddKey keys={props.addHotkeys?.folder} /></button>
                {props.onPickWebPage && <button type="button" aria-label="添加网页" onClick={() => { close(); props.onPickWebPage!(addAttachment); }}><Link size={16} /><span>网页</span><span className="qa-add-hint">读取正文</span></button>}
                {props.detachedNote && <button type="button" aria-label={`附加当前笔记「${props.detachedNote.basename}」`} onClick={() => { close(); props.onToggleNote(); }}><FilePlus size={16} /><span>当前笔记</span><span className="qa-add-hint">{props.detachedNote.basename}</span></button>}
              </div>
              <div className="qa-add-group" role="group" aria-labelledby={`${inputId}-use`}>
                <div className="qa-add-heading" id={`${inputId}-use`}>使用</div>
                <button type="button" aria-label="使用 Prompt" onClick={() => { close(); if (input && draftBeforePrompts.current === null) draftBeforePrompts.current = input; setInput("/"); setMenuDismissed(false); setMenuIndex(0); textarea.current?.focus(); }}><Slash size={16} /><span>Prompt</span><AddKey keys="/" /></button>
                <button type="button" aria-label={props.skillLabel === "技能" ? "选择技能" : `技能：${props.skillLabel}`} onClick={(event) => { close(); props.onSkill(event.nativeEvent); }}><Sparkles size={16} /><span>技能</span><span className="qa-add-hint">{props.skillLabel === "技能" ? "选择要用的技能" : props.skillLabel}</span><ChevronRight size={14} /></button>
                {props.webSearch !== undefined && <button type="button" aria-label="联网搜索" aria-pressed={props.webSearch} onClick={props.onToggleWebSearch}><Globe size={16} /><span>联网搜索</span><span className="qa-add-hint">{props.webSearch ? "需要时自动搜索" : "已关闭"}</span><span className="qa-add-switch" aria-hidden="true" /></button>}
              </div>
            </div>}
          </ComposerPopover>
          {props.fileAccessAvailable && <ComposerPopover className={`qa-permission-control is-${imageEditing ? "plan" : props.permission}`} label={`访问权限：${permissionLabel}`} trigger={<PermissionIcon size={18} />} disabled={running || imageEditing}>
            {(close) => <>
              <button type="button" aria-pressed={props.permission === "plan"} onClick={() => { close(); props.onPermission("plan"); }}><Shield size={16} /><span>只读</span>{props.permission === "plan" && <Check size={14} />}</button>
              <button type="button" aria-pressed={props.permission === "edit"} onClick={() => { close(); props.onPermission("edit"); }}><FolderPen size={16} /><span>可写当前库</span>{props.permission === "edit" && <Check size={14} />}</button>
              {Platform.isDesktopApp && props.fullAccessAvailable && <button type="button" className="qa-full-access" aria-pressed={props.permission === "full"} onClick={() => { close(); props.onPermission("full"); }}><ShieldAlert size={16} /><span>完全访问</span>{props.permission === "full" && <Check size={14} />}</button>}
            </>}
          </ComposerPopover>}
        </PromptInputTools>
        <ComposerPopover className="qa-model-control" label="模型与推理" disabled={running}
          trigger={<>{(() => { const source = props.sources.find((item) => item.key === props.selection?.source); return source ? <BrandIcon icon={source.icon} kind={source.kind} size={14} /> : null; })()}<span className="qa-model-name">{props.backendLabel}</span>{!!props.efforts.length && <span className="qa-effort-label">推理 {effortLabel(props.effort)}</span>}<ChevronDown size={12} /></>}>
          {(close) => <ModelPicker sources={props.sources} current={props.selection} recent={props.recentModels}
            efforts={props.efforts} effort={props.effort} onEffort={props.onEffort}
            onSelect={(source, model) => { props.onPickModel(source, model); close(); }}
            onLoad={props.onLoadModels} onManage={() => { close(); props.onManageModels(); }} />}
        </ComposerPopover>
        {contextUsage && <ContextRing usage={contextUsage} onNew={props.onNew} disabled={running} />}
        <PromptInputSubmit status={status} disabled={(!input.trim() && !attachments.length) || reading > 0 || props.modelLoading} onStop={() => { setStopped(true); void stop().then(props.onPersist); }} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </>;
}

/** The most recent reply's reported context usage; older replies describe a smaller window. */
function latestUsage(messages: AgentMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const usage = messages[index]!.role === "assistant" ? messageUsage(messages[index]!) : undefined;
    if (usage) return usage;
  }
  return undefined;
}

/** A shortcut shown at the end of an add-menu row, like a native menu's key column. */
function AddKey({ keys }: { keys?: string }) {
  return keys ? <kbd className="qa-add-key" aria-hidden="true">{keys}</kbd> : null;
}

/** Reading context from another plugin or view, shown as a removable composer chip. */
export interface ReadingChip { label: string; detail: string; kind: "article" | "book" | "document" | "page" | "other"; selected: boolean }

function ReadingIcon({ chip }: { chip: ReadingChip }) {
  if (chip.selected) return <TextSelect size={13} />;
  const Icon = { article: Newspaper, book: BookOpen, document: FileText, page: Globe, other: Shapes }[chip.kind];
  return <Icon size={13} />;
}
