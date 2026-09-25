import { requestUrl } from "obsidian";
import type { WechatAccount, WechatDraftRequest, WechatDraftResult } from "./bridge-client";
import type { WechatTransport } from "./transport";

const API = "https://api.weixin.qq.com";
const TOKEN_ERRORS = new Set([40001, 40014, 42001]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

interface WxPayload { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number; url?: string; media_id?: string; ip_list?: string[]; }

function wxError(payload: WxPayload, fallback: string): Error {
  const code = payload.errcode;
  if (code === 40164) {
    const ip = /\b(?:\d{1,3}\.){3}\d{1,3}\b/.exec(payload.errmsg ?? "")?.[0];
    return new Error(ip ? `微信拒绝当前出口 IP ${ip}。请在公众号后台把该 IP 加入 API 白名单。` : "微信拒绝当前出口 IP。请在公众号后台查看 API 白名单，并确认当前网络的出口 IP。");
  }
  if (code === 40013 || code === 40125) return new Error("公众号 AppID 或 AppSecret 无效，请检查后重试。");
  return new Error(`${fallback}${code !== undefined ? `（微信错误码 ${code}）` : ""}`);
}

function payloadOf(response: { json: unknown }): WxPayload {
  return response.json && typeof response.json === "object" ? response.json as WxPayload : {};
}

function multipart(name: string, type: string, data: ArrayBuffer): { body: ArrayBuffer; contentType: string } {
  const boundary = `qiaomu-${crypto.randomUUID()}`;
  const safeName = name.replace(/[\r\n"\\]/g, "_").slice(0, 120) || "image.jpg";
  const head = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${safeName}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + data.byteLength + tail.length);
  body.set(head);
  body.set(new Uint8Array(data), head.length);
  body.set(tail, head.length + data.byteLength);
  return { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function jpegFromImage(data: ArrayBuffer, type: string, maxBytes: number): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([data], { type }));
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("设备无法转换图片");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58, 0.44]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) return blob.arrayBuffer();
    }
    throw new Error("图片转换后仍超过微信大小限制，请压缩后重试");
  } finally { bitmap.close(); }
}

/** Direct WeChat API access. Requires the device's current egress IP on the official-account whitelist. */
export class WechatDirectClient implements WechatTransport {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly account: WechatAccount, private readonly appId: string, private readonly appSecret: string) {
    if (!appId.trim() || !appSecret.trim()) throw new Error("请填写公众号 AppID 和 AppSecret");
  }

  async listAccounts(): Promise<WechatAccount[]> { return [this.account]; }

  private async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await requestUrl({ url: `${API}/cgi-bin/stable_token`, method: "POST", contentType: "application/json", body: JSON.stringify({ grant_type: "client_credential", appid: this.appId, secret: this.appSecret, force_refresh: forceRefresh }), throw: false });
    const payload = payloadOf(response);
    if (response.status !== 200 || !payload.access_token || (payload.errcode && payload.errcode !== 0)) throw wxError(payload, "无法获取微信访问令牌");
    this.token = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in || 7200) * 1000 };
    return this.token.value;
  }

  private async call(path: string, method: "GET" | "POST", body?: string | ArrayBuffer, contentType?: string): Promise<WxPayload> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(attempt > 0);
      const response = await requestUrl({ url: `${API}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, method, body, contentType, throw: false });
      const payload = payloadOf(response);
      if (TOKEN_ERRORS.has(payload.errcode ?? 0) && attempt === 0) { this.token = null; continue; }
      if (response.status !== 200 || (payload.errcode !== undefined && payload.errcode !== 0)) throw wxError(payload, "微信接口请求失败");
      return payload;
    }
    throw new Error("微信访问令牌刷新后仍不可用");
  }

  async testConnection(): Promise<void> {
    await this.call("/cgi-bin/get_api_domain_ip", "GET");
  }

  async uploadImage(accountId: string, kind: "content" | "cover", fileName: string, contentType: string, data: ArrayBuffer): Promise<{ url?: string; media_id?: string }> {
    if (accountId !== this.account.id) throw new Error("公众号不匹配");
    if (!data.byteLength || data.byteLength > MAX_IMAGE_BYTES) throw new Error("图片为空或超过 20 MB");
    if (kind === "content" && contentType === "image/gif" && data.byteLength > 10 * 1024 * 1024) throw new Error("GIF 超过 10 MB，请压缩后重试");
    const maxBytes = kind === "content" && contentType === "image/gif" ? 10 * 1024 * 1024 : 1024 * 1024;
    const native = ["image/jpeg", "image/png", "image/gif"].includes(contentType);
    const bytes = native && data.byteLength <= maxBytes ? data : await jpegFromImage(data, contentType, maxBytes);
    const type = bytes === data ? contentType : "image/jpeg";
    const upload = multipart(bytes === data ? fileName : "image.jpg", type, bytes);
    const path = kind === "cover" ? "/cgi-bin/material/add_material?type=image" : "/cgi-bin/media/uploadimg";
    let payload: WxPayload;
    try { payload = await this.call(path, "POST", upload.body, upload.contentType); }
    catch (error) {
      if (kind !== "cover") throw error;
      const thumbBytes = await jpegFromImage(data, contentType, 64 * 1024);
      const thumb = multipart("cover.jpg", "image/jpeg", thumbBytes);
      payload = await this.call("/cgi-bin/material/add_material?type=thumb", "POST", thumb.body, thumb.contentType);
    }
    if (kind === "cover" && !payload.media_id) throw new Error("微信没有返回封面素材 ID");
    if (kind === "content" && !payload.url) throw new Error("微信没有返回正文图片地址");
    return { url: payload.url, media_id: payload.media_id };
  }

  private async uploadRemote(url: string, kind: "content" | "cover"): Promise<{ url?: string; media_id?: string }> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname)) throw new Error("远程图片必须使用公网 HTTPS 地址");
    const response = await requestUrl({ url, throw: false });
    if (response.status !== 200 || response.arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new Error("远程图片无法读取或超过 20 MB");
    const type = (response.headers["content-type"] ?? "image/jpeg").split(";")[0]!.trim().toLowerCase();
    return this.uploadImage(this.account.id, kind, parsed.pathname.split("/").pop() || "image.jpg", type, response.arrayBuffer);
  }

  async createDraft(body: WechatDraftRequest): Promise<WechatDraftResult> {
    if (body.account_id !== this.account.id) throw new Error("公众号不匹配");
    if (body.publish_now !== false) throw new Error("只允许创建草稿");
    const doc = new DOMParser().parseFromString(body.content_html, "text/html");
    for (const image of Array.from(doc.querySelectorAll("img[src]"))) {
      const src = image.getAttribute("src")!;
      if (/^https:\/\/mmbiz\.qpic\.cn\//i.test(src)) continue;
      if (!src.startsWith("https://")) throw new Error("正文图片必须使用公网 HTTPS 地址，或先保存为本地附件再发布");
      const uploaded = await this.uploadRemote(src, "content");
      image.setAttribute("src", uploaded.url!);
    }
    let coverId = body.thumb_media_id;
    if (!coverId && body.cover_image_url) coverId = (await this.uploadRemote(body.cover_image_url, "cover")).media_id;
    if (!coverId) throw new Error("请为草稿添加封面");
    const payload = await this.call("/cgi-bin/draft/add", "POST", JSON.stringify({ articles: [{ title: body.title, author: body.author ?? "", digest: body.digest ?? "", content: doc.body.innerHTML, content_source_url: body.content_source_url ?? "", thumb_media_id: coverId, need_open_comment: body.need_open_comment ? 1 : 0, only_fans_can_comment: 0 }] }), "application/json");
    if (!payload.media_id) throw new Error("微信没有返回草稿 ID");
    return { media_id: payload.media_id, account: this.account };
  }
}
