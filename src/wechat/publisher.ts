import { type App, getLinkpath, TFile } from "obsidian";
import type { ArticleImage, RenderedNote } from "./render-note";
import { finalizeWechatImages } from "./export-html";
import type { WechatTransport } from "./transport";
import { inspectWechatPublishInput } from "./publish-inspect";
import { truncateWechatText, WECHAT_DRAFT_AUTHOR_MAX_CHARS, WECHAT_DRAFT_DIGEST_MAX_BYTES, WECHAT_DRAFT_DIGEST_MAX_CHARS } from "./publish-limits";

export interface DraftMeta {
  accountId: string;
  title: string;
  author: string;
  digest: string;
  sourceUrl: string;
  /** Frontmatter cover: vault link/path or http(s) URL. Empty → first article image. */
  cover: string;
  openComment: boolean;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", bmp: "image/bmp",
};

export function imageMime(name: string): string | null {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function stringField(frontmatter: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  }
  return "";
}

/** Reads publishing fields from frontmatter; Chinese and English keys are both accepted. */
export function metaFromFrontmatter(frontmatter: Record<string, unknown>, title: string, defaults: { accountId: string; author: string; openComment: boolean }): DraftMeta {
  return {
    accountId: stringField(frontmatter, "wechat_account", "公众号") || defaults.accountId,
    title,
    author: stringField(frontmatter, "author", "作者") || defaults.author,
    digest: stringField(frontmatter, "digest", "摘要", "description", "summary"),
    sourceUrl: stringField(frontmatter, "source_url", "原文链接", "url"),
    cover: stringField(frontmatter, "cover", "封面", "image").replace(/^!?\[\[(.+?)(?:\|.*)?\]\]$/, "$1"),
    openComment: defaults.openComment,
  };
}

/** Resolves the cover to something uploadable. */
export function resolveCover(app: App, sourcePath: string, meta: DraftMeta, images: ArticleImage[]): { kind: "url"; url: string } | { kind: "image"; image: ArticleImage } | null {
  if (meta.cover) {
    if (/^https?:\/\//i.test(meta.cover)) return { kind: "url", url: meta.cover };
    const file = app.metadataCache.getFirstLinkpathDest(getLinkpath(meta.cover), sourcePath);
    if (file instanceof TFile) return { kind: "image", image: { id: "cover", kind: "vault", name: file.name, file } };
  }
  const first = images[0];
  if (!first) return null;
  return first.kind === "remote" ? { kind: "url", url: first.url } : { kind: "image", image: first };
}

export interface PublishCheck { level: "error" | "warning" | "info"; message: string; fix: string; }

export function preflight(meta: DraftMeta, html: string, hasCover: boolean, warnings: string[]): PublishCheck[] {
  const result = inspectWechatPublishInput({
    accountId: meta.accountId,
    title: meta.title,
    normalizedTitle: meta.title,
    author: meta.author,
    normalizedAuthor: truncateWechatText(meta.author, WECHAT_DRAFT_AUTHOR_MAX_CHARS),
    digest: meta.digest,
    normalizedDigest: truncateWechatText(meta.digest, WECHAT_DRAFT_DIGEST_MAX_CHARS, WECHAT_DRAFT_DIGEST_MAX_BYTES),
    contentHtml: html,
    coverImageUrl: hasCover ? "cover" : "",
    resolvedCoverImageUrl: hasCover ? "cover" : "",
  });
  const checks: PublishCheck[] = result.checks
    .filter((check) => check.code !== "DATA_URL_IMAGE")
    .map((check) => ({ level: check.level, message: check.message, fix: check.suggested_fix ?? "" }));
  for (const message of warnings) checks.push({ level: "warning", message, fix: "" });
  return checks;
}

async function imageBytes(app: App, image: ArticleImage): Promise<{ data: ArrayBuffer; type: string; name: string }> {
  if (image.kind === "generated") return { data: await image.blob.arrayBuffer(), type: image.blob.type || "image/png", name: image.name };
  if (image.kind === "vault") {
    const type = imageMime(image.file.name);
    if (!type) throw new Error(`公众号不支持的图片格式：${image.file.name}`);
    return { data: await app.vault.readBinary(image.file), type, name: image.file.name };
  }
  throw new Error("远程图片由 Bridge 直接抓取");
}

export interface PublishProgress { (message: string): void; }

/** Uploads local/generated images, then creates a draft. Never publishes directly. */
export async function publishDraft(options: {
  app: App;
  client: WechatTransport;
  note: RenderedNote;
  file: TFile;
  wechatHtml: string;
  meta: DraftMeta;
  signal?: AbortSignal;
  onProgress?: PublishProgress;
}): Promise<{ mediaId: string; accountName: string }> {
  const { app, client, note, meta, onProgress } = options;
  const uploadable = note.images.filter((image) => image.kind !== "remote");
  const sources = new Map<string, string>();
  for (const [index, image] of uploadable.entries()) {
    if (options.signal?.aborted) throw new Error("已取消");
    onProgress?.(`上传图片 ${index + 1}/${uploadable.length}：${image.name}`);
    const bytes = await imageBytes(app, image);
    const result = await client.uploadImage(meta.accountId, "content", bytes.name, bytes.type, bytes.data);
    if (!result.url) throw new Error(`图片上传没有返回地址：${image.name}`);
    sources.set(image.id, result.url);
  }

  const cover = resolveCover(app, options.file.path, meta, note.images);
  if (!cover) throw new Error("没有封面：请在属性中设置 cover，或在正文中放一张图片");
  let thumbMediaId = "";
  let coverUrl = "";
  if (cover.kind === "url") {
    coverUrl = cover.url;
  } else {
    if (options.signal?.aborted) throw new Error("已取消");
    onProgress?.("上传封面");
    const bytes = await imageBytes(app, cover.image);
    const result = await client.uploadImage(meta.accountId, "cover", bytes.name, bytes.type, bytes.data);
    if (!result.media_id) throw new Error("封面上传没有返回 media_id");
    thumbMediaId = result.media_id;
  }

  if (options.signal?.aborted) throw new Error("已取消");
  onProgress?.("创建草稿");
  const draft = await client.createDraft({
    account_id: meta.accountId,
    title: meta.title,
    content_html: finalizeWechatImages(options.wechatHtml, sources),
    author: meta.author || undefined,
    digest: meta.digest || undefined,
    content_source_url: meta.sourceUrl || undefined,
    cover_image_url: coverUrl || undefined,
    thumb_media_id: thumbMediaId || undefined,
    need_open_comment: meta.openComment,
    publish_now: false,
  });
  return { mediaId: draft.media_id, accountName: draft.account?.name ?? meta.accountId };
}

export async function recordDraft(app: App, file: TFile, accountId: string, mediaId: string): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    frontmatter.wechat_account = accountId;
    frontmatter.wechat_media_id = mediaId;
    frontmatter.wechat_draft_at = new Date().toISOString();
  });
}
