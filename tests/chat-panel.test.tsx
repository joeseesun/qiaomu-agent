// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chat } from "@ai-sdk/react";
import { ChatPanel } from "../src/ui/chat-panel";
import { AgentTransport, type AgentMessage } from "../src/services/chat-transport";
import { Platform, type App, type Component } from "obsidian";
import type { ComponentProps, ReactNode } from "react";
vi.mock("obsidian", () => ({
  Component: class {}, Notice: class {},
  Platform: { isDesktopApp: true },
  MarkdownRenderer: { render: async (_: unknown, text: string, target: HTMLElement) => { target.textContent = text; } },
}));
vi.mock("mermaid/dist/mermaid.min.js", () => ({ default: "" }));
vi.mock("../src/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, ConversationScrollButton: () => null,
}));
afterEach(() => { cleanup(); Platform.isDesktopApp = true; });
function setup() {
  const send = vi.fn(async (_request, callbacks) => { callbacks.onText("测试回复"); });
  const chat = new Chat<AgentMessage>({ transport: new AgentTransport(async (messages) => ({ backend: { id: "mock", label: "Mock", send }, request: { prompt: "test", systemPrompt: "", cwd: null, permissionMode: "plan", history: [], attachments: messages.at(-1)?.metadata?.attachments } })) });
  const props: ComponentProps<typeof ChatPanel> = {
    chat, app: {} as App, parent: { addChild() {}, removeChild() {} } as unknown as Component,
    backendLabel: "Mock", skillLabel: "技能", permission: "plan", note: null, statusText: "", prompts: ["总结"], prefill: "", prefillVersion: 0,
    onConnection: vi.fn(), onNew: vi.fn(), onHistory: vi.fn(), onSkill: vi.fn(), onPermission: vi.fn(), onToggleNote: vi.fn(), onPersist: async () => {},
    efforts: ["low", "high"], effort: "", modelLoading: false, onModels: vi.fn(), onEffort: vi.fn(), customPrompts: [{ id: "p", name: "测试模板", body: "自定义内容" }], onManagePrompts: vi.fn(), onPickFile: vi.fn(), onValidateAttachments: vi.fn(), onAppend: vi.fn(),
  };
  const result = render(<ChatPanel {...props} />);
  return { ...result, props, send, chat, input: screen.getByLabelText("给 Agent 的消息") };
}
it("mobile Enter does not submit; the send button still works", async () => {
  Platform.isDesktopApp = false;
  const { input, send } = setup();
  fireEvent.change(input, { target: { value: "手机中文输入" } });
  expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
});
it("slash Enter inserts a template, Escape preserves draft, and IME Enter does not send", async () => {
  const { input, send } = setup();
  fireEvent.change(input, { target: { value: "/测试" } });
  fireEvent.keyDown(input, { key: "Enter" }); expect((input as HTMLTextAreaElement).value).toBe("自定义内容"); expect(send).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "/" } }); fireEvent.keyDown(input, { key: "Escape" }); expect(screen.queryByRole("listbox")).toBeNull(); expect((input as HTMLTextAreaElement).value).toBe("/");
  fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: "Enter", isComposing: true }); expect(send).not.toHaveBeenCalled(); fireEvent.compositionEnd(input);
});
it("pasted images become removable attachments and reach the request", async () => {
  const { input, container, send, chat } = setup();
  const image = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" });
  fireEvent.paste(input, { clipboardData: { files: [image], getData: () => "" } });
  await screen.findByRole("button", { name: "移除 test.png" });
  await waitFor(() => expect(screen.queryByText("正在读取附件…")).toBeNull());
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  await waitFor(() => expect(chat.status).toBe("ready"));
  expect(send.mock.calls[0]![0].attachments[0].url).toMatch(/^data:image\/png;base64,/);
  expect(screen.getByRole("button", { name: "追加到今日日记" }).textContent).toBe("追加到今日日记");
});
it("unsupported file upload is explicit and does not erase text", async () => {
  const { input, container } = setup(); fireEvent.change(input, { target: { value: "保留草稿" } });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["data"], "bad.exe")] } });
  await screen.findByRole("alert"); expect((input as HTMLTextAreaElement).value).toBe("保留草稿");
});
it("model/effort actions and icon-only reply actions invoke the right callbacks", async () => {
  const { input, container, props } = setup();
  fireEvent.click(screen.getByRole("button", { name: "模型与推理" }));
  expect(container.querySelector(".lucide-brain")).toBeNull();
  expect(container.querySelector(".qa-effort-label")).toBeTruthy();
  fireEvent.change(screen.getByRole("slider", { name: /推理强度/ }), { target: { value: "2" } }); expect(props.onEffort).toHaveBeenCalledWith("high");
  fireEvent.click(screen.getByRole("button", { name: "Mock" })); expect(props.onModels).toHaveBeenCalledOnce();
  expect(props.onModels).toHaveBeenCalledWith({ x: expect.any(Number), y: expect.any(Number) });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("仅建议")).toBeNull();
  expect(screen.queryByText("🧠")).toBeNull();
  fireEvent.change(input, { target: { value: "hello" } }); fireEvent.submit(container.querySelector("form")!);
  fireEvent.click(await screen.findByRole("button", { name: "追加到指定文件" })); expect(props.onAppend).toHaveBeenCalledWith("测试回复", false);
});

it("composer popovers close with Escape, outside click and focus departure without losing draft", () => {
  const { input, props } = setup();
  fireEvent.change(input, { target: { value: "保留草稿" } });
  const trigger = screen.getByRole("button", { name: "添加附件与工具" });
  fireEvent.click(trigger);
  expect(screen.getByRole("button", { name: "上传附件" })).toBe(document.activeElement);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.pointerDown(input); expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger); fireEvent.click(screen.getByRole("button", { name: "选择库内文件" }));
  expect(props.onPickFile).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger); fireEvent.blur(screen.getByRole("button", { name: "上传附件" }), { relatedTarget: input });
  expect(screen.queryByRole("dialog")).toBeNull(); expect((input as HTMLTextAreaElement).value).toBe("保留草稿");
});

it("does not invent reasoning capabilities and dismisses controls while loading", () => {
  const { props, rerender } = setup();
  rerender(<ChatPanel {...props} efforts={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "模型与推理" }));
  expect(screen.queryByRole("slider")).toBeNull();
  rerender(<ChatPanel {...props} modelLoading />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect((screen.getByRole("button", { name: "模型与推理" }) as HTMLButtonElement).disabled).toBe(true);
});
