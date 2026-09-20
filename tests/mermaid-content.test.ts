import { expect, it } from "vitest";
import { splitMermaid, mermaidFrameDocument } from "../src/services/mermaid-content";

it("extracts complete Mermaid without passing its fence to the host trust processor", () => {
  expect(splitMermaid("前文\n```mermaid\nflowchart LR\nA --> B\n```\n后文")).toEqual([
    { kind: "markdown", text: "前文" }, { kind: "mermaid", text: "flowchart LR\nA --> B" }, { kind: "markdown", text: "后文" },
  ]);
});
it("keeps incomplete streams and nested fences as code until complete", () => {
  const incomplete = "```mermaid\nflowchart LR\nA -->";
  expect(splitMermaid(incomplete)).toEqual([{ kind: "pending", text: "flowchart LR\nA -->" }]);
  const nested = "````markdown\n```mermaid\nA-->B\n```\n````";
  expect(splitMermaid(nested)).toEqual([{ kind: "markdown", text: nested }]);
  expect(splitMermaid("~~~mermaid\ngraph LR\nA-->B\n~~~")[0]?.kind).toBe("mermaid");
});
it("escapes source out of script context and denies external resources", () => {
  const doc = mermaidFrameDocument("/* library */", '</script><script>alert(1)</script>', "abc123", false);
  expect(doc).not.toContain('</script><script>alert');
  expect(doc).toContain("\\u003c/script>");
  expect(doc).toContain("default-src 'none'");
  expect(doc).toContain("connect-src 'none'");
  expect(doc).toContain("securityLevel:'strict'");
});
