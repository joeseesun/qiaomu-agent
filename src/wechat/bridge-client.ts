import { requestUrl, type RequestUrlParam } from "obsidian";

export interface WechatAccount { id: string; name: string; }

export interface WechatDraftRequest {
  account_id: string;
  title: string;
  content_html: string;
  author?: string;
  digest?: string;
  content_source_url?: string;
  cover_image_url?: string;
  thumb_media_id?: string;
  need_open_comment?: boolean;
  publish_now: false;
}

export interface WechatDraftResult {
  media_id: string;
  account: WechatAccount;
}

export function normalizeBridgeUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))) {
    throw new Error("Bridge 地址必须使用 https（本机调试可用 http://localhost）");
  }
  return url.toString().replace(/\/+$/, "");
}

/** Client for qmblog's WeChat bridge (tools/wechat-bridge). Uses requestUrl, so it works on mobile without CORS. */
export class WechatBridgeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token: string) {
    this.baseUrl = normalizeBridgeUrl(baseUrl);
    if (!this.baseUrl) throw new Error("尚未设置公众号 Bridge 地址");
    if (!token) throw new Error("尚未设置公众号 Bridge 访问令牌");
  }

  private async call<T>(path: string, init: Omit<RequestUrlParam, "url"> = {}): Promise<T> {
    const response = await requestUrl({
      ...init,
      url: `${this.baseUrl}${path}`,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
      throw: false,
    });
    let payload: unknown = null;
    try { payload = response.json; } catch { payload = null; }
    if (response.status < 200 || response.status >= 300) {
      const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`;
      throw new Error(response.status === 401 ? "Bridge 访问令牌无效" : message);
    }
    return payload as T;
  }

  async listAccounts(): Promise<WechatAccount[]> {
    const payload = await this.call<{ accounts?: WechatAccount[] }>("/v1/accounts");
    return (payload.accounts ?? []).filter((item) => item && typeof item.id === "string" && typeof item.name === "string");
  }

  async uploadImage(accountId: string, kind: "content" | "cover", fileName: string, contentType: string, data: ArrayBuffer): Promise<{ url?: string; media_id?: string }> {
    const query = new URLSearchParams({ account_id: accountId, kind, filename: fileName });
    return this.call(`/v1/wechat/images?${query.toString()}`, { method: "POST", contentType, body: data });
  }

  async createDraft(body: WechatDraftRequest): Promise<WechatDraftResult> {
    const result = await this.call<WechatDraftResult>("/v1/wechat/publish", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ ...body, publish_now: false }),
    });
    if (!result?.media_id) throw new Error("Bridge 没有返回草稿 media_id");
    return result;
  }
}
