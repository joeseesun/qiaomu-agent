import type { WechatAccount, WechatDraftRequest, WechatDraftResult } from "./bridge-client";

/** One account-bound or multi-account path to the WeChat draft API. */
export interface WechatTransport {
  listAccounts(): Promise<WechatAccount[]>;
  uploadImage(accountId: string, kind: "content" | "cover", fileName: string, contentType: string, data: ArrayBuffer): Promise<{ url?: string; media_id?: string }>;
  createDraft(body: WechatDraftRequest): Promise<WechatDraftResult>;
}
