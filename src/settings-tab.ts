import { App, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import type QiaomuAgentPlugin from "./main";
import type { ApiConnection } from "./types";

const PROVIDERS: Record<
  ApiConnection["provider"],
  { label: string; baseUrl: string; model: string }
> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-5-mini" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  google: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  xai: { label: "xAI", baseUrl: "https://api.x.ai/v1", model: "grok-4-fast" },
  custom: { label: "自定义兼容接口", baseUrl: "", model: "" },
};

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
      for (const [value, provider] of Object.entries(PROVIDERS)) dropdown.addOption(value, provider.label);
      dropdown.setValue(this.plugin.settings.api.provider);
      dropdown.onChange(async (value) => {
        const provider = value as ApiConnection["provider"];
        const preset = PROVIDERS[provider];
        this.plugin.settings.api.provider = provider;
        if (provider !== "custom") {
          this.plugin.settings.api.baseUrl = preset.baseUrl;
          this.plugin.settings.api.model = preset.model;
        }
        await this.plugin.saveSettings();
        this.display();
      });
    });

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

    new Setting(containerEl).setName("Base URL").addText((text) =>
      text.setValue(this.plugin.settings.api.baseUrl).onChange(async (value) => {
        this.plugin.settings.api.baseUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
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
