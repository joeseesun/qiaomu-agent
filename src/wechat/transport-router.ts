import type { App } from "obsidian";
import type { WechatPublishSettings } from "../types";
import { WechatBridgeClient, type WechatAccount, type WechatDraftRequest, type WechatDraftResult } from "./bridge-client";
import { WechatDirectClient } from "./direct-client";
import { WechatRelayClient } from "./relay-client";
import type { WechatTransport } from "./transport";

/** Routes each operation to the account's selected connection without changing legacy Bridge IDs. */
export class WechatTransportRouter implements WechatTransport {
  private readonly clients = new Map<string, WechatTransport>();
  readonly errors: string[] = [];

  constructor(private readonly app: App, private readonly settings: WechatPublishSettings) {}

  async listAccounts(): Promise<WechatAccount[]> {
    this.clients.clear();
    this.errors.length = 0;
    const accounts: WechatAccount[] = [];
    if (this.settings.bridgeUrl.trim()) {
      try {
        const bridge = new WechatBridgeClient(this.settings.bridgeUrl, this.app.secretStorage.getSecret(this.settings.secretId) ?? "");
        for (const account of await bridge.listAccounts()) {
          if (this.clients.has(account.id)) continue;
          this.clients.set(account.id, bridge);
          accounts.push(account);
        }
      } catch (error) { this.errors.push(`自建 Bridge：${error instanceof Error ? error.message : String(error)}`); }
    }
    for (const connection of this.settings.connections) {
      try {
        const id = connection.id;
        if (this.clients.has(id)) throw new Error("公众号 ID 重复");
        const account = { id, name: connection.name };
        const secret = this.app.secretStorage.getSecret(connection.appSecretId) ?? "";
        const client = connection.mode === "direct"
          ? new WechatDirectClient(account, connection.appId, secret)
          : new WechatRelayClient(account, connection.appId, secret, this.app.secretStorage.getSecret(connection.inviteSecretId ?? "") ?? "", connection.relayUrl ?? "");
        this.clients.set(id, client);
        accounts.push(account);
      } catch (error) { this.errors.push(`${connection.name}：${error instanceof Error ? error.message : String(error)}`); }
    }
    return accounts;
  }

  private client(accountId: string): WechatTransport {
    const client = this.clients.get(accountId);
    if (!client) throw new Error("请先连接并选择公众号");
    return client;
  }

  uploadImage(accountId: string, kind: "content" | "cover", fileName: string, contentType: string, data: ArrayBuffer): Promise<{ url?: string; media_id?: string }> {
    return this.client(accountId).uploadImage(accountId, kind, fileName, contentType, data);
  }

  createDraft(body: WechatDraftRequest): Promise<WechatDraftResult> {
    return this.client(body.account_id).createDraft(body);
  }
}
