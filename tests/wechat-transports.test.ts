// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { setRequestUrlHandler } from "./obsidian-stub";
import { WechatDirectClient } from "../src/wechat/direct-client";
import { WechatTransportRouter } from "../src/wechat/transport-router";
import type { WechatPublishSettings } from "../src/types";

afterEach(() => setRequestUrlHandler(async () => { throw new Error("unexpected request"); }));

describe("WeChat direct transport", () => {
  it("refreshes an expired token once and retries the same read-only request", async () => {
    const urls: string[] = [];
    setRequestUrlHandler(async (options) => {
      const url = String(options.url);
      urls.push(url);
      if (url.endsWith("/stable_token")) return { status: 200, json: { access_token: urls.filter((item) => item.endsWith("/stable_token")).length === 1 ? "old" : "new", expires_in: 7200 } };
      if (url.includes("get_api_domain_ip") && url.includes("old")) return { status: 200, json: { errcode: 40001 } };
      return { status: 200, json: { ip_list: ["1.2.3.4"] } };
    });
    await new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret-value").testConnection();
    expect(urls.filter((url) => url.endsWith("/stable_token"))).toHaveLength(2);
    expect(urls.filter((url) => url.includes("get_api_domain_ip"))).toHaveLength(2);
    expect(urls.join(" ")).not.toContain("secret-value");
  });

  it("explains the IP whitelist error without recommending an open whitelist", async () => {
    setRequestUrlHandler(async (options) => String(options.url).endsWith("/stable_token")
      ? { status: 200, json: { access_token: "token", expires_in: 7200 } }
      : { status: 200, json: { errcode: 40164, errmsg: "invalid ip 11.22.33.44" } });
    await expect(new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret").testConnection())
      .rejects.toThrow("11.22.33.44");
  });

  it("rejects body images that cannot be uploaded through the direct transport", async () => {
    const client = new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret");
    for (const src of ["http://example.com/pic.jpg", "data:image/png;base64,AAAA"]) {
      await expect(client.createDraft({ account_id: "direct:1", title: "测试", content_html: `<img src="${src}">`, thumb_media_id: "cover", publish_now: false }))
        .rejects.toThrow("正文图片必须使用公网 HTTPS");
    }
  });
});

describe("mixed account routing", () => {
  it("keeps existing Bridge accounts while adding a separately keyed direct account", async () => {
    setRequestUrlHandler(async (options) => {
      if (String(options.url).endsWith("/v1/accounts")) return { status: 200, json: { accounts: [{ id: "old", name: "原有账号" }] } };
      throw new Error("unexpected request");
    });
    const settings: WechatPublishSettings = { bridgeUrl: "https://bridge.example.com", secretId: "bridge-token", defaultAccountId: "old", themeId: "qiaomu-podcast", author: "", openComment: true, recordInNote: true, connections: [{ id: "direct:new", name: "新账号", mode: "direct", appId: "wx-new", appSecretId: "new-secret" }] };
    const app = { secretStorage: { getSecret: (id: string) => ({ "bridge-token": "bridge-key", "new-secret": "app-secret" })[id] ?? "" } } as never;
    const router = new WechatTransportRouter(app, settings);
    expect(await router.listAccounts()).toEqual([{ id: "old", name: "原有账号" }, { id: "direct:new", name: "新账号" }]);
    expect(router.errors).toEqual([]);
  });
});
