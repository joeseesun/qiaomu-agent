import { type App, type Component, getLinkpath, MarkdownRenderer, TFile } from "obsidian";
import { cleanObsidianDom, replaceTokens } from "./obsidian-dom";
import { prepareMarkdown } from "./markdown-prep";
import { mathToPng, mermaidToPng, type RasterImage } from "./rasterize";

export type ArticleImage =
  | { id: string; kind: "vault"; name: string; file: TFile }
  | { id: string; kind: "generated"; name: string; blob: Blob }
  | { id: string; kind: "remote"; name: string; url: string };

export interface RenderedNote {
  title: string;
  /** Clean article HTML. Every <img> carries `data-qm-image` and a previewable src. */
  html: string;
  images: ArticleImage[];
  warnings: string[];
  frontmatter: Record<string, unknown>;
  dispose(): void;
}

/** WeChat's article column is ~677px; render at that width so layouts match. */
const ARTICLE_WIDTH = 677;

async function waitForEmbeds(root: HTMLElement, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = root.querySelector(".internal-embed:not(.is-loaded)");
    if (!pending) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
}

function pathWithoutQuery(src: string): string {
  return src.replace(/[?#].*$/, "");
}

export async function renderNoteForWechat(app: App, file: TFile, component: Component): Promise<RenderedNote> {
  const raw = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  const frontmatter: Record<string, unknown> = { ...(cache?.frontmatter ?? {}) };
  const fmTitle = [frontmatter.title, frontmatter["标题"]].find((value) => typeof value === "string" && value.trim());
  const firstHeading = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(raw.replace(/^---[\s\S]*?\n---\s*\n/, ""))?.[1];
  const title = String(fmTitle ?? firstHeading ?? file.basename).trim();
  const prepared = prepareMarkdown(raw, title);

  const warnings: string[] = [];
  const images: ArticleImage[] = [];
  const objectUrls: string[] = [];
  const container = document.body.createDiv({ cls: "markdown-rendered qiaomu-wechat-render" });
  container.setCssStyles({ position: "fixed", left: "-20000px", top: "0", width: `${ARTICLE_WIDTH}px`, visibility: "hidden", pointerEvents: "none" });

  try {
    await MarkdownRenderer.render(app, prepared.markdown, container, file.path, component);
    await waitForEmbeds(container, 4000);

    // Map rendered resource URLs back to vault files for ![](...) style images.
    const byResource = new Map<string, TFile>();
    for (const embed of cache?.embeds ?? []) {
      const target = app.metadataCache.getFirstLinkpathDest(getLinkpath(embed.link), file.path);
      if (target) byResource.set(pathWithoutQuery(app.vault.getResourcePath(target)), target);
    }

    let counter = 0;
    const nextId = () => `img${counter++}`;
    for (const image of Array.from(container.querySelectorAll("img"))) {
      const embed = image.closest(".internal-embed");
      const src = image.getAttribute("src") ?? "";
      let target: TFile | null = null;
      if (embed) target = app.metadataCache.getFirstLinkpathDest(getLinkpath(embed.getAttribute("src") ?? ""), file.path);
      if (!target && src) target = byResource.get(pathWithoutQuery(src)) ?? null;
      const id = nextId();
      if (target instanceof TFile) {
        images.push({ id, kind: "vault", name: target.name, file: target });
      } else if (/^https?:\/\//i.test(src)) {
        images.push({ id, kind: "remote", name: src.split("/").pop() || "image", url: src });
      } else {
        warnings.push(`图片「${image.getAttribute("alt") || src || "未命名"}」找不到对应文件，已跳过。`);
        (embed ?? image).remove();
        continue;
      }
      image.setAttribute("data-qm-image", id);
    }

    const addGenerated = (raster: RasterImage, name: string, alt: string, inline: boolean) => {
      const id = nextId();
      images.push({ id, kind: "generated", name, blob: raster.blob });
      const url = URL.createObjectURL(raster.blob);
      objectUrls.push(url);
      const img = document.createElement("img");
      img.setAttribute("src", url);
      img.setAttribute("alt", alt);
      img.setAttribute("data-qm-image", id);
      img.setAttribute("style", inline
        ? `display:inline-block;vertical-align:middle;width:${raster.width}px;height:auto;margin:0 1px;`
        : `display:block;margin:0 auto;max-width:100%;width:${raster.width}px;height:auto;`);
      return img;
    };

    // Rasterize sequentially: MathJax and canvases are cheap, but uploads should keep document order.
    const mathNodes = new Map<string, Node>();
    for (const item of prepared.math) {
      const raster = await mathToPng(item.tex, item.display).catch(() => null);
      if (raster) {
        mathNodes.set(item.token, addGenerated(raster, `formula-${mathNodes.size + 1}.png`, item.tex, !item.display));
      } else {
        warnings.push(`公式无法转换为图片，已保留源码：${item.tex.slice(0, 40)}`);
        const code = document.createElement("code");
        code.textContent = item.tex;
        mathNodes.set(item.token, code);
      }
    }
    const mermaidNodes = new Map<string, Node>();
    for (const [index, item] of prepared.mermaid.entries()) {
      try {
        mermaidNodes.set(item.token, addGenerated(await mermaidToPng(item.source), `diagram-${index + 1}.png`, "Mermaid 图表", false));
      } catch (error) {
        warnings.push(`${error instanceof Error ? error.message : "Mermaid 图表渲染失败"}，已保留源码。`);
        const pre = document.createElement("pre");
        const code = pre.createEl("code", { cls: "language-mermaid" });
        code.textContent = item.source;
        mermaidNodes.set(item.token, pre);
      }
    }
    if (mathNodes.size) replaceTokens(container, /QMMATH[A-Z0-9]+X\d+X/, (token) => mathNodes.get(token) ?? null);
    if (mermaidNodes.size) {
      replaceTokens(container, /QMMERMAID[A-Z0-9]+X\d+X/, (token) => mermaidNodes.get(token) ?? null);
      // A block diagram inside its own paragraph should not stay nested in <p> when it is a <pre>.
      for (const pre of Array.from(container.querySelectorAll("p > pre"))) pre.parentElement!.replaceWith(pre);
    }

    cleanObsidianDom(container, { warnings });
    return {
      title,
      html: container.innerHTML,
      images,
      warnings: Array.from(new Set(warnings)),
      frontmatter,
      dispose: () => { for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url); },
    };
  } catch (error) {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    throw error;
  } finally {
    container.remove();
  }
}
