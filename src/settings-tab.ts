import { App, Modal, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import type QiaomuAgentPlugin from "./main";
import { ProviderSettings } from "./ui/provider-settings";
import { WechatBridgeClient, normalizeBridgeUrl } from "./wechat/bridge-client";
import { listWechatThemes } from "./wechat/export-html";

export class ModelManagerModal extends Modal {
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin) { super(app); }
  override onOpen(): void {
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
    if (this.connectionsOnly) containerEl.createEl("p", { cls: "setting-item-description", text: "在这里添加服务商；日常在输入框右下角直接切换模型。" });

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
    if (this.activeSection === "tools") { this.renderToolsSection(body); this.renderSkillsSection(body); this.renderAdvancedSection(body); }
    if (this.activeSection === "publish") this.renderPublishSection(body);
    if (this.activeSection === "about") this.renderAboutSection(body);
  }

  private renderAboutSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(`当前版本 ${this.plugin.manifest.version}`).setDesc("在 Obsidian 第三方插件中检查并安装更新。");
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
      text: "通过你部署在固定 IP 服务器上的 qmblog 公众号 Bridge 发送草稿。只进入草稿箱，不会直接群发。",
    });
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

  private renderSkillsSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Skills" });
    if (Platform.isDesktopApp) new Setting(containerEl)
      .setName("外部 Skills 目录")
      .setDesc("桌面端可填写多个绝对路径，每行一个；库内 .agents/skills 等标准目录会自动扫描。")
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text.setPlaceholder("/path/to/skills");
        text.setValue(this.plugin.settings.skillDirectories.join("\n")).onChange(async (value) => {
          this.plugin.settings.skillDirectories = value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl)
      .setName("已发现技能")
      .setDesc(
        this.plugin.skillService.list().length
          ? this.plugin.skillService.list().map((skill) => skill.name).join("、")
          : "尚未发现可用的 SKILL.md"
      )
      .addButton((button) =>
        button.setButtonText("刷新").onClick(async () => {
          await this.plugin.skillService.refresh(this.plugin.settings.skillDirectories);
          this.display();
        })
      );
  }

  private renderAdvancedSection(containerEl: HTMLElement): void {
    if (!Platform.isDesktopApp) return;
    const details = containerEl.createEl("details", { cls: "qiaomu-agent-settings__advanced" });
    details.createEl("summary", { text: "高级：MCP" });
    details.createEl("p", {
      cls: "setting-item-description",
      text: "首版将这份配置临时传给支持配置文件参数的本地 CLI。实际启用与工具调用由对应 Agent 决定。",
    });
    const textarea = details.createEl("textarea", { cls: "qiaomu-agent-settings__json" });
    textarea.rows = 12;
    textarea.value = this.plugin.settings.mcpConfig;
    const feedback = details.createDiv({ cls: "qiaomu-agent-settings__feedback" });
    textarea.addEventListener("change", async () => {
      try {
        JSON.parse(textarea.value || "{}");
        this.plugin.settings.mcpConfig = textarea.value;
        feedback.setText("JSON 有效，已保存");
        feedback.removeClass("is-error");
        await this.plugin.saveSettings();
      } catch (error) {
        feedback.setText(`未保存：${error instanceof Error ? error.message : "JSON 无效"}`);
        feedback.addClass("is-error");
      }
    });
  }

}
