import { App, Modal, Notice, Platform, Setting } from "obsidian";
import type QiaomuAgentPlugin from "../main";
import { getRuntimeRequire } from "../services/runtime-require";
import { listMcpServers, readMcpConfig, removeMcpServer, saveMcpServer, type McpServerEntry } from "../services/mcp-config";
import { addCodexMcp, listCodexMcp } from "../services/codex-mcp";
import { parseSkillFrontmatter } from "../utils";
import type { AgentSkill } from "../types";

export class CapabilitiesModal extends Modal {
  private tab: "skills" | "mcp" = "skills";
  private query = "";
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin, initialTab: "skills" | "mcp" = "skills", private readonly onSelectSkill?: (skill: AgentSkill) => void) {
    super(app); this.tab = initialTab;
  }

  override onOpen(): void {
    this.modalEl.addClass("qa-capabilities-modal");
    this.render();
  }
  override onClose(): void { this.contentEl.empty(); }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "技能与工具连接" });
    const tabs = el.createDiv({ cls: "qa-capability-tabs", attr: { role: "tablist", "aria-label": "能力类型" } });
    for (const [id, label] of [["skills", "技能"], ["mcp", "工具连接"]] as const) {
      const button = tabs.createEl("button", { text: label, attr: { type: "button", role: "tab", "aria-selected": String(this.tab === id) } });
      button.addEventListener("click", () => { this.tab = id; this.render(); });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault(); this.tab = this.tab === "skills" ? "mcp" : "skills"; this.render();
        this.contentEl.querySelector<HTMLElement>(`[role=tab][aria-selected=true]`)?.focus();
      });
    }
    const panel = el.createDiv({ cls: "qa-capability-panel", attr: { role: "tabpanel" } });
    if (this.tab === "skills") this.renderSkills(panel);
    else this.renderMcp(panel);
  }

  private renderSkills(el: HTMLElement): void {
    el.createEl("p", { cls: "qa-capability-intro", text: "选择要在乔木 Agent 中使用的技能。技能是可重复使用的操作说明。" });
    const actions = el.createDiv({ cls: "qa-capability-actions" });
    const search = actions.createEl("input", { type: "search", placeholder: "搜索技能", attr: { "aria-label": "搜索技能" } });
    search.value = this.query;
    const list = el.createDiv({ cls: "qa-capability-list" });
    search.addEventListener("input", () => { this.query = search.value.trim().toLowerCase(); this.renderSkillRows(list); });
    const refresh = actions.createEl("button", { text: "刷新", attr: { type: "button" } });
    refresh.addEventListener("click", async () => { refresh.disabled = true; await this.plugin.skillService.refresh(this.plugin.settings.skillDirectories); this.renderSkillRows(list); refresh.disabled = false; });
    this.renderSkillRows(list);

    if (!Platform.isDesktopApp) return;
    const add = el.createEl("details", { cls: "qa-capability-add" });
    add.createEl("summary", { text: "添加本地技能" });
    add.createEl("p", { cls: "qa-capability-intro", text: "填写含 SKILL.md 的文件夹路径。导入后会保存到个人技能目录。" });
    const row = add.createDiv({ cls: "qa-capability-actions" });
    const path = row.createEl("input", { type: "text", placeholder: "技能文件夹的绝对路径", attr: { "aria-label": "技能文件夹的绝对路径" } });
    const button = row.createEl("button", { text: "导入", attr: { type: "button" } });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        this.importLocalSkill(path.value);
        await this.plugin.skillService.refresh(this.plugin.settings.skillDirectories);
        path.value = ""; add.open = false; this.renderSkillRows(list);
        new Notice("技能已加入个人技能目录");
      } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
      finally { button.disabled = false; }
    });
    const advanced = el.createEl("details", { cls: "qa-capability-add" });
    advanced.createEl("summary", { text: "扫描其他目录" });
    new Setting(advanced).setName("额外目录").setDesc("每行一个绝对路径；仅供乔木 Agent 发现，不会移动文件。")
      .addTextArea((control) => {
        control.inputEl.rows = 3;
        control.setValue(this.plugin.settings.skillDirectories.join("\n"));
        control.onChange(async (value) => {
          this.plugin.settings.skillDirectories = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        });
      });
  }

  private renderSkillRows(el: HTMLElement): void {
    el.empty();
    const skills = this.plugin.skillService.list().filter((skill) => `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(this.query));
    if (!skills.length) { el.createEl("p", { cls: "qa-capability-empty", text: this.query ? "没有匹配的技能" : "尚未发现技能。可以导入本地技能，或点击刷新。" }); return; }
    for (const skill of skills) {
      const row = el.createDiv({ cls: "qa-capability-row" });
      const copy = row.createDiv({ cls: "qa-capability-row-copy" });
      copy.createEl("strong", { text: skill.name });
      copy.createEl("span", { text: skill.description });
      copy.createEl("small", { text: skill.source === "vault" ? `库内 · ${skill.path}` : skill.path });
      new Setting(row).setName("在乔木中显示").addToggle((toggle) => toggle
        .setTooltip(`${skill.name}：在乔木中显示`)
        .setValue(!this.plugin.settings.disabledSkillPaths.includes(skill.path))
        .onChange(async (enabled) => {
          this.plugin.settings.disabledSkillPaths = enabled
            ? this.plugin.settings.disabledSkillPaths.filter((path) => path !== skill.path)
            : [...new Set([...this.plugin.settings.disabledSkillPaths, skill.path])];
          await this.plugin.saveSettings();
        }));
      if (this.onSelectSkill) {
        const choose = row.createEl("button", { text: "使用", attr: { type: "button", "aria-label": `使用技能 ${skill.name}` } });
        choose.addEventListener("click", async () => {
          if (this.plugin.settings.disabledSkillPaths.includes(skill.path)) {
            this.plugin.settings.disabledSkillPaths = this.plugin.settings.disabledSkillPaths.filter((path) => path !== skill.path);
            await this.plugin.saveSettings();
          }
          this.onSelectSkill?.(skill); this.close();
        });
      }
    }
    el.createEl("p", { cls: "qa-capability-footnote", text: "这里控制乔木的技能菜单和主动附加。Codex、Claude Code 等本地 Agent 仍可能读取它们自己目录中的技能。" });
  }

  private importLocalSkill(input: string): void {
    const require = getRuntimeRequire();
    if (!require) throw new Error("仅桌面端可导入技能");
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const source = path.resolve(input.trim());
    if (!input.trim() || !path.isAbsolute(input.trim()) || !fs.existsSync(source) || fs.lstatSync(source).isSymbolicLink() || !fs.statSync(source).isDirectory()) throw new Error("请选择有效的技能文件夹绝对路径");
    const manifest = path.join(source, "SKILL.md");
    if (!fs.existsSync(manifest) || !parseSkillFrontmatter(fs.readFileSync(manifest, "utf8"))) throw new Error("文件夹中需要有效的 SKILL.md");
    const base = path.basename(source);
    if (!/^[\p{L}\p{N}._-]+$/u.test(base) || base === "." || base === "..") throw new Error("技能文件夹名称包含不支持的字符");
    const destinationRoot = this.plugin.skillService.defaultDirectories()[0];
    if (!destinationRoot) throw new Error("无法确定个人技能目录");
    const destination = path.join(destinationRoot, base);
    if (destination === source || destination.startsWith(`${source}${path.sep}`)) throw new Error("技能已经位于个人技能目录中");
    if (fs.existsSync(destination)) throw new Error("个人技能目录中已有同名文件夹，请先检查现有内容");
    fs.mkdirSync(destinationRoot, { recursive: true });
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false,
      filter: (entry) => !fs.lstatSync(entry).isSymbolicLink() });
  }

  private renderMcp(el: HTMLElement): void {
    el.createEl("p", { cls: "qa-capability-intro", text: "工具连接让本地 Agent 使用外部服务。添加时选择保存到 Codex 或乔木。" });
    let servers: McpServerEntry[];
    try { servers = listMcpServers(this.plugin.settings.mcpConfig); }
    catch (error) { el.createEl("p", { cls: "qa-capability-error", text: `当前配置无法读取：${error instanceof Error ? error.message : String(error)}` }); return; }
    const codexPath = this.plugin.backendService.getDetections().find((agent) => agent.id === "codex" && agent.callable)?.path;
    if (codexPath) this.renderCodexConnections(el, codexPath);
    this.renderMcpAdd(el, codexPath);
    el.createEl("h3", { cls: "qa-capability-subheading", text: "乔木连接" });
    const list = el.createDiv({ cls: "qa-capability-list" });
    if (!servers.length) list.createEl("p", { cls: "qa-capability-empty", text: "还没有乔木连接" });
    for (const server of servers) {
      const row = list.createDiv({ cls: "qa-capability-row" });
      const copy = row.createDiv({ cls: "qa-capability-row-copy" });
      copy.createEl("strong", { text: server.name });
      copy.createEl("span", { text: server.kind === "http" ? "远程连接" : "本地程序" });
      copy.createEl("small", { text: server.target });
      new Setting(row).setName("启用").addToggle((toggle) => toggle
        .setTooltip(`${server.name}：启用连接`)
        .setValue(!this.plugin.settings.disabledMcpServers.includes(server.name))
        .onChange(async (enabled) => {
          this.plugin.settings.disabledMcpServers = enabled
            ? this.plugin.settings.disabledMcpServers.filter((name) => name !== server.name)
            : [...new Set([...this.plugin.settings.disabledMcpServers, server.name])];
          await this.plugin.saveSettings();
        }));
      const remove = row.createEl("button", { text: "移除", attr: { type: "button", "aria-label": `移除 ${server.name}` } });
      remove.addEventListener("click", async () => {
        this.plugin.settings.mcpConfig = removeMcpServer(this.plugin.settings.mcpConfig, server.name);
        await this.plugin.saveSettings(); this.render();
      });
      if (codexPath) {
        const add = row.createEl("button", { text: "加入 Codex", attr: { type: "button", "aria-label": `将 ${server.name} 加入 Codex` } });
        add.addEventListener("click", async () => {
          add.disabled = true;
          try {
            const config = readMcpConfig(this.plugin.settings.mcpConfig).mcpServers as Record<string, Record<string, unknown>>;
            const raw = config[server.name];
            const supported = server.kind === "http" ? ["url"] : ["command", "args"];
            if (!raw || Object.keys(raw).some((key) => !supported.includes(key))) throw new Error("此连接含认证或高级参数，请在 Codex 原生配置中添加");
            await addCodexMcp(codexPath, server);
            const ready = await this.plugin.backendService.refreshCodexMcp();
            this.render(); new Notice(ready ? "已加入 Codex 配置；下一次对话将重新连接" : "已加入 Codex 配置；当前回复结束后请重载插件");
          } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); add.disabled = false; }
        });
      }
    }
    el.createEl("p", { cls: "qa-capability-footnote", text: "乔木开关控制传给 ACP / CLI 的连接；Codex 连接由 Codex 全局管理。API 模型不会读取这里的连接。" });
    const advanced = el.createEl("details", { cls: "qa-capability-add" });
    advanced.createEl("summary", { text: "高级：编辑 JSON 配置" });
    const input = advanced.createEl("textarea", { cls: "qa-capability-json", attr: { "aria-label": "MCP JSON 配置" } });
    input.value = this.plugin.settings.mcpConfig;
    const save = advanced.createEl("button", { text: "验证并保存", attr: { type: "button" } });
    save.addEventListener("click", async () => {
      try { listMcpServers(input.value); this.plugin.settings.mcpConfig = input.value; await this.plugin.saveSettings(); this.render(); new Notice("配置已保存"); }
      catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
    });
  }

  private renderCodexConnections(el: HTMLElement, executable: string): void {
    el.createEl("h3", { cls: "qa-capability-subheading", text: "Codex 已有连接" });
    const list = el.createDiv({ cls: "qa-capability-list qa-capability-native" });
    const status = list.createEl("p", { cls: "qa-capability-empty", text: "正在读取 Codex 连接…" });
    void listCodexMcp(executable).then((servers) => {
      if (!list.isConnected) return;
      status.remove();
      if (!servers.length) list.createEl("p", { cls: "qa-capability-empty", text: "Codex 还没有连接" });
      for (const server of servers) {
        const row = list.createDiv({ cls: "qa-capability-native-row" });
        row.createEl("span", { text: server.name });
        row.createEl("small", { text: server.enabled ? "已配置" : "已关闭" });
      }
    }).catch((error) => { if (list.isConnected) status.setText(`无法读取 Codex 连接：${error instanceof Error ? error.message : String(error)}`); });
  }

  private renderMcpAdd(el: HTMLElement, codexPath?: string | null): void {
    const add = el.createEl("details", { cls: "qa-capability-add" });
    add.createEl("summary", { text: "添加工具连接" });
    let scopeValue = codexPath ? "codex" : "qiaomu";
    if (codexPath) new Setting(add).setName("保存到").setDesc("Codex 配置会在其他 Codex 客户端中共用。")
      .addDropdown((dropdown) => dropdown.addOption("codex", "Codex（全局）").addOption("qiaomu", "乔木（其他本地 Agent）")
        .onChange((value) => { scopeValue = value; }));
    let kindValue = "http", nameValue = "", targetValue = "", argsValue = "";
    const kind = new Setting(add).setName("连接方式").addDropdown((dropdown) => dropdown.addOption("http", "远程地址").addOption("stdio", "本地程序").onChange((value) => {
      kindValue = value; target.nameEl.setText(value === "http" ? "地址" : "命令"); args.settingEl.toggle(value === "stdio");
    }));
    const name = new Setting(add).setName("名称").addText((text) => text.setPlaceholder("例如 notes-search").onChange((value) => { nameValue = value; }));
    const target = new Setting(add).setName("地址").addText((text) => text.setPlaceholder("https://example.com/mcp").onChange((value) => { targetValue = value; }));
    const args = new Setting(add).setName("参数（每行一个）").addTextArea((text) => { text.inputEl.rows = 3; text.onChange((value) => { argsValue = value; }); });
    args.settingEl.hide();
    const feedback = add.createDiv({ cls: "qa-capability-error", attr: { role: "status" } });
    const button = add.createEl("button", { text: "添加", attr: { type: "button" } });
    button.addEventListener("click", async () => {
      try {
        const entry: McpServerEntry = {
          name: nameValue, kind: kindValue as "http" | "stdio",
          target: targetValue,
          args: argsValue.split(/\r?\n/).map((part) => part.trim()).filter(Boolean),
        };
        if (scopeValue === "codex" && codexPath) {
          saveMcpServer("{}", entry); // Validate before changing Codex's global configuration.
          button.disabled = true;
          try {
            await addCodexMcp(codexPath, entry);
            const ready = await this.plugin.backendService.refreshCodexMcp();
            this.render(); new Notice(ready ? "已加入 Codex 配置；下一次对话将重新连接" : "已加入 Codex 配置；当前回复结束后请重载插件");
          } finally { button.disabled = false; }
        } else {
          if (listMcpServers(this.plugin.settings.mcpConfig).some((item) => item.name === entry.name)) throw new Error("已有同名连接");
          this.plugin.settings.mcpConfig = saveMcpServer(this.plugin.settings.mcpConfig, entry);
          await this.plugin.saveSettings(); this.render();
        }
      } catch (error) { feedback.setText(error instanceof Error ? error.message : String(error)); }
    });
  }
}
