import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { ChatActivity, ChatBackend, ChatMessage, ChatRequest } from "../types";

export type AgentMessage = UIMessage<
  { createdAt: number; backend?: string; sourcePath?: string; attachments?: import("../types").ChatAttachment[] },
  { activity: ChatActivity; status: string }
>;
export const messageText = (message: AgentMessage): string => message.parts
  .filter((part) => part.type === "text").map((part) => part.text).join("");

export function toStoredMessage(message: AgentMessage): ChatMessage {
  return {
    id: message.id, role: message.role === "system" ? "status" : message.role,
    content: messageText(message), createdAt: message.metadata?.createdAt ?? Date.now(),
    backend: message.metadata?.backend, sourcePath: message.metadata?.sourcePath,
    attachments: message.metadata?.attachments,
    activities: message.parts.filter((p) => p.type === "data-activity").map((p) => p.data),
  };
}
export function fromStoredMessage(message: ChatMessage): AgentMessage {
  return {
    id: message.id, role: message.role === "status" ? "system" : message.role,
    metadata: { createdAt: message.createdAt, backend: message.backend, sourcePath: message.sourcePath, attachments: message.attachments },
    parts: [ { type: "text", text: message.content },
      ...(message.activities ?? []).map((data) => ({ type: "data-activity" as const, id: data.id, data })) ],
  };
}

type PreparedRequest = { backend: ChatBackend; request: ChatRequest };
/** Converts native callbacks to SDK chunks without an HTTP server or protocol replacement. */
export class AgentTransport implements ChatTransport<AgentMessage> {
  constructor(private readonly prepare: (messages: AgentMessage[], signal: AbortSignal) => Promise<PreparedRequest>) {}
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
        void (async () => {
          try {
            controller.signal.throwIfAborted();
            const { backend, request } = await this.prepare(options.messages, controller.signal);
            controller.signal.throwIfAborted();
            emit({ type: "start", messageMetadata: { createdAt: Date.now(), backend: backend.label, sourcePath: request.activeFilePath } });
            emit({ type: "text-start", id: "response" });
            const activities = new Map<string, ChatActivity>();
            await backend.send(request, {
              onText: (delta) => emit({ type: "text-delta", id: "response", delta }),
              onStatus: (data) => emit({ type: "data-status", data, transient: true }),
              onActivity: (next) => {
                const previous = activities.get(next.id);
                const data = { ...previous, ...next, label: next.label === "工具调用" && previous ? previous.label : next.label, detail: next.detail ?? previous?.detail };
                activities.set(next.id, data);
                emit({ type: "data-activity", id: next.id, data });
              },
            }, controller.signal);
            controller.signal.throwIfAborted();
            emit({ type: "text-end", id: "response" });
            emit({ type: "finish", finishReason: "stop" });
          } catch (error) {
            emit(controller.signal.aborted ? { type: "abort" } : { type: "error", errorText: error instanceof Error ? error.message : String(error) });
          } finally {
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
