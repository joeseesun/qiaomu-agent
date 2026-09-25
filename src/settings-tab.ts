import { App, Modal, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import type QiaomuAgentPlugin from "./main";
import { ProviderSettings } from "./ui/provider-settings";
import { CapabilitiesModal } from "./ui/capabilities-modal";
import { WechatBridgeClient, normalizeBridgeUrl } from "./wechat/bridge-client";
import { WechatDirectClient } from "./wechat/direct-client";
import { WechatRelayClient } from "./wechat/relay-client";
import { listWechatThemes } from "./wechat/export-html";

export class ModelManagerModal extends Modal {
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin) { super(app); }
  override onOpen(): void {
    this.modalEl.addClass("qa-model-manager-modal");
    const tab = new QiaomuSettingTab(this.app, this.plugin, true);
    tab.containerEl = this.contentEl;
    tab.display();
  }
  override onClose(): void { this.contentEl.empty(); }
}

export class QiaomuSettingTab extends PluginSettingTab {
  private activeSection: "models" | "chat" | "tools" | "publish" | "about" = "models";
  private readonly providers: ProviderSettings;
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin, private readonly connectionsOnly = false) {
    super(app, plugin);
    this.providers = new ProviderSettings(plugin, () => this.display());
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("qiaomu-agent-settings");
    containerEl.createEl("h2", { text: this.connectionsOnly ? "模型" : "乔木 Agent" });

    if (this.connectionsOnly) { this.renderConnectionSection(containerEl); return; }
    const tabs = containerEl.createDiv({ cls: "qiaomu-agent-settings__tabs" });
    tabs.setAttribute("role", "tablist");
    const sections = [{ id: "models", label: "模型" }, { id: "chat", label: "对话" }, { id: "tools", label: "工具" }, { id: "publish", label: "发布" }, { id: "about", label: "关于" }] as const;
    for (const [index, section] of sections.entries()) {
      const selected = this.activeSection === section.id;
      const button = tabs.createEl("button", { text: section.label, cls: "qiaomu-agent-settings__tab" });
      button.type = "button"; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
      if (selected) button.addClass("is-active");
      button.addEventListener("click", () => { this.activeSection = section.id; this.display(); this.containerEl.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus(); });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        this.activeSection = sections[(index + (event.key === "ArrowRight" ? 1 : sections.length - 1)) % sections.length]!.id;
        this.display();
        this.containerEl.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
      });
    }
    const body = containerEl.createDiv({ cls: "qiaomu-agent-settings__body" });
    body.setAttribute("role", "tabpanel");
    if (this.activeSection === "models") this.renderConnectionSection(body);
    if (this.activeSection === "chat") this.renderBehaviorSection(body);
    if (this.activeSection === "tools") { this.renderToolsSection(body); this.renderCapabilitySection(body); }
    if (this.activeSection === "publish") this.renderPublishSection(body);
    if (this.activeSection === "about") this.renderAboutSection(body);
  }

  private renderAboutSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(`当前版本 ${this.plugin.manifest.version}`).setDesc("在 Obsidian 第三方插件中检查并安装更新。");
    new Setting(containerEl).setName("微信").setDesc("joeseesun");
    for (const [name, description, src, alt] of [
      ["打赏支持", "感谢支持乔木持续维护这个插件。", "https://radio.qiaomu.ai/assets/qiaomu_reward_qr.png", "向阳乔木打赏二维码"],
      ["关注公众号", "向阳乔木推荐看", "https://radio.qiaomu.ai/assets/qiaomu_wechat_public_account_qr.jpg", "向阳乔木推荐看公众号二维码"],
    ] as const) {
      const setting = new Setting(containerEl).setName(name).setDesc(description);
      setting.settingEl.addClass("qiaomu-agent-settings__qr");
      setting.controlEl.createEl("img", { attr: { src, alt, loading: "lazy", width: "144", height: "144" } });
    }
    const links: Array<[string, string, string]> = [
      ["反馈 Bug", "在 GitHub 提交问题", "https://github.com/joeseesun/qiaomu-agent/issues/new"],
      ["使用说明", "打开说明", "https://github.com/joeseesun/qiaomu-agent#readme"],
      ["联系邮箱", "vista8@gmail.com", "mailto:vista8@gmail.com"],
      ["向阳乔木", "qiaomu.ai", "https://qiaomu.ai/"],
      ["乔木博客", "blog.qiaomu.ai", "https://blog.qiaomu.ai/"],
      ["X", "@vista8", "https://x.com/vista8"],
      ["GitHub", "@joeseesun", "https://github.com/joeseesun"],
    ];
    for (const [name, label, href] of links) {
      new Setting(containerEl).setName(name).controlEl.createEl("a", { text: label, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
    }
    new Setting(containerEl).setName("隐私").setDesc("对话、当前笔记与附件只发送给你选择的本地 Agent 或模型服务商。API Key 保存在本机 SecretStorage，不写入同步的插件数据。");
    new Setting(containerEl).setName("开源许可").setDesc("Copyright © 向阳乔木。第三方组件的许可见插件目录中的 THIRD_PARTY_NOTICES.md。");
  }

  private renderPublishSection(containerEl: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    containerEl.createEl("h3", { text: "公众号草稿箱" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "连接自己的公众号后可发送到草稿箱；不配置连接也能复制公众号格式。不会直接群发。",
    });
    this.renderWechatConnections(containerEl);
    containerEl.createEl("h4", { text: "自建 Bridge（现有连接）" });
    new Setting(containerEl)
      .setName("Bridge 地址")
      .setDesc("例如 https://bridge.example.com；必须是 https。")
      .addText((text) => text.setPlaceholder("https://").setValue(wechat.bridgeUrl).onChange(async (value) => {
        wechat.bridgeUrl = value.trim();
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("访问令牌")
      .setDesc("即 Bridge 的 BRIDGE_TOKEN，保存在 Obsidian SecretStorage，不写入 data.json。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.app.secretStorage.getSecret(wechat.secretId) ?? "");
        text.onChange((value) => this.app.secretStorage.setSecret(wechat.secretId, value.trim()));
      });
    let accountDropdownAdded = false;
    const accountSetting = new Setting(containerEl).setName("默认公众号").setDesc(wechat.defaultAccountId ? `当前：${wechat.defaultAccountId}` : "测试连接后选择。");
    accountSetting.addButton((button) => button.setButtonText("测试连接").onClick(async () => {
      button.setDisabled(true);
      try {
        normalizeBridgeUrl(wechat.bridgeUrl);
        const client = new WechatBridgeClient(wechat.bridgeUrl, this.app.secretStorage.getSecret(wechat.secretId) ?? "");
        const accounts = await client.listAccounts();
        if (accounts.length === 0) throw new Error("Bridge 没有配置公众号");
        accountSetting.setDesc(`连接成功，共 ${accounts.length} 个公众号。`);
        if (!accountDropdownAdded) accountSetting.addDropdown((dropdown) => {
          accountDropdownAdded = true;
          for (const account of accounts) dropdown.addOption(account.id, account.name);
          if (!accounts.some((account) => account.id === wechat.defaultAccountId)) wechat.defaultAccountId = accounts[0]!.id;
          dropdown.setValue(wechat.defaultAccountId).onChange(async (value) => {
            wechat.defaultAccountId = value;
            await this.plugin.saveSettings();
          });
        });
        await this.plugin.saveSettings();
      } catch (error) {
        accountSetting.setDesc(`连接失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        button.setDisabled(false);
      }
    }));
    new Setting(containerEl).setName("排版主题").setDesc("与乔木博客的公众号主题一致，发布时可临时切换。").addDropdown((dropdown) => {
      for (const theme of listWechatThemes()) dropdown.addOption(theme.id, theme.name);
      dropdown.setValue(wechat.themeId).onChange(async (value) => {
        wechat.themeId = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName("默认作者").setDesc("笔记属性 author 或 作者 优先。").addText((text) => text.setValue(wechat.author).onChange(async (value) => {
      wechat.author = value.trim();
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName("打开留言").addToggle((toggle) => toggle.setValue(wechat.openComment).onChange(async (value) => {
      wechat.openComment = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl)
      .setName("记录到笔记属性")
      .setDesc("成功后写入 wechat_media_id、wechat_draft_at 和 wechat_account。")
      .addToggle((toggle) => toggle.setValue(wechat.recordInNote).onChange(async (value) => {
        wechat.recordInNote = value;
        await this.plugin.saveSettings();
      }));
  }

  private renderWechatConnections(containerEl: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    new Setting(containerEl).setName("添加公众号连接").setDesc("直连需要当前设备出口 IP 在公众号白名单；乔木中转需要邀请密钥和中转服务器的固定出口 IP。")
      .addButton((button) => button.setButtonText("直连微信").onClick(async () => {
        const id = `direct:${crypto.randomUUID()}`;
        wechat.connections.push({ id, name: "新公众号", mode: "direct", appId: "", appSecretId: `qiaomu-wechat-secret-${id}` });
        wechat.defaultAccountId = id;
        await this.plugin.saveSettings(); this.display();
      }))
      .addButton((button) => button.setButtonText("乔木中转").onClick(async () => {
        const id = `relay:${crypto.randomUUID()}`;
        wechat.connections.push({ id, name: "新公众号", mode: "relay", appId: "", appSecretId: `qiaomu-wechat-secret-${id}`, inviteSecretId: `qiaomu-wechat-invite-${id}`, relayUrl: "" });
        wechat.defaultAccountId = id;
        await this.plugin.saveSettings(); this.display();
      }));
    for (const connection of wechat.connections) {
      const group = containerEl.createDiv({ cls: "qiaomu-wechat-connection" });
      group.createEl("h4", { text: connection.mode === "direct" ? "直连公众号" : "乔木中转公众号" });
      new Setting(group).setName("名称").addText((input) => input.setValue(connection.name).onChange(async (value) => {
        connection.name = value.trim(); await this.plugin.saveSettings();
      }));
      new Setting(group).setName("AppID").addText((input) => input.setValue(connection.appId).onChange(async (value) => {
        connection.appId = value.trim(); await this.plugin.saveSettings();
      }));
      new Setting(group).setName("AppSecret").setDesc("保存在本机 Obsidian SecretStorage，不写入同步的插件数据。")
        .addText((input) => {
          input.inputEl.type = "password";
          input.setValue(this.app.secretStorage.getSecret(connection.appSecretId) ?? "");
          input.onChange((value) => this.app.secretStorage.setSecret(connection.appSecretId, value.trim()));
        });
      if (connection.mode === "relay") {
        new Setting(group).setName("中转地址").setDesc("必须使用 HTTPS；仅本机调试允许 localhost。")
          .addText((input) => input.setPlaceholder("https://").setValue(connection.relayUrl ?? "").onChange(async (value) => {
            connection.relayUrl = value.trim(); await this.plugin.saveSettings();
          }));
        new Setting(group).setName("邀请密钥").setDesc("乔木手动发放；请求经中转时，AppSecret 会在 HTTPS 连接中被服务器处理，但不保存。")
          .addText((input) => {
            input.inputEl.type = "password";
            input.setValue(this.app.secretStorage.getSecret(connection.inviteSecretId ?? "") ?? "");
            input.onChange((value) => this.app.secretStorage.setSecret(connection.inviteSecretId ?? "", value.trim()));
          });
      }
      const status = new Setting(group).setName("连接状态").setDesc("测试时会调用微信只读接口，不会创建草稿。");
      status.addButton((button) => button.setButtonText("测试连接").onClick(async () => {
        button.setDisabled(true);
        try {
          const account = { id: connection.id, name: connection.name };
          const secret = this.app.secretStorage.getSecret(connection.appSecretId) ?? "";
          if (connection.mode === "direct") {
            await new WechatDirectClient(account, connection.appId, secret).testConnection();
            status.setDesc("连接成功。当前设备出口 IP 已获微信接受。");
          } else {
            const ips = await new WechatRelayClient(account, connection.appId, secret, this.app.secretStorage.getSecret(connection.inviteSecretId ?? "") ?? "", connection.relayUrl ?? "").testConnection();
            status.setDesc(ips.length ? `中转可用。请将 ${ips.join("、")} 加入公众号 API 白名单。` : "中转可用；请向管理员确认固定出口 IP。 ");
          }
        } catch (error) { status.setDesc(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
        finally { button.setDisabled(false); }
      }));
      let pendingRemove = false;
      status.addButton((button) => button.setButtonText("移除连接").onClick(async () => {
        if (!pendingRemove) { pendingRemove = true; button.setButtonText("确认移除"); return; }
        wechat.connections = wechat.connections.filter((item) => item.id !== connection.id);
        if (wechat.defaultAccountId === connection.id) wechat.defaultAccountId = "";
        this.app.secretStorage.setSecret(connection.appSecretId, "");
        if (connection.inviteSecretId) this.app.secretStorage.setSecret(connection.inviteSecretId, "");
        await this.plugin.saveSettings(); this.display();
      }));
    }
  }

  private renderConnectionSection(containerEl: HTMLElement): void {
    this.providers.render(containerEl);
  }

  private renderToolsSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Obsidian 与 Agent 工具" });
    if (!Platform.isDesktopApp) {
      containerEl.createEl("p", { cls: "setting-item-description", text: "本地 CLI、外部 Skills 和 MCP 仅在桌面端可用。" });
      return;
    }
    const obsidianCli = this.plugin.obsidianCliService.getConnection();
    new Setting(containerEl)
      .setName("Obsidian CLI")
      .setDesc(obsidianCli.detail)
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.useObsidianCli).setDisabled(obsidianCli.state !== "ready").onChange(async (value) => {
        this.plugin.settings.useObsidianCli = value; await this.plugin.saveSettings();
      }))
      .addButton((button) => button.setButtonText("重新检测").onClick(async () => {
        button.setDisabled(true).setButtonText("检测中…"); await this.plugin.obsidianCliService.detect(); this.display();
      }));
  }

  private renderBehaviorSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "对话" });
    new Setting(containerEl)
      .setName("对话字体")
      .setDesc("系统字体适合阅读；也可跟随 Obsidian 主题。")
      .addDropdown((dropdown) => dropdown
        .addOption("system", "系统字体")
        .addOption("obsidian", "跟随 Obsidian")
        .setValue(this.plugin.settings.chatFontFamily)
        .onChange(async (value) => { this.plugin.settings.chatFontFamily = value === "obsidian" ? "obsidian" : "system"; await this.plugin.saveSettings(); }));
    const chatSize = new Setting(containerEl).setName("对话字号").setDesc(`${this.plugin.settings.chatFontSize} px`);
    chatSize.addSlider((slider) => slider.setLimits(13, 20, 1).setValue(this.plugin.settings.chatFontSize).onChange(async (value) => {
      this.plugin.settings.chatFontSize = value; chatSize.setDesc(`${value} px`); await this.plugin.saveSettings();
    }));
    const codeSize = new Setting(containerEl).setName("代码字号").setDesc(`${this.plugin.settings.codeFontSize} px`);
    codeSize.addSlider((slider) => slider.setLimits(12, 18, 1).setValue(this.plugin.settings.codeFontSize).onChange(async (value) => {
      this.plugin.settings.codeFontSize = value; codeSize.setDesc(`${value} px`); await this.plugin.saveSettings();
    }));
    new Setting(containerEl)
      .setName("默认权限")
      .setDesc("控制本地 Agent 是否可以修改文件；手动追加回复仍需确认目标。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("plan", "不允许修改文件")
          .addOption("edit", "允许修改当前 Obsidian 库")
          .addOption("full", "完全访问本机文件（Codex 桌面端）")
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value) => {
            this.plugin.settings.permissionMode = value === "full" ? "full" : value === "edit" ? "edit" : "plan";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自动附加当前笔记")
      .setDesc("使用 Obsidian 缓存读取当前 Markdown 笔记，并随请求发送。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoAttachActiveNote).onChange(async (value) => {
          this.plugin.settings.autoAttachActiveNote = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("系统 Prompt")
      .setDesc("作为每次对话的基础指令。")
      .addTextArea((text) => {
        text.inputEl.rows = 10;
        text.inputEl.addClass("qiaomu-agent-settings__large-input");
        text.setValue(this.plugin.settings.systemPrompt).onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("快捷提问")
      .setDesc("每行一条，最多显示 8 条。")
      .addTextArea((text) => {
        text.inputEl.rows = 5;
        text.setValue(this.plugin.settings.quickPrompts.join("\n")).onChange(async (value) => {
          this.plugin.settings.quickPrompts = value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8);
          await this.plugin.saveSettings();
        });
      });
  }

  private renderCapabilitySection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("技能")
      .setDesc(`${this.plugin.skillService.list().filter((skill) => !this.plugin.settings.disabledSkillPaths.includes(skill.path)).length} 个在乔木中显示`)
      .addButton((button) => button.setButtonText("管理技能").onClick(() => new CapabilitiesModal(this.app, this.plugin, "skills").open()));
    if (Platform.isDesktopApp) new Setting(containerEl).setName("工具连接")
      .setDesc("添加本地程序或远程服务，供支持 MCP 的 Agent 使用。")
      .addButton((button) => button.setButtonText("管理连接").onClick(() => new CapabilitiesModal(this.app, this.plugin, "mcp").open()));
  }

}
