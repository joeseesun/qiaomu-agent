import { App, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import type QiaomuAgentPlugin from "./main";
import type { ApiConnection } from "./types";
import { API_PROVIDERS, apiProtocol, selectApiProvider, validateApiUrl } from "./services/api-providers";
import { ApiBackend } from "./services/api-backend";

export class QiaomuSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("qiaomu-agent-settings");
    containerEl.createEl("h2", { text: "乔木 Agent" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "默认优先使用已验证可调用的本地 Agent；移动端自动回退到模型 API。",
    });

    this.renderConnectionSection(containerEl);
    this.renderBehaviorSection(containerEl);
    this.renderSkillsSection(containerEl);
    this.renderAdvancedSection(containerEl);
  }

  private renderConnectionSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "模型连接" });

    new Setting(containerEl)
      .setName("默认连接")
      .setDesc("自动模式优先选择本地 CLI，其次使用已配置的 API。")
      .addDropdown((dropdown) => {
        dropdown.addOption("auto", "自动选择").addOption("api", "模型 API");
        if (Platform.isDesktopApp) dropdown.addOption("cli", "本地 CLI");
        dropdown.setValue(Platform.isDesktopApp ? this.plugin.settings.backendKind : "api");
        dropdown.onChange(async (value) => {
          this.plugin.settings.backendKind = value === "cli" ? "cli" : value === "api" ? "api" : "auto";
          await this.plugin.saveSettings();
        });
      });

    if (Platform.isDesktopApp) {
    new Setting(containerEl)
      .setName("首选本地 Agent")
      .setDesc("只列出已经实际执行版本探测成功的命令。")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "自动");
        for (const detection of this.plugin.backendService.getDetections().filter((item) => item.callable)) {
          dropdown.addOption(detection.id, detection.label);
        }
        dropdown.setValue(this.plugin.settings.preferredCli);
        dropdown.onChange(async (value) => {
          this.plugin.settings.preferredCli = value;
          await this.plugin.saveSettings();
        });
      });

    const detectionSetting = new Setting(containerEl)
      .setName("本地 Agent")
      .setDesc(this.detectionSummary())
      .addButton((button) =>
        button.setButtonText("重新检测").onClick(async () => {
          button.setDisabled(true).setButtonText("检测中…");
          await this.plugin.refreshIntegrations();
          new Notice("本地 Agent 检测完成");
          this.display();
        })
      );
    detectionSetting.settingEl.addClass("qiaomu-agent-settings__detection");

    const obsidianCli = this.plugin.obsidianCliService.getConnection();
    new Setting(containerEl)
      .setName("Obsidian CLI")
      .setDesc(obsidianCli.detail)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useObsidianCli)
          .setDisabled(obsidianCli.state !== "ready")
          .onChange(async (value) => {
            this.plugin.settings.useObsidianCli = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) =>
        button.setButtonText("检测").onClick(async () => {
          button.setDisabled(true).setButtonText("检测中…");
          await this.plugin.obsidianCliService.detect();
          this.display();
        })
      );

    }

    new Setting(containerEl).setName("API 服务商").addDropdown((dropdown) => {
      for (const [value, provider] of Object.entries(API_PROVIDERS)) dropdown.addOption(value, provider.label);
      dropdown.setValue(this.plugin.settings.api.provider);
      dropdown.onChange(async (value) => {
        const provider = value as ApiConnection["provider"];
        selectApiProvider(this.plugin.settings, provider);
        await this.plugin.saveSettings();
        this.display();
      });
    });

    const website = API_PROVIDERS[this.plugin.settings.api.provider]?.website;
    if (website) containerEl.createEl("a", { text: "获取 API Key / 服务商控制台 ↗", href: website }).setAttribute("rel", "noopener noreferrer");

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("保存在 Obsidian SecretStorage，不写入 data.json。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("粘贴后自动保存");
        text.setValue(this.app.secretStorage.getSecret(this.plugin.settings.api.secretId) ?? "");
        text.onChange((value) => this.app.secretStorage.setSecret(this.plugin.settings.api.secretId, value.trim()));
      });

    new Setting(containerEl).setName("模型").addText((text) =>
      text.setValue(this.plugin.settings.api.model).onChange(async (value) => {
        this.plugin.settings.api.model = value.trim();
        await this.plugin.saveSettings();
      })
    );

    const modelResults = containerEl.createDiv();
    new Setting(containerEl).setName("可用模型").setDesc("只获取模型目录，不发送笔记或生成付费回复；也可直接填写模型 ID。")
      .addButton((button) => button.setButtonText("获取模型").onClick(async () => {
        const connection = this.plugin.settings.api;
        button.setDisabled(true);
        try {
          const backend = new ApiBackend(connection, this.app.secretStorage.getSecret(connection.secretId) ?? "");
          const models = await backend.listModels();
          if (this.plugin.settings.api !== connection || !modelResults.isConnected) return;
          modelResults.empty();
          if (!models.length) { new Notice("服务未返回模型，请手动填写模型 ID"); return; }
          new Setting(modelResults).setName("选择模型").addDropdown((dropdown) => {
            dropdown.addOption("", "请选择");
            for (const model of models) dropdown.addOption(model.id, model.name);
            dropdown.setValue(connection.model);
            dropdown.onChange(async (model) => {
              if (!model || this.plugin.settings.api !== connection) return;
              connection.model = model;
              await this.plugin.saveSettings();
              this.display();
            });
          });
        } catch { new Notice("模型目录获取失败，请检查地址与密钥；仍可手动填写模型 ID"); }
        finally { button.setDisabled(false); }
      }));

    const advanced = containerEl.createEl("details");
    advanced.createEl("summary", { text: "高级连接设置" });
    new Setting(advanced).setName("协议").addDropdown((dropdown) => dropdown
      .addOptions({ "openai-chat": "OpenAI Chat Completions", "openai-responses": "OpenAI Responses", anthropic: "Anthropic Messages", google: "Google Generative AI" })
      .setValue(apiProtocol(this.plugin.settings.api)).onChange(async (value) => {
        this.plugin.settings.api.protocol = value as ApiConnection["protocol"];
        await this.plugin.saveSettings();
      }));
    new Setting(advanced).setName("Base URL").setDesc("修改地址需重新填写密钥，防止发送到错误的服务。手机上的 localhost 指手机本身。")
      .addText((text) => {
        text.setValue(this.plugin.settings.api.baseUrl);
        text.inputEl.addEventListener("change", async () => {
          try {
            const next = validateApiUrl(text.getValue());
            if (next === this.plugin.settings.api.baseUrl) return;
            this.plugin.settings.api.baseUrl = next;
            this.plugin.settings.api.secretId = `qiaomu-agent-${crypto.randomUUID()}`;
            await this.plugin.saveSettings();
            this.display();
          } catch (error) { new Notice(error instanceof Error ? error.message : "地址无效"); }
        });
      });
  }

  private renderBehaviorSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "对话" });
    new Setting(containerEl)
      .setName("默认权限")
      .setDesc("控制本地 Agent 是否可以修改文件；手动追加回复仍需确认目标。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("plan", "不允许修改文件")
          .addOption("edit", "允许修改")
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value) => {
            this.plugin.settings.permissionMode = value === "edit" ? "edit" : "plan";
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

  private detectionSummary(): string {
    const detections = this.plugin.backendService.getDetections();
    if (detections.length === 0) return "尚未检测；打开设置后点击重新检测。";
    return detections
      .filter((item) => item.available)
      .map((item) => `${item.label}${item.callable ? " 可调用" : " 仅检测到应用"}`)
      .join(" · ") || "未发现支持的本地 Agent";
  }
}
