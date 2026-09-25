import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { ApprovalRequest, ApprovalState, ChatActivity, ChatAttachment, ChatBackend, ChatCallbacks, ChatMessage, ChatRequest, ContextUsage, FileChange, GeneratedAttachment, TurnChanges } from "../types";

export type AgentMessage = UIMessage<
  { createdAt: number; backend?: string; sourcePath?: string; attachments?: import("../types").ChatAttachment[] },
  { activity: ChatActivity; status: string; attachment: ChatAttachment; changes: TurnChanges; approval: ApprovalState; usage: ContextUsage }
>;

/** Per-turn host services: change tracking, file access and approvals. */
export interface TurnHooks {
  onFileIntent?: ChatCallbacks["onFileIntent"];
  host?: ChatCallbacks["host"];
  awaitApproval?: (request: ApprovalRequest, signal: AbortSignal) => Promise<string | null>;
  /** Collects what the turn changed; called once, also after errors and aborts. */
  finish?: () => Promise<FileChange[]>;
  /** Receives changes the stream could no longer carry (the turn was stopped). */
  onLateChanges?: (changes: FileChange[]) => void;
}

/** Stored conversations keep file contents only up to this total; larger turns stay listed but not restorable. */
export const MAX_STORED_CHANGE_BYTES = 1_500_000;

export function storableChanges(changes: TurnChanges): TurnChanges {
  let budget = MAX_STORED_CHANGE_BYTES;
  return {
    ...changes,
    files: changes.files.map((file) => {
      const size = (file.before?.length ?? 0) + (file.after?.length ?? 0);
      if (size <= budget) { budget -= size; return file; }
      return { path: file.path, before: null, after: null, tracked: false, outside: file.outside, binary: true };
    }),
  };
}
/** Context usage reported for this reply; reports share one id, so the part is updated in place. */
export function messageUsage(message: AgentMessage): ContextUsage | undefined {
  const part = message.parts.find((p) => p.type === "data-usage");
  return part?.type === "data-usage" ? part.data : undefined;
}

export const messageText = (message: AgentMessage): string => message.parts
  .filter((part) => part.type === "text").map((part) => part.text).join("");

export function toStoredMessage(message: AgentMessage): ChatMessage {
  const attachments = new Map<string, ChatAttachment>();
  for (const attachment of message.metadata?.attachments ?? []) attachments.set(attachment.id, attachment);
  for (const part of message.parts) if (part.type === "data-attachment") attachments.set(part.data.id, part.data);
  return {
    id: message.id, role: message.role === "system" ? "status" : message.role,
    content: messageText(message), createdAt: message.metadata?.createdAt ?? Date.now(),
    backend: message.metadata?.backend, sourcePath: message.metadata?.sourcePath,
    attachments: [...attachments.values()].map((attachment) => attachment.vaultPath ? { ...attachment, url: undefined } : attachment),
    activities: message.parts.filter((p) => p.type === "data-activity").map((p) => p.data),
    changes: (() => { const part = message.parts.find((p) => p.type === "data-changes"); return part && part.type === "data-changes" ? storableChanges(part.data) : undefined; })(),
    usage: messageUsage(message),
  };
}
export function fromStoredMessage(message: ChatMessage, resolveAttachment: (attachment: ChatAttachment) => ChatAttachment = (value) => value): AgentMessage {
  const attachments = (message.attachments ?? []).map(resolveAttachment);
  return {
    id: message.id, role: message.role === "status" ? "system" : message.role,
    metadata: { createdAt: message.createdAt, backend: message.backend, sourcePath: message.sourcePath, attachments },
    parts: [ { type: "text", text: message.content },
      ...(message.activities ?? []).map((data) => ({ type: "data-activity" as const, id: data.id, data })),
      ...(message.changes?.files.length ? [{ type: "data-changes" as const, id: "changes", data: message.changes }] : []),
      ...(message.usage ? [{ type: "data-usage" as const, id: "usage", data: message.usage }] : []),
      ...(message.role === "assistant" ? attachments.flatMap((data) => [
        { type: "file" as const, url: data.url ?? "", mediaType: data.mediaType, filename: data.name },
        { type: "data-attachment" as const, id: data.id, data },
      ]) : []) ],
  };
}

type PreparedRequest = { backend: ChatBackend; request: ChatRequest; turn?: TurnHooks };
/** Converts native callbacks to SDK chunks without an HTTP server or protocol replacement. */
export class AgentTransport implements ChatTransport<AgentMessage> {
  constructor(
    private readonly prepare: (messages: AgentMessage[], signal: AbortSignal) => Promise<PreparedRequest>,
    private readonly storeAttachment?: (attachment: GeneratedAttachment) => Promise<ChatAttachment>,
  ) {}
  async sendMessages(options: Parameters<ChatTransport<AgentMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const controller = new AbortController();
    let abortStream: (() => void) | undefined;
    const abort = () => { controller.abort(); abortStream?.(); };
    options.abortSignal?.addEventListener("abort", abort, { once: true });
    if (options.abortSignal?.aborted) abort();
    let closed = false;
    const cleanup = () => options.abortSignal?.removeEventListener("abort", abort);
    return new ReadableStream<UIMessageChunk>({
      start: (stream) => {
        const emit = (chunk: UIMessageChunk) => { if (!closed) stream.enqueue(chunk); };
        abortStream = () => {
          if (closed) return;
          emit({ type: "abort" }); closed = true; stream.close(); cleanup();
        };
        let turn: TurnHooks | undefined;
        void (async () => {
          try {
            controller.signal.throwIfAborted();
            const prepared = await this.prepare(options.messages, controller.signal);
            const { backend, request } = prepared;
            turn = prepared.turn;
            controller.signal.throwIfAborted();
            emit({ type: "start", messageMetadata: { createdAt: Date.now(), backend: backend.label, sourcePath: request.activeFilePath } });
            emit({ type: "text-start", id: "response" });
            const activities = new Map<string, ChatActivity>();
            const hooks = turn;
            await backend.send(request, {
              onText: (delta) => emit({ type: "text-delta", id: "response", delta }),
              onStatus: (data) => emit({ type: "data-status", data, transient: true }),
              onActivity: (next) => {
                const previous = activities.get(next.id);
                const data = { ...previous, ...next, label: next.label === "工具调用" && previous ? previous.label : next.label, detail: next.detail ?? previous?.detail };
                activities.set(next.id, data);
                emit({ type: "data-activity", id: next.id, data });
              },
              onAttachment: async (incoming) => {
                const attachment = this.storeAttachment ? await this.storeAttachment(incoming) : {
                  id: incoming.id, name: incoming.name, mediaType: incoming.mediaType, size: incoming.size,
                  url: incoming.base64 ? `data:${incoming.mediaType};base64,${incoming.base64}` : incoming.localPath,
                };
                if (!attachment.url) throw new Error(`无法展示生成文件 ${attachment.name}`);
                emit({ type: "file", url: attachment.url, mediaType: attachment.mediaType });
                emit({ type: "data-attachment", id: attachment.id, data: attachment });
              },
              onUsage: (data) => emit({ type: "data-usage", id: "usage", data }),
              onFileIntent: hooks?.onFileIntent,
              host: hooks?.host,
              requestApproval: hooks?.awaitApproval ? async (approval) => {
                emit({ type: "data-approval", id: approval.id, data: { ...approval, status: "pending" } });
                const chosen = await hooks.awaitApproval!(approval, controller.signal).catch(() => null);
                emit({ type: "data-approval", id: approval.id, data: { ...approval, status: chosen ? "decided" : "cancelled", ...(chosen ? { chosen } : {}) } });
                return chosen;
              } : undefined,
            }, controller.signal);
            controller.signal.throwIfAborted();
            const finish = turn?.finish; turn = undefined;
            const files = finish ? await finish() : [];
            if (files.length) emit({ type: "data-changes", id: "changes", data: { files } });
            emit({ type: "text-end", id: "response" });
            emit({ type: "finish", finishReason: "stop" });
          } catch (error) {
            emit(controller.signal.aborted ? { type: "abort" } : { type: "error", errorText: error instanceof Error ? error.message : String(error) });
          } finally {
            // Stopped or failed turns may still have written files; report them outside the closed stream.
            const finish = turn?.finish; const late = turn?.onLateChanges; turn = undefined;
            if (finish) {
              const files = await finish().catch(() => [] as FileChange[]);
              if (files.length) { if (!closed) emit({ type: "data-changes", id: "changes", data: { files } }); else late?.(files); }
            }
            cleanup();
            if (!closed) { closed = true; stream.close(); }
          }
        })();
      },
      cancel: () => { closed = true; controller.abort(); cleanup(); },
    });
  }
  async reconnectToStream(): Promise<null> { return null; }
}
