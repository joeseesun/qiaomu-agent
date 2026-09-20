import { expect, it } from "vitest";
import { AgentTransport, fromStoredMessage, toStoredMessage } from "../src/services/chat-transport";
import type { ChatRequest } from "../src/types";
const request: ChatRequest = { prompt: "hello", systemPrompt: "", cwd: null, permissionMode: "plan", history: [] };
const options = { chatId: "test", messages: [], trigger: "submit-message" as const, messageId: undefined, abortSignal: undefined };
it("streams SDK text and activity updates with stable identity", async () => {
  const transport = new AgentTransport(async () => ({ request, backend: { id: "test", label: "test", async send(_, c) {
    c.onText("你"); c.onText("好"); c.onActivity?.({ id: "a", label: "读取", status: "running" }); c.onActivity?.({ id: "a", label: "工具调用", status: "completed" });
  } } }));
  const reader = (await transport.sendMessages(options)).getReader(); const chunks = [];
  for (;;) { const item = await reader.read(); if (item.done) break; chunks.push(item.value); }
  expect(chunks.filter((c) => c.type === "text-delta").map((c) => c.delta).join("")).toBe("你好");
  expect(chunks.at(-1)).toMatchObject({ type: "finish" });
  expect(chunks.filter((c) => c.type === "data-activity").at(-1)).toMatchObject({ id: "a", data: { label: "读取", status: "completed" } });
});
it("surfaces prepare failures and pre-aborted requests", async () => {
  const transport = new AgentTransport(async () => { throw new Error("broken"); });
  const reader = (await transport.sendMessages(options)).getReader();
  expect((await reader.read()).value).toMatchObject({ type: "error", errorText: "broken" });
  const controller = new AbortController(); controller.abort();
  const cancelled = (await transport.sendMessages({ ...options, abortSignal: controller.signal })).getReader();
  expect((await cancelled.read()).value).toMatchObject({ type: "abort" });
});
it("preserves metadata and attachments across storage conversion", () => {
  const message = { id: "1", role: "user" as const, content: "hello", createdAt: 1, sourcePath: "中文.md", attachments: [{ id: "a", name: "a.txt", mediaType: "text/plain", size: 1, text: "a" }] };
  expect(toStoredMessage(fromStoredMessage(message))).toMatchObject(message);
});
it("closes promptly on abort even when the backend has not settled", async () => {
  let release!: () => void;
  const transport = new AgentTransport(async () => ({ request, backend: { id: "slow", label: "slow", send: () => new Promise<void>((resolve) => { release = resolve; }) } }));
  const controller = new AbortController();
  const reader = (await transport.sendMessages({ ...options, abortSignal: controller.signal })).getReader();
  expect((await reader.read()).value?.type).toBe("start");
  expect((await reader.read()).value?.type).toBe("text-start");
  controller.abort(); expect((await reader.read()).value?.type).toBe("abort"); expect((await reader.read()).done).toBe(true);
  release();
});
