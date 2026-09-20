// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModelList } from "../src/ui/model-list";
afterEach(cleanup);
const setup = (error = "", loading = false) => {
  const props = { models: [{ id: "a", name: "Alpha", efforts: [] }, { id: "b", name: "中文模型", efforts: [] }], selected: "a", loading, error, onSelect: vi.fn(), onRetry: vi.fn(), onBack: vi.fn(), onManual: vi.fn(), onManage: vi.fn() };
  return { ...render(<ModelList {...props} />), props };
};
it("searches, exposes empty state, supports keyboard navigation and selection", () => {
  const { props } = setup();
  const input = screen.getByRole("textbox", { name: "搜索模型" });
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Alpha" }));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "中文模型" }));
  fireEvent.change(input, { target: { value: "不存在" } });
  expect(screen.getByText("没有匹配的模型")).toBeTruthy();
  fireEvent.change(input, { target: { value: "中文" } });
  fireEvent.click(screen.getByRole("button", { name: "中文模型" }));
  expect(props.onSelect).toHaveBeenCalledWith(props.models[1]);
});
it("keeps recovery and management actions reachable on failure", () => {
  const { props } = setup("连接失败");
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "重新获取" }));
  fireEvent.click(screen.getByRole("button", { name: "模型管理…" }));
  fireEvent.click(screen.getByRole("button", { name: "输入模型 ID…" }));
  expect(props.onRetry).toHaveBeenCalledOnce(); expect(props.onManage).toHaveBeenCalledOnce(); expect(props.onManual).toHaveBeenCalledOnce();
});
