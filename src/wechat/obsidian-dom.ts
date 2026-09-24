/**
 * Turns Obsidian reading-view DOM into plain article HTML that the qmblog WeChat
 * normalizers understand. Pure DOM work so it can be unit-tested without the host.
 */

const REMOVE_SELECTORS = [
  ".copy-code-button",
  ".heading-collapse-indicator",
  ".collapse-indicator",
  ".list-collapse-indicator",
  ".list-bullet",
  ".markdown-embed-link",
  ".markdown-embed-title",
  ".edit-block-button",
  ".frontmatter",
  ".frontmatter-container",
  ".mod-header",
  ".mod-footer",
  ".footnote-backref",
  "script",
  "style",
  "button",
];

function unwrap(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

function toSpan(element: Element): void {
  const span = element.ownerDocument.createElement("span");
  span.textContent = element.textContent ?? "";
  element.replaceWith(span);
}

/** Converts `.callout` blocks into `> [!kind] title` blockquotes handled by the blog normalizer. */
function convertCallouts(root: Element): void {
  const doc = root.ownerDocument;
  for (const callout of Array.from(root.querySelectorAll<HTMLElement>(".callout")).reverse()) {
    const kind = (callout.dataset.callout || "note").toLowerCase();
    const title = callout.querySelector(".callout-title-inner")?.textContent?.trim() ?? "";
    const content = callout.querySelector(".callout-content");
    const quote = doc.createElement("blockquote");
    const head = doc.createElement("p");
    head.textContent = `[!${kind}] ${title}`.trim();
    quote.appendChild(head);
    if (content) quote.append(...Array.from(content.childNodes));
    callout.replaceWith(quote);
  }
}

function unwrapEmbeds(root: Element, warnings: string[]): void {
  for (const embed of Array.from(root.querySelectorAll<HTMLElement>(".internal-embed")).reverse()) {
    if (embed.classList.contains("image-embed")) continue;
    const content = embed.querySelector(".markdown-embed-content .markdown-preview-view, .markdown-embed-content");
    if (embed.classList.contains("markdown-embed") && content && content.textContent?.trim()) {
      const section = embed.ownerDocument.createElement("section");
      section.append(...Array.from(content.childNodes));
      embed.replaceWith(section);
      continue;
    }
    const source = embed.getAttribute("src") || embed.getAttribute("alt") || "嵌入内容";
    warnings.push(`嵌入内容「${source}」无法发布到公众号，已保留为文字。`);
    const text = embed.ownerDocument.createElement("span");
    text.textContent = source;
    embed.replaceWith(text);
  }
}

export interface CleanOptions {
  warnings: string[];
}

export function cleanObsidianDom(root: Element, options: CleanOptions): void {
  const { warnings } = options;
  for (const element of Array.from(root.querySelectorAll(REMOVE_SELECTORS.join(",")))) element.remove();
  convertCallouts(root);
  unwrapEmbeds(root, warnings);

  // Image embeds keep only their <img>; width from `![[a.png|300]]` stays on the image.
  for (const embed of Array.from(root.querySelectorAll<HTMLElement>(".image-embed"))) {
    const image = embed.querySelector("img");
    if (image) embed.replaceWith(image); else embed.remove();
  }

  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a"))) {
    const href = link.getAttribute("href") ?? "";
    if (link.classList.contains("internal-link") || link.classList.contains("tag") || href.startsWith("#") || !/^https?:\/\//i.test(href)) {
      toSpan(link);
      continue;
    }
    for (const attribute of ["target", "rel", "class", "data-tooltip-position", "aria-label"]) link.removeAttribute(attribute);
  }

  for (const media of Array.from(root.querySelectorAll("iframe, video, audio, object, embed"))) {
    warnings.push("音视频或网页嵌入无法通过草稿接口发布，已移除，请在公众号后台手动插入。");
    media.remove();
  }

  for (const code of Array.from(root.querySelectorAll("pre > code"))) {
    // Prism tokens are discarded by the WeChat code block normalizer; keep the language only.
    const language = Array.from(code.classList).find((name) => name.startsWith("language-"));
    code.className = language ?? "";
    // Obsidian keeps the fence's final newline, which would render as an empty numbered line.
    code.textContent = (code.textContent ?? "").replace(/\r?\n$/, "");
    code.parentElement?.removeAttribute("tabindex");
  }

  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (name === "dir" || name === "tabindex" || name === "contenteditable" || name === "spellcheck") element.removeAttribute(name);
      else if (name.startsWith("data-") && !name.startsWith("data-qm-") && name !== "data-task") element.removeAttribute(name);
    }
  }
  for (const wrapper of Array.from(root.querySelectorAll("div.el-p, div.el-h1, div.el-h2, div.el-h3, div.el-h4, div.el-ul, div.el-ol, div.el-pre, div.el-blockquote, div.el-table, div.el-hr, div.el-div, div.el-section")).reverse()) unwrap(wrapper);
}

/** Replaces text tokens (math/Mermaid placeholders) with nodes produced by `create`. */
export function replaceTokens(root: Element, pattern: RegExp, create: (token: string) => Node | null): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data;
    const global = new RegExp(pattern.source, "g");
    if (!global.test(text)) continue;
    global.lastIndex = 0;
    const fragment = doc.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(global)) {
      const index = match.index ?? 0;
      if (index > last) fragment.appendChild(doc.createTextNode(text.slice(last, index)));
      fragment.appendChild(create(match[0]) ?? doc.createTextNode(match[0]));
      last = index + match[0].length;
    }
    if (last < text.length) fragment.appendChild(doc.createTextNode(text.slice(last)));
    node.replaceWith(fragment);
  }
}
