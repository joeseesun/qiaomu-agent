// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { inlineCss, parseDeclarations, selectorSpecificity, splitTopLevel } from "../src/wechat/inline-css";
import { prepareMarkdown, stripFrontmatter } from "../src/wechat/markdown-prep";
import { cleanObsidianDom, replaceTokens } from "../src/wechat/obsidian-dom";
import { buildWechatHtml, finalizeWechatImages, resolveWechatTheme } from "../src/wechat/export-html";
import { imageMime, metaFromFrontmatter, preflight } from "../src/wechat/publisher";

function fragment(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  return doc.getElementById("root")!;
}

describe("CSS inliner", () => {
  it("splits selectors and declarations without breaking nested values", () => {
    expect(splitTopLevel("a, b:not(.x, .y), c", ",")).toEqual(["a", "b:not(.x, .y)", "c"]);
    expect(parseDeclarations("font-family: \"A; B\", serif; color: red !important")).toEqual([
      { property: "font-family", value: "\"A; B\", serif", important: false },
      { property: "color", value: "red", important: true },
    ]);
  });

  it("orders by specificity", () => {
    expect(selectorSpecificity("#a .b p")).toBe(10101);
    expect(selectorSpecificity(".x > p:first-child")).toBe(201);
    expect(selectorSpecificity("p")).toBe(1);
  });

  it("applies the cascade: specificity, source order, inline style and !important", () => {
    const root = fragment('<p class="lead" style="margin: 3px">a</p><p>b</p>');
    inlineCss(root, `
      p { color: blue; font-size: 16px; }
      .lead { color: green; }
      p { color: red; margin: 1px; }
      #root p { line-height: 2; }
      p { font-size: 18px !important; }
      p:hover { color: black; }
    `);
    const [lead, plain] = Array.from(root.querySelectorAll("p")) as HTMLElement[];
    expect(lead!.style.color).toBe("green");
    expect(lead!.style.margin).toBe("3px");
    expect(lead!.style.lineHeight).toBe("2");
    expect(lead!.style.getPropertyPriority("font-size")).toBe("important");
    expect(plain!.style.color).toBe("red");
  });
});

describe("Markdown preparation", () => {
  it("strips frontmatter and a leading title heading", () => {
    const prepared = prepareMarkdown("---\ntitle: 你好\n---\n# 你好\n\n正文", "你好");
    expect(prepared.leadingHeading).toBe("你好");
    expect(prepared.markdown.trim()).toBe("正文");
    expect(stripFrontmatter("no frontmatter")).toBe("no frontmatter");
  });

  it("extracts math and Mermaid but leaves code, prices and escapes alone", () => {
    const input = [
      "质能 $E=mc^2$ 价格 $5 和 $10 元，转义 \\$x",
      "",
      "$$",
      "\\int_0^1 x\\,dx",
      "$$",
      "",
      "`$not math$`",
      "",
      "```js",
      "const a = '$b$';",
      "```",
      "",
      "```mermaid",
      "graph TD; A-->B",
      "```",
    ].join("\n");
    const prepared = prepareMarkdown(input, "t");
    expect(prepared.math.map((item) => [item.tex, item.display])).toEqual([["E=mc^2", false], ["\\int_0^1 x\\,dx", true]]);
    expect(prepared.mermaid).toHaveLength(1);
    expect(prepared.mermaid[0]!.source).toBe("graph TD; A-->B");
    expect(prepared.markdown).toContain("`$not math$`");
    expect(prepared.markdown).toContain("const a = '$b$';");
    expect(prepared.markdown).toContain("价格 $5 和 $10 元，转义 \\$x");
    expect(prepared.markdown).not.toContain("graph TD");
  });
});

describe("Obsidian DOM cleanup", () => {
  it("converts callouts, embeds, links and host chrome into plain article markup", () => {
    const root = fragment(`
      <h2 data-heading="标题">标题<span class="heading-collapse-indicator"></span></h2>
      <div class="callout" data-callout="tip"><div class="callout-title"><div class="callout-title-inner">提示</div></div><div class="callout-content"><p>内容</p></div></div>
      <p><span class="internal-embed image-embed is-loaded" src="a.png"><img src="data:,a" data-qm-image="img0"></span></p>
      <p><a class="internal-link" href="Other">Other</a> <a class="tag" href="#t">#t</a> <a class="external-link" href="https://example.com" target="_blank">外链</a></p>
      <pre class="language-js" tabindex="0"><code class="language-js is-loaded"><span class="token">let</span> a
</code><button class="copy-code-button">复制</button></pre>
      <iframe src="about:blank"></iframe>
    `);
    const warnings: string[] = [];
    cleanObsidianDom(root, { warnings });
    expect(root.querySelector("blockquote p")?.textContent).toBe("[!tip] 提示");
    expect(root.querySelector(".internal-embed")).toBeNull();
    expect(root.querySelector("img")?.getAttribute("data-qm-image")).toBe("img0");
    expect(root.querySelectorAll("a")).toHaveLength(1);
    expect(root.querySelector("a")?.getAttribute("target")).toBeNull();
    expect(root.querySelector("pre code")?.innerHTML).toBe("let a");
    expect(root.querySelector("button, iframe, .heading-collapse-indicator")).toBeNull();
    expect(root.querySelector("h2")?.hasAttribute("data-heading")).toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it("replaces placeholder tokens inside text", () => {
    const root = fragment("<p>前 QMMATHABCX0X 后</p>");
    replaceTokens(root, /QMMATH[A-Z0-9]+X\d+X/, () => root.ownerDocument.createElement("img"));
    expect(root.innerHTML).toBe("<p>前 <img> 后</p>");
  });
});

describe("WeChat HTML", () => {
  it("normalizes, themes and inlines styles while keeping image markers until publish", () => {
    const html = buildWechatHtml('<h2>小节</h2><p>正文</p><ul><li>一</li></ul><p><img src="data:,x" data-qm-image="img0"></p><pre><code>code</code></pre>', resolveWechatTheme("qiaomu-podcast"));
    expect(html).toContain("wechat-export-root");
    expect(html).not.toContain("<style");
    expect(html).toMatch(/<h2[^>]*style="/);
    expect(html).toContain('data-qm-image="img0"');
    const final = finalizeWechatImages(html, new Map([["img0", "https://mmbiz.qpic.cn/x/0"]]));
    expect(final).toContain('src="https://mmbiz.qpic.cn/x/0"');
    expect(final).not.toContain("data-qm-image");
  });
});

describe("publishing metadata", () => {
  it("reads Chinese or English properties with defaults", () => {
    const meta = metaFromFrontmatter({ 作者: "乔木", 摘要: "一句话", 封面: "![[cover.png]]" }, "标题", { accountId: "main", author: "默认", openComment: true });
    expect(meta).toMatchObject({ accountId: "main", author: "乔木", digest: "一句话", cover: "cover.png", title: "标题" });
    expect(imageMime("a.JPG")).toBe("image/jpeg");
    expect(imageMime("a.svg")).toBeNull();
  });

  it("blocks publishing without an account, title or cover", () => {
    const meta = metaFromFrontmatter({}, "", { accountId: "", author: "", openComment: false });
    const levels = preflight(meta, "<p>x</p>", false, ["公式降级"]).map((check) => check.level);
    expect(levels.filter((level) => level === "error").length).toBeGreaterThanOrEqual(3);
    expect(levels).toContain("warning");
  });
});
