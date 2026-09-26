import { expect, it, vi } from "vitest";
import { PiRpcBackend } from "../src/services/pi-rpc-backend";
import type { ChatRequest } from "../src/types";

const mock = vi.hoisted(() => ({ spawn: vi.fn(), commands: [] as string[] }));
vi.mock("../src/services/runtime-require", () => ({ getRuntimeRequire: () => (name: string) => name === "child_process" ? { spawn: mock.spawn } : { env: {} } }));

const request: ChatRequest = { prompt: "你好", systemPrompt: "保留双链", cwd: "/tmp/vault", permissionMode: "plan", history: [] };
const detection = { id: "pi", label: "Pi", command: "pi", path: "/pi", version: "0.87.1", available: true, callable: true };

it("keeps Pi RPC alive between prompts and streams deltas", async () => {
  mock.commands = [];
  mock.spawn.mockImplementation((_path: string, args: string[]) => {
    expect(args).toContain("rpc");
    expect(args).toContain("read,grep,find,ls");
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const child = {
      exitCode: null, killed: false,
      stdout: { on: (_event: string, listener: (...args: unknown[]) => void) => { listeners.stdout = listener; } },
      stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn(),
      stdin: { writable: true, end: vi.fn(), write(data: string) {
        const command = JSON.parse(data) as { id: string; type: string };
        mock.commands.push(command.type);
        queueMicrotask(() => {
          listeners.stdout?.(new TextEncoder().encode(`${JSON.stringify({ type: "response", id: command.id, command: command.type, success: true, data: { disposition: "started" } })}\n`));
          if (command.type === "prompt") {
            listeners.stdout?.(new TextEncoder().encode(`${JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "好" } })}\n`));
            listeners.stdout?.(new TextEncoder().encode('{"type":"agent_settled"}\n'));
          }
        });
      } },
    };
    return child;
  });
  const backend = new PiRpcBackend(detection);
  const onText = vi.fn();
  await backend.prepare(request);
  expect(mock.commands).toEqual([]);
  await backend.send(request, { onText, onStatus: vi.fn() }, new AbortController().signal);
  await backend.send({ ...request, prompt: "继续" }, { onText, onStatus: vi.fn() }, new AbortController().signal);
  expect(mock.spawn).toHaveBeenCalledTimes(1);
  expect(mock.commands).toEqual(["prompt", "prompt"]);
  expect(onText).toHaveBeenCalledTimes(2);
  backend.resetSession();
  await backend.send(request, { onText, onStatus: vi.fn() }, new AbortController().signal);
  expect(mock.commands.slice(-2)).toEqual(["new_session", "prompt"]);
  await backend.shutdown();
});
