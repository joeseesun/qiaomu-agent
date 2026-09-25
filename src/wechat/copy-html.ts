import type { App } from "obsidian";
import { imageMime } from "./publisher";
import type { ArticleImage } from "./render-note";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

/** Copy the exact article HTML used by both preview and draft, with local images embedded. */
export async function copyWechatHtml(app: App, html: string, images: ArticleImage[]): Promise<void> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const image of Array.from(doc.querySelectorAll("img[data-qm-image]"))) {
    const source = images.find((item) => item.id === image.getAttribute("data-qm-image"));
    if (source?.kind === "generated") image.setAttribute("src", await blobToDataUrl(source.blob));
    if (source?.kind === "vault") image.setAttribute("src", await blobToDataUrl(new Blob([await app.vault.readBinary(source.file)], { type: imageMime(source.file.name) ?? "image/png" })));
    image.removeAttribute("data-qm-image");
  }
  await navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([doc.body.innerHTML], { type: "text/html" }),
    "text/plain": new Blob([doc.body.textContent ?? ""], { type: "text/plain" }),
  })]);
}
