import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { AgentTransport } from "../src/services/chat-transport";
import { CliBackend } from "../src/services/cli-backend";
import { getCliProfile } from "../src/services/cli-profiles";
import type { ChatRequest, CliDetection } from "../src/types";

const runtime = vi.hoisted(() => ({ require: null as null | ((id: string) => unknown) }));
vi.mock("../src/services/runtime-require", () => ({ getRuntimeRequire: () => runtime.require }));
const request: ChatRequest = {
  prompt: "Edit the note", systemPrompt: "Keep vault conventions", cwd: "/vault", permissionMode: "edit", history: [],
  obsidianCli: { state: "ready", path: "/bin/obsidian", version: "1.14.5", detail: "" },
};
function fixture(stdout = "") {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
  const process = { spawn: vi.fn(() => child), execFile: vi.fn((_path, _args, _opts, callback) => callback(null, stdout, "")) };
  runtime.require = id => id === "process" ? { platform: "darwin", env: {} } : process;
  const backend = new CliBackend({ id: "antigravity", path: "/bin/agy" } as CliDetection);
  return { backend, child, process };
}
afterEach(() => { runtime.require = null; });

it("reads tab and aligned model rows without accepting headings", async () => {
  const { backend } = fixture("ID\tName\nModel ID  Display Name\n\u001b[32mgemini-flash\tGemini Flash\u001b[0m\nclaude-sonnet  Claude Sonnet\nAvailable models:\n");
  expect(await backend.listModels()).toEqual([{ id: "gemini-flash", name: "Gemini Flash", efforts: [] }, { id: "claude-sonnet", name: "Claude Sonnet", efforts: [] }]);
});

it.each([['plan', 'plan'], ['edit', 'accept-edits'], ['full', 'accept-edits']] as const)("maps %s without bypassing command approval", (permissionMode, mode) => {
  const args = getCliProfile("antigravity")!.buildArgs({ ...request, permissionMode });
  expect(args.slice(args.indexOf("--mode"), args.indexOf("--mode") + 2)).toEqual(["--mode", mode]);
  expect(args).not.toContain("--dangerously-skip-permissions");
  expect(args.join(" ")).not.toContain("Prefer it for vault-aware");
  expect(args.join(" ")).not.toContain("/bin/obsidian");
  expect(args.join(" ")).toContain("native file tools");
  expect(args.join(" ")).toContain("Keep vault conventions");
});

it("reports a denied command to chat even after text streamed and the CLI reports success", async () => {
  const { backend, child } = fixture();
  const transport = new AgentTransport(async () => ({ request, backend }));
  const reader = (await transport.sendMessages({
    chatId: "agy-denied", messages: [], trigger: "submit-message", messageId: undefined, abortSignal: undefined,
  })).getReader();
  expect((await reader.read()).value?.type).toBe("start");
  expect((await reader.read()).value?.type).toBe("data-status");
  child.stdout.emit("data", Buffer.from('{"event":"step_update","step_update":{"text_delta":"I will edit the note."}}\n'));
  child.stderr.emit("data", Buffer.from('Print mode: soft-denying tool confirmation "RunCommand" at step 6\r\n'));
  child.stdout.emit("data", Buffer.from('{"event":"result","result":{"status":"SUCCESS"}}\n'));
  child.emit("close", 0, null);
  const chunks = [];
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    chunks.push(item.value);
  }
  expect(chunks.map((chunk) => chunk.type)).toEqual(["text-start", "text-delta", "error"]);
  expect(chunks.at(-1)).toMatchObject({ errorText: expect.stringMatching(/权限.*拒绝/) });
});

it("cannot confirm completion from an empty zero-exit response", async () => {
  const { backend, child } = fixture();
  const onText = vi.fn();
  const sending = backend.send(request, { onText, onStatus: vi.fn() }, new AbortController().signal);
  const rejected = expect(sending).rejects.toThrow(/无法确认任务已完成/);
  child.emit("close", 0, null);
  await rejected;
  expect(onText).not.toHaveBeenCalled();
});

it.each(["EditFile", "RunCommand"])("rejects zero-exit %s soft denial, even split across chunks and followed by long logs", async tool => {
  const { backend, child } = fixture();
  const onText = vi.fn();
  const sending = backend.send(request, { onText, onStatus: vi.fn() }, new AbortController().signal);
  const rejected = expect(sending).rejects.toThrow(/权限.*拒绝/);
  child.stderr.emit("data", Buffer.from('Print mode: soft-den'));
  child.stderr.emit("data", Buffer.from(`ying tool confirmation "${tool}" at step 4\n`));
  child.stderr.emit("data", Buffer.from("x".repeat(20000)));
  child.stdout.emit("data", Buffer.from('{"event":"result","result":{"status":"SUCCESS"}}\n'));
  child.emit("close", 0, null);
  await rejected;
  expect(onText).not.toHaveBeenCalled();
});

it("still resolves an ordinary successful text response", async () => {
  const { backend, child } = fixture(); const onText = vi.fn();
  const sending = backend.send(request, { onText, onStatus: vi.fn() }, new AbortController().signal);
  child.stdout.emit("data", Buffer.from('{"event":"result","result":{"status":"SUCCESS","response":"Saved"}}\n'));
  child.emit("close", 0, null); await sending;
  expect(onText).toHaveBeenCalledWith("Saved");
});
