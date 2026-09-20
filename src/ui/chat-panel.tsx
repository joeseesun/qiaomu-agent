import { useChat, type Chat } from "@ai-sdk/react";
import { Component, MarkdownRenderer, Notice, type App, type TFile } from "obsidian";
import { Check, ChevronDown, ChevronRight, Copy, FileText, History, Plus, SquarePen, X, AlertCircle, CalendarPlus, FilePlus2, Settings2, AtSign, Slash, Paperclip } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ChatActivity, PermissionMode, ChatAttachment, PromptTemplate } from "../types";
import { readAttachment, MAX_ATTACHMENTS } from "../services/attachments";
import { slashQuery, startsFileMention } from "../services/composer";
import { Attachments } from "../components/ai-elements/attachments";
import { type AgentMessage, messageText } from "../services/chat-transport";
import { Conversation, ConversationContent, ConversationScrollButton } from "../components/ai-elements/conversation";
import { Message, MessageContent, MessageAction, MessageActions } from "../components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputHeader, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "../components/ai-elements/prompt-input";

interface Props {
  chat: Chat<AgentMessage>; app: App; parent: Component;
  backendLabel: string; skillLabel: string; permission: PermissionMode; note: TFile | null;
  statusText: string; prompts: string[]; prefill: string; prefillVersion: number;
  onConnection: () => void; onNew: () => void; onHistory: (event: MouseEvent) => void;
  onSkill: (event: MouseEvent) => void; onPermission: (mode: PermissionMode) => void;
  onToggleNote: () => void; onPersist: () => Promise<void>;
  efforts: string[]; effort: string; modelLoading: boolean; onModels: () => void; onEffort: (effort: string) => void;
  customPrompts: PromptTemplate[]; onManagePrompts: () => void;
  onPickFile: (choose: (attachment: ChatAttachment) => void) => void;
  onValidateAttachments: (attachments: ChatAttachment[]) => void;
  onAppend: (text: string, daily: boolean) => void;
}

/** Keep the Obsidian renderer and each render's resources inside the mounted component. */
function NoteMarkdown({ text, sourcePath, app, parent }: { text: string; sourcePath: string; app: App; parent: Component }) {
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
      if (active) host.replaceChildren(staging);
    }).catch(() => { if (active) host.textContent = text; });
    return () => { active = false; parent.removeChild(child); };
  }, [text, sourcePath, app, parent]);
  return <div className="qa-markdown-host" ref={target} />;
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

export function ChatPanel(props: Props) {
  const { messages, status, error, sendMessage, stop, clearError } = useChat({ chat: props.chat, experimental_throttle: 75 });
  const [input, setInput] = useState("");
  const [stopped, setStopped] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [reading, setReading] = useState(0);
  const [attachmentError, setAttachmentError] = useState("");
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const locked = useRef(false);
  const inputId = useId();
  const running = status === "submitted" || status === "streaming";
  const query = slashQuery(input);
  const promptChoices = [...props.prompts.map((body, i) => ({ id: `quick-${i}`, name: body, body })), ...props.customPrompts]
    .filter((p) => !query || `${p.name} ${p.body}`.toLocaleLowerCase().includes(query));
  const menuOpen = query !== null && !menuDismissed;
  const choosePrompt = (index: number) => {
    const prompt = promptChoices[index];
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
  useEffect(() => {
    if (!props.prefillVersion) return;
    setInput(props.prefill); textarea.current?.focus();
  }, [props.prefill, props.prefillVersion]);
  useEffect(() => {
    const el = textarea.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; }
  }, [input]);

  const submit = async (text: string) => {
    if ((!text.trim() && !attachments.length) || reading || running || locked.current) return;
    try { props.onValidateAttachments(attachments); } catch (e) { setAttachmentError(String(e)); return; }
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
  const title = messages.find((m) => m.role === "user");
  return <>
    <header className="qa-header">
      <div className="qa-title">{title ? messageText(title).split("\n")[0]?.slice(0, 60) : "新对话"}</div>
      <button type="button" disabled={running} onClick={props.onConnection} aria-label="连接设置"><Settings2 size={17} /></button>
      <button type="button" disabled={running} onClick={(e) => props.onHistory(e.nativeEvent)}><History size={17} /><span className="qiaomu-agent__sr-only">历史对话</span></button>
      <button type="button" disabled={running} onClick={props.onNew}><SquarePen size={17} /><span className="qiaomu-agent__sr-only">新对话</span></button>
    </header>
    <Conversation>
      <ConversationContent>
        {!messages.length && <div className="qa-empty">
          <h3>从一个想法开始</h3><p>围绕笔记提问、整理，或协作修改。</p>
          <div className="qa-suggestions">{props.prompts.slice(0, 3).map((prompt) => <button key={prompt} type="button" onClick={() => { setInput(prompt); textarea.current?.focus(); }}>{prompt}</button>)}</div>
        </div>}
        {messages.filter((m) => m.role !== "system").map((message, index, visible) => {
          const text = messageText(message);
          const active = running && index === visible.length - 1 && message.role === "assistant";
          const activities = message.parts.filter((p) => p.type === "data-activity").map((p) => p.data);
          return <Message key={message.id} from={message.role}>
            <MessageContent>
              <Attachments files={message.metadata?.attachments ?? []} />
              <Activities activities={activities} running={active} />
              {text ? <NoteMarkdown text={text} sourcePath={message.metadata?.sourcePath ?? ""} app={props.app} parent={props.parent} /> : active ? <div className="qa-thinking">正在处理…</div> : <div className="qa-thinking">没有文本回复</div>}
            </MessageContent>
            {message.role === "assistant" && text && !active && <MessageActions>
              <MessageAction label="复制回复" onClick={() => void navigator.clipboard.writeText(text).then(() => new Notice("已复制")).catch(() => new Notice("复制失败，请手动选择文本"))}><Copy size={14} /></MessageAction>
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
      {running && props.statusText && <div className="qa-status" role="status">{props.statusText}</div>}
      {attachmentError && <div className="qa-error" role="alert">{attachmentError}</div>}
      <PromptInput onSubmit={(event) => { event.preventDefault(); void submit(input); }} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); } }}>
        <input type="file" multiple hidden ref={upload} onChange={(e) => { void addFiles(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ""; }} />
        <Attachments files={attachments} onRemove={(id) => setAttachments((current) => current.filter((a) => a.id !== id))} />
        {reading > 0 && <div className="qa-status">正在读取附件…</div>}
        {props.note && <PromptInputHeader><span className="qa-note"><FileText size={13} /><span>{props.note.basename}</span>
          <button type="button" disabled={running} onClick={props.onToggleNote}><X size={12} /><span className="qiaomu-agent__sr-only">不附加当前笔记</span></button></span></PromptInputHeader>}
        <label htmlFor={inputId} className="qiaomu-agent__sr-only">给 Agent 的消息</label>
        <PromptInputTextarea id={inputId} ref={textarea} value={input} aria-controls={menuOpen ? `${inputId}-menu` : undefined} aria-activedescendant={menuOpen ? `${inputId}-option-${menuIndex}` : undefined}
          onKeyDown={(e) => {
            if (!menuOpen || e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((n) => (n + (e.key === "ArrowDown" ? 1 : promptChoices.length)) % (promptChoices.length + 1)); }
            if (e.key === "Escape") { e.preventDefault(); setMenuDismissed(true); }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); choosePrompt(menuIndex); }
          }}
          onChange={(event) => {
            const value = event.currentTarget.value; const cursor = event.currentTarget.selectionStart;
            setInput(value); setMenuDismissed(false); setMenuIndex(0);
            if (startsFileMention(value, cursor) && !(event.nativeEvent as InputEvent).isComposing) props.onPickFile((file) => { addAttachment(file); setInput((current) => current === value ? value.slice(0, cursor - 1) + value.slice(cursor) : current); textarea.current?.focus(); });
          }}
          onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { if (!e.clipboardData.getData("text/plain")) e.preventDefault(); void addFiles(files); } }}
          placeholder="输入消息，/ 选择 Prompt，@ 引用文件…" />
        <PromptInputFooter><PromptInputTools>
          <button type="button" onClick={() => upload.current?.click()} aria-label="上传附件"><Paperclip size={16} /></button>
          <button type="button" onClick={() => props.onPickFile(addAttachment)} aria-label="选择库内文件"><AtSign size={16} /></button>
          {!props.note && <button type="button" disabled={running} onClick={props.onToggleNote}><Plus size={16} /><span className="qiaomu-agent__sr-only">附加当前笔记</span></button>}
          <button className="qa-skill" type="button" disabled={running} onClick={(event) => props.onSkill(event.nativeEvent)}>{props.skillLabel}</button>
          <label className="qa-mode"><span className="qiaomu-agent__sr-only">修改权限</span><select value={props.permission} disabled={running} onChange={(event) => props.onPermission(event.target.value as PermissionMode)}><option value="plan">仅建议</option><option value="edit">允许修改</option></select></label>
        </PromptInputTools>
        <button className="qa-model" type="button" disabled={running || props.modelLoading} onClick={props.onModels}><span>{props.backendLabel}</span><ChevronDown size={12} /></button>
        {!!props.efforts.length && <label className="qa-effort"><span className="qiaomu-agent__sr-only">推理强度</span><select value={props.effort} disabled={running} onChange={(e) => props.onEffort(e.target.value)}><option value="">默认</option>{props.efforts.map((effort) => <option key={effort} value={effort}>{({ low: "低", medium: "中", high: "高", xhigh: "极高", minimal: "最小", none: "无", max: "最高" } as Record<string, string>)[effort] || effort}</option>)}</select></label>}
        <PromptInputSubmit status={status} disabled={(!input.trim() && !attachments.length) || reading > 0 || props.modelLoading} onStop={() => { setStopped(true); void stop().then(props.onPersist); }} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </>;
}
