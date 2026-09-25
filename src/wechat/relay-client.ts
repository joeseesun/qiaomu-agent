import { requestUrl, type RequestUrlParam } from "obsidian";
import { normalizeBridgeUrl, type WechatAccount, type WechatDraftRequest, type WechatDraftResult } from "./bridge-client";
import type { WechatTransport } from "./transport";

/** An invited account uses an allowlisted Qiaomu relay for every WeChat API call. */
export class WechatRelayClient implements WechatTransport {
  private readonly baseUrl: string;
  constructor(private readonly account: WechatAccount, private readonly appId: string, private readonly appSecret: string, private readonly inviteKey: string, relayUrl: string) {
    this.baseUrl = normalizeBridgeUrl(relayUrl);
    if (!this.baseUrl || !appId || !appSecret || !inviteKey) throw new Error("请填写中转地址、AppID、AppSecret 和邀请密钥");
  }

  private async call<T>(path: string, init: Omit<RequestUrlParam, "url"> = {}): Promise<T> {
    const response = await requestUrl({ ...init, url: `${this.baseUrl}${path}`, headers: {
      Authorization: `Bearer ${this.inviteKey}`,
      "X-Qiaomu-Appid": this.appId,
      "X-Qiaomu-Appsecret": this.appSecret,
      ...(init.headers ?? {}),
    }, throw: false });
    const payload = response.json as { error?: string } | null;
    if (response.status < 200 || response.status >= 300) throw new Error(typeof payload?.error === "string" ? payload.error : `中转 HTTP ${response.status}`);
    return payload as T;
  }

  async testConnection(): Promise<string[]> {
    const result = await this.call<{ ips?: string[] }>("/v2/egress-ip");
    return Array.isArray(result.ips) ? result.ips : [];
  }

  async listAccounts(): Promise<WechatAccount[]> { return [this.account]; }

  async uploadImage(accountId: string, kind: "content" | "cover", fileName: string, contentType: string, data: ArrayBuffer): Promise<{ url?: string; media_id?: string }> {
    if (accountId !== this.account.id) throw new Error("公众号不匹配");
    const query = new URLSearchParams({ kind, filename: fileName });
    return this.call(`/v2/wechat/images?${query}`, { method: "POST", contentType, body: data });
  }

  async createDraft(body: WechatDraftRequest): Promise<WechatDraftResult> {
    if (body.account_id !== this.account.id || body.publish_now !== false) throw new Error("只允许为当前公众号创建草稿");
    const result = await this.call<{ media_id?: string }>("/v2/wechat/draft", { method: "POST", contentType: "application/json", body: JSON.stringify({ ...body, publish_now: false }) });
    if (!result.media_id) throw new Error("中转没有返回草稿 ID");
    return { media_id: result.media_id, account: this.account };
  }
}
