import { Modal, Notice, Platform, setIcon, type App } from "obsidian";
import type QiaomuAgentPlugin from "../main";
import type { ApiConnection, ChatRequest, CliDetection, ModelChoice, ProviderConfig } from "../types";
import { API_PROVIDERS, apiProtocol, permitsEmptyKey, validateApiUrl } from "../services/api-providers";
import { ApiBackend, apiEfforts } from "../services/api-backend";
import { detectKey, recommendedModels } from "../services/key-detection";
import { agentShown, connectProvider, DEFAULT_VISIBLE_AGENT_IDS, maskKey, providerHost, providerIcon, providerLabel, removeProvider, upsertProvider } from "../services/model-sources";
import { nativeTransportFor, nativeTransportLabel } from "../services/native-agent-backend";
import { agentIconKey } from "./brand-icon";
import { BRAND_ICONS } from "./brand-icons";

function brand(parent: HTMLElement, icon: string | undefined, fallback: string, size = 20): void {
  const span = parent.createSpan({ cls: "qa-brand" });
  span.setAttribute("aria-hidden", "true");
  span.style.width = span.style.height = `${size}px`;
  const svg = icon ? BRAND_ICONS[icon] : undefined;
  if (svg) span.innerHTML = svg; // bundled, trusted asset
  else { span.addClass("qa-brand--generic"); setIcon(span, fallback); }
}

function dot(parent: HTMLElement, state: "ok" | "error" | "idle"): void {
  parent.createSpan({ cls: `qa-dot is-${state}`, attr: { "aria-hidden": "true" } });
}

function labeledInput(parent: HTMLElement, label: string, type: string, cls: string, attr: Record<string, string> = {}): HTMLInputElement {
  const wrapper = parent.createEl("label", { cls: "qa-input-label" });
  wrapper.createSpan({ cls: "qiaomu-agent__sr-only", text: label });
  return wrapper.createEl("input", { type, cls, attr });
}

function labelGroup(group: HTMLElement, label: string): void {
  const id = `qa-group-${crypto.randomUUID()}`;
  group.createSpan({ cls: "qiaomu-agent__sr-only", text: label, attr: { id } });
  group.setAttribute("aria-labelledby", id);
}

/** A Vercel-style card: body plus a muted footer bar. */
function card(parent: HTMLElement, title: string, description?: string): { body: HTMLElement; footer: HTMLElement } {
  const root = parent.createDiv({ cls: "qa-card" });
  const body = root.createDiv({ cls: "qa-card-body" });
  body.createEl("h3", { cls: "qa-card-title", text: title });
  if (description) body.createEl("p", { cls: "qa-card-desc", text: description });
  return { body, footer: root.createDiv({ cls: "qa-card-footer" }) };
}

function listModelsFor(connection: ApiConnection, key: string): Promise<ModelChoice[]> {
  return new ApiBackend(connection, key).listModels();
}

type Result = { state: "busy" | "ok" | "error"; title: string; detail?: string; icon?: string } | { state: "choose"; candidates: string[] };

/**
 * Model settings: paste one key and it is done. Unique key prefixes connect immediately;
 * shared shapes ask which vendor first, so a key is only ever sent to one provider.
 */
export class ProviderSettings {
  private result: Result | null = null;
  private pendingKey = "";
  private custom = false;
  private showProviderChoices = false;
  private chosenPreset = "";
  private customName = "";
  private customUrl = "";
  private customProtocol: NonNullable<ApiConnection["protocol"]> = "openai-chat";
  private detecting = false;
  private detectionAttempted = false;
  private detectionError = "";
  private tab: "agents" | "api" = Platform.isDesktopApp ? "agents" : "api";
  private showOtherAgents = false;

  constructor(private readonly plugin: QiaomuAgentPlugin, private readonly rerender: () => void) {}

  private get settings() { return this.plugin.settings; }
  private get app() { return this.plugin.app; }
  private secret(provider: ApiConnection): string { return this.app.secretStorage.getSecret(provider.secretId) ?? ""; }

  render(container: HTMLElement): void {
    container.addClass("qa-models");
    this.renderCurrent(container);
    if (Platform.isDesktopApp) {
      const tabs = container.createDiv({ cls: "qa-model-tabs", attr: { role: "tablist" } });
      for (const [index, id, label] of [[0, "agents", "本机 Agent"], [1, "api", "API 模型"]] as const) {
        const selected = this.tab === id;
        const button = tabs.createEl("button", { cls: "qa-model-tab", text: label, attr: { role: "tab", "aria-selected": String(selected) } });
        button.tabIndex = selected ? 0 : -1;
        button.addEventListener("click", () => this.switchTab(id, container));
        button.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          this.switchTab(index === 0 ? "api" : "agents", container, true);
        });
      }
    }
    const panel = container.createDiv({ cls: "qa-model-panel", attr: { role: "tabpanel" } });
    if (this.tab === "agents" && Platform.isDesktopApp) this.renderAgents(panel);
    else this.renderApi(panel);
  }

  private switchTab(tab: "agents" | "api", container: HTMLElement, focus = false): void {
    if (this.tab !== tab) {
      this.tab = tab;
      const scrollArea = container.closest<HTMLElement>(".modal-content, .vertical-tab-content");
      this.rerender();
      scrollArea?.scrollTo({ top: 0 });
      if (focus) scrollArea?.querySelector<HTMLElement>(`[role=tab][aria-selected=true]`)?.focus();
    }
  }

  private renderCurrent(container: HTMLElement): void {
    const current = container.createDiv({ cls: "qa-current" });
    const copy = current.createDiv();
    copy.createDiv({ cls: "qa-eyebrow", text: "当前对话" });
    const settings = this.settings;
    if (settings.backendKind === "api") {
      const provider = settings.providers.find((item) => item.secretId === settings.api.secretId);
      copy.createDiv({ cls: "qa-current-name", text: provider ? (provider.models?.find((item) => item.id === settings.api.model)?.name || settings.api.model || "尚未选择模型") : "尚未连接模型" });
      copy.createDiv({ cls: "qa-current-detail", text: provider ? `${providerLabel(provider)} · 在对话输入框中切换模型` : "请先添加模型服务商" });
    } else if (settings.backendKind === "cli") {
      const agent = this.plugin.backendService.getDetections().find((item) => item.id === settings.preferredCli);
      const selected = settings.modelSelections?.[`cli:${settings.preferredCli}`]?.model || "";
      const modelName = settings.agentModelCache[settings.preferredCli]?.models.find((item) => item.id === selected)?.name || selected;
      copy.createDiv({ cls: "qa-current-name", text: modelName || agent?.label || settings.preferredCli || "本机 Agent" });
      copy.createDiv({ cls: "qa-current-detail", text: `${agent?.label || "本机 Agent"} · 在对话输入框中切换模型` });
    } else {
      copy.createDiv({ cls: "qa-current-name", text: "自动选择" });
      copy.createDiv({ cls: "qa-current-detail", text: "在对话输入框中选择具体模型" });
    }
  }

  private renderAddCard(container: HTMLElement): void {
    const { body, footer } = card(container, this.chosenPreset ? `连接 ${API_PROVIDERS[this.chosenPreset]?.label ?? "服务商"}` : "连接新的模型服务商", this.custom ? "填写接口地址和 API Key，连接后自动读取模型。" : "粘贴 API Key，识别服务商并读取模型。");
    if (this.chosenPreset) {
      const back = body.createEl("button", { cls: "qa-text-button qa-provider-back", text: "返回自动识别" });
      back.addEventListener("click", () => { this.chosenPreset = ""; this.custom = false; this.result = null; this.rerender(); });
    }
    const row = body.createDiv({ cls: "qa-keyrow" });
    const inputLabel = row.createEl("label", { cls: "qa-field-label" });
    inputLabel.createSpan({ cls: "qiaomu-agent__sr-only", text: "API Key" });
    const input = inputLabel.createEl("input", { type: "password", cls: "qa-keyinput", attr: { placeholder: "粘贴 API Key", autocomplete: "off", spellcheck: "false" } });
    input.value = this.pendingKey;
    const connect = row.createEl("button", { cls: "mod-cta", text: "连接" });
    const run = () => { this.pendingKey = input.value.trim(); void this.start(); };
    connect.addEventListener("click", run);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); run(); } });
    input.addEventListener("input", () => { this.pendingKey = input.value.trim(); });
    // Pasting is the whole flow: the value lands after the paste event, then detection starts.
    input.addEventListener("paste", () => { if (!this.chosenPreset) window.setTimeout(run, 0); });

    if (this.custom) {
      const panel = body.createDiv({ cls: "qa-custom" });
      panel.createDiv({ cls: "qa-custom-label", text: "显示名称" });
      const name = labeledInput(panel, "显示名称", "text", "qa-custom-name", { placeholder: "例如：我的中转站" });
      name.value = this.customName;
      name.addEventListener("input", () => { this.customName = name.value.trim(); });
      panel.createDiv({ cls: "qa-custom-label", text: "接口类型" });
      const seg = panel.createDiv({ cls: "qa-segments", attr: { role: "radiogroup" } });
      labelGroup(seg, "接口类型");
      for (const [value, label] of [["openai-chat", "OpenAI 兼容"], ["anthropic", "Anthropic 兼容"]] as const) {
        const option = seg.createEl("button", { text: label, attr: { role: "radio", "aria-checked": String(this.customProtocol === value) } });
        option.addEventListener("click", () => { this.customProtocol = value; this.rerender(); });
      }
      panel.createDiv({ cls: "qa-custom-label", text: "接口地址" });
      const url = labeledInput(panel, "接口地址", "url", "qa-custom-url", { placeholder: this.customProtocol === "anthropic" ? "https://api.example.com" : "https://api.example.com/v1" });
      url.value = this.customUrl;
      url.addEventListener("input", () => { this.customUrl = url.value.trim(); });
    }

    const status = body.createDiv({ cls: "qa-result", attr: { role: "status", "aria-live": "polite" } });
    this.renderResult(status);

    const lock = footer.createDiv({ cls: "qa-card-footer-note" });
    setIcon(lock.createSpan({ cls: "qa-inline-icon" }), "lock");
    lock.createSpan({ text: "密钥仅保存在这台设备" });
    const actions = footer.createDiv({ cls: "qa-card-footer-actions" });
    const other = actions.createEl("button", { cls: "qa-text-button", text: this.showProviderChoices ? "收起服务商" : "选择服务商或自定义接口" });
    other.setAttribute("aria-expanded", String(this.showProviderChoices));
    other.addEventListener("click", () => { this.showProviderChoices = !this.showProviderChoices; this.rerender(); });
    if (this.showProviderChoices) this.renderProviderChoices(container);
  }

  private renderProviderChoices(container: HTMLElement): void {
    const panel = container.createDiv({ cls: "qa-provider-choices" });
    const search = labeledInput(panel, "搜索服务商", "search", "qa-provider-search", { placeholder: "搜索服务商" });
    const list = panel.createDiv({ cls: "qa-provider-choices-list" });
    const items: Array<{ label: string; button: HTMLButtonElement }> = [];
    for (const [id, preset] of Object.entries(API_PROVIDERS)) {
      if (id === "custom") continue;
      const button = list.createEl("button", { cls: "qa-provider-choice" });
      brand(button, preset.icon, "boxes", 18);
      button.createSpan({ text: preset.label });
      button.addEventListener("click", () => { this.chosenPreset = id; this.custom = false; this.showProviderChoices = false; this.result = null; this.rerender(); });
      items.push({ label: `${preset.label} ${id}`.toLowerCase(), button });
    }
    const custom = list.createEl("button", { cls: "qa-provider-choice qa-provider-choice-custom", text: "自定义接口" });
    custom.addEventListener("click", () => { this.chosenPreset = "custom"; this.custom = true; this.showProviderChoices = false; this.result = null; this.rerender(); });
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      for (const item of items) item.button.hidden = !item.label.includes(q);
      custom.hidden = Boolean(q) && !"自定义接口 custom".includes(q);
    });
  }

  private renderResult(status: HTMLElement): void {
    const result = this.result;
    if (!result) return;
    if (result.state === "choose") {
      status.createDiv({ cls: "qa-result-title", text: "这是哪一家的密钥？确认后只发给这一家验证。" });
      const chips = status.createDiv({ cls: "qa-candidates" });
      for (const id of result.candidates) {
        const preset = API_PROVIDERS[id];
        if (!preset) continue;
        const chip = chips.createEl("button", { cls: "qa-candidate" });
        brand(chip, preset.icon, "boxes", 16);
        chip.createSpan({ text: preset.label });
        chip.addEventListener("click", () => void this.connect(id));
      }
      const more = chips.createEl("button", { cls: "qa-candidate is-more", text: "其他…" });
      more.addEventListener("click", () => { this.showProviderChoices = true; this.rerender(); });
      return;
    }
    const line = status.createDiv({ cls: `qa-result-row is-${result.state}` });
    if (result.state === "busy") setIcon(line.createSpan({ cls: "qa-inline-icon is-spinning" }), "loader");
    else brand(line, result.icon, result.state === "ok" ? "check" : "circle-alert", 18);
    const text = line.createDiv({ cls: "qa-result-text" });
    text.createDiv({ cls: "qa-result-title", text: result.title });
    if (result.detail) text.createDiv({ cls: "qa-result-detail", text: result.detail });
    if (result.state !== "busy") dot(line, result.state === "ok" ? "ok" : "error");
  }

  private async start(): Promise<void> {
    if (this.chosenPreset && !this.custom) { await this.connect(this.chosenPreset); return; }
    if (this.custom) {
      try { this.customUrl = validateApiUrl(this.customUrl); }
      catch (error) { this.result = { state: "error", title: "接口地址无效", detail: error instanceof Error ? error.message : String(error) }; this.rerender(); return; }
      await this.connect("custom");
      return;
    }
    const detection = detectKey(this.pendingKey);
    if (detection.kind === "empty") return;
    if (detection.kind === "unique") { await this.connect(detection.provider); return; }
    this.result = { state: "choose", candidates: detection.candidates };
    this.rerender();
  }

  private async connect(presetId: string): Promise<void> {
    const preset = API_PROVIDERS[presetId] ?? API_PROVIDERS.custom!;
    const key = this.pendingKey;
    if (!key && !preset.local) { this.result = { state: "error", title: "请先粘贴 API Key" }; this.rerender(); return; }
    const label = presetId === "custom" ? this.customName || providerHost({ baseUrl: this.customUrl }) : preset.label;
    this.result = { state: "busy", title: `正在验证 ${label}…` };
    this.rerender();
    try {
      const endpoint = presetId === "custom" ? { baseUrl: this.customUrl, protocol: this.customProtocol, name: this.customName || undefined } : {};
      const { provider, models } = await connectProvider(this.settings, presetId, key, {
        listModels: listModelsFor,
        getSecret: (id) => this.app.secretStorage.getSecret(id),
        setSecret: (id, value) => this.app.secretStorage.setSecret(id, value),
      }, endpoint);
      await this.plugin.saveSettings();
      this.pendingKey = "";
      this.custom = false;
      this.chosenPreset = "";
      this.result = { state: "ok", icon: preset.icon, title: `已连接 ${providerLabel(provider)}`, detail: `已验证 · ${models.length} 个模型${provider.model ? ` · 默认 ${provider.model}` : ""}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.result = { state: "error", icon: preset.icon, title: `${label} 验证失败`, detail: /[(（](401|403)[)）]/.test(message) ? "密钥无效或没有权限。如果选错了服务商，重新粘贴后换一家。" : message };
    }
    this.rerender();
  }

  private renderApi(container: HTMLElement): void {
    const providers = this.settings.providers;
    this.renderAddCard(container);
    const { body } = card(container, "已接入的服务商", providers.length ? "在这里管理聊天时可选的模型。" : "连接后会显示在这里。");
    const list = body.createDiv({ cls: "qa-list" });
    if (!providers.length) list.createDiv({ cls: "qa-list-empty", text: "还没有接入服务商。粘贴上方的 API Key 即可开始。" });
    for (const provider of providers) {
      const key = this.secret(provider);
      const ok = Boolean(key) || permitsEmptyKey(provider);
      const enabled = new Set(provider.enabledModels ?? []).size;
      this.row(list, providerIcon(provider), "boxes", providerLabel(provider), `${enabled} 个模型可选`, ok ? "ok" : "error", ok ? "已配置" : "需要密钥",
        () => new ProviderModal(this.app, this.plugin, provider.id, this.rerender).open(), provider.showInPicker !== false,
        async (shown) => { upsertProvider(this.settings, { ...provider, showInPicker: shown }); await this.plugin.saveSettings(); this.rerender(); });
    }
    if (Platform.isDesktopApp && !providers.length) {
      const next = container.createEl("button", { cls: "qa-cross-link", text: "没有 API Key？查看本机 Agent" });
      next.addEventListener("click", () => this.switchTab("agents", container));
    }
  }

  private renderAgents(container: HTMLElement): void {
    const agents = this.plugin.backendService.getDetections();
    const ready = agents.filter((agent) => agent.callable);
    const popular: readonly string[] = DEFAULT_VISIBLE_AGENT_IDS;
    const main = ready.filter((agent) => popular.includes(agent.id) || agent.id === this.settings.preferredCli)
      .sort((a, b) => popular.indexOf(a.id) - popular.indexOf(b.id));
    const other = ready.filter((agent) => !main.includes(agent));
    const { body, footer } = card(container, "使用本机 Agent", "读取已安装的程序；账号和密钥继续由各程序管理。");
    const list = body.createDiv({ cls: "qa-list" });
    if (!agents.length) list.createDiv({ cls: "qa-list-empty", text: this.detecting ? "正在检测本机 Agent…" : "尚未完成检测。" });
    else if (!ready.length) list.createDiv({ cls: "qa-list-empty", text: "尚未找到可调用的 Agent。安装本机 CLI 后点“重新检测”。" });
    for (const agent of main) this.agentRow(list, agent);
    if (other.length) {
      const group = list.createDiv({ cls: "qa-list-group qa-local-head" });
      group.createSpan({ text: `其他 Agent · ${other.length}` });
      const expand = group.createEl("button", { cls: "qa-text-button", text: this.showOtherAgents ? "收起" : "查看" });
      expand.setAttribute("aria-expanded", String(this.showOtherAgents));
      expand.addEventListener("click", () => { this.showOtherAgents = !this.showOtherAgents; this.rerender(); });
      if (this.showOtherAgents) for (const agent of other) this.agentRow(list, agent);
    }
    const missing = agents.filter((agent) => !agent.available);
    const unavailable = agents.filter((agent) => agent.available && !agent.callable);
    if (this.detectionError) body.createDiv({ cls: "qa-inline-error", text: `检测失败：${this.detectionError}`, attr: { role: "alert" } });
    const note = unavailable.map(agent => agent.note || `${agent.label} 已安装，暂不可调用`).join("；");
    footer.createDiv({ cls: "qa-card-footer-note", text: note || (missing.length ? `另有 ${missing.length} 个未安装` : "登录状态以各 Agent 自己的提示为准") });
    const redetect = footer.createDiv({ cls: "qa-card-footer-actions" }).createEl("button", { cls: "qa-text-button", text: this.detecting ? "检测中…" : "重新检测" });
    redetect.disabled = this.detecting;
    redetect.addEventListener("click", () => void this.detect());
    if (!agents.length && !this.detecting && !this.detectionAttempted) void this.detect();
    const next = container.createEl("button", { cls: "qa-cross-link", text: "使用 API Key 接入模型" });
    next.addEventListener("click", () => this.switchTab("api", container));
  }

  private agentRow(list: HTMLElement, agent: CliDetection): void {
    const count = this.settings.agentModelCache[agent.id]?.models.length ?? 0;
    this.row(list, agentIconKey(agent.id), "bot", agent.label, count ? `已读取 ${count} 个模型` : "已找到本机程序", "ok", "",
      () => new AgentModal(this.app, this.plugin, agent, this.rerender).open(), agentShown(this.settings, agent.id),
      async (shown) => { this.settings.agentVisibility[agent.id] = shown; this.settings.hiddenAgents = this.settings.hiddenAgents.filter((id) => id !== agent.id); await this.plugin.saveSettings(); this.rerender(); });
  }

  private async detect(): Promise<void> {
    if (this.detecting) return;
    this.detecting = true;
    this.detectionAttempted = true;
    this.detectionError = "";
    try { await this.plugin.refreshIntegrations(); }
    catch (error) { this.detectionError = error instanceof Error ? error.message : String(error); }
    finally { this.detecting = false; this.rerender(); }
  }

  private row(list: HTMLElement, icon: string | undefined, fallback: string, name: string, sub: string, state: "ok" | "error", statusText: string, open: () => void, shown: boolean, onShown: (shown: boolean) => void): void {
    const entry = list.createDiv({ cls: "qa-list-entry" });
    const row = entry.createEl("button", { cls: "qa-list-row" });
    brand(row, icon, fallback);
    const text = row.createDiv({ cls: "qa-list-text" });
    text.createDiv({ cls: "qa-list-name", text: name });
    text.createDiv({ cls: "qa-list-sub", text: sub });
    if (statusText) row.createSpan({ cls: `qa-source-status is-${state}`, text: statusText });
    setIcon(row.createSpan({ cls: "qa-list-chevron" }), "chevron-right");
    row.addEventListener("click", open);
    const visibility = entry.createEl("button", { cls: "qa-visibility-action", text: shown ? "显示中" : "已隐藏" });
    visibility.createSpan({ cls: "qiaomu-agent__sr-only", text: ` ${name}的模型` });
    visibility.setAttribute("aria-pressed", String(shown));
    visibility.addEventListener("click", () => onShown(!shown));
  }
}

/** One provider: key, searchable model switches, default model, endpoint, removal. */
class ProviderModal extends Modal {
  private query = "";
  private changingKey = false;
  private confirmRemove = false;
  private busy = "";
  private error = "";
  private testResult = "";

  constructor(app: App, private readonly plugin: QiaomuAgentPlugin, private readonly id: string, private readonly onChange: () => void) { super(app); }

  private get provider(): ProviderConfig | undefined { return this.plugin.settings.providers.find((item) => item.id === this.id); }

  override onOpen(): void { this.modalEl.addClass("qa-provider-modal"); this.draw(); }
  override onClose(): void { this.contentEl.empty(); this.onChange(); }

  private async save(provider: ProviderConfig): Promise<void> {
    upsertProvider(this.plugin.settings, provider);
    await this.plugin.saveSettings();
  }

  private draw(): void {
    const provider = this.provider;
    const { contentEl } = this;
    contentEl.empty();
    if (!provider) { this.close(); return; }
    this.titleEl.empty();
    brand(this.titleEl, providerIcon(provider), "boxes", 22);
    this.titleEl.createSpan({ text: providerLabel(provider) });
    this.titleEl.addClass("qa-modal-title");
    const preset = API_PROVIDERS[provider.provider] ?? API_PROVIDERS.custom!;

    // Keep connection details available after the primary model choices.
    const keySection = contentEl.createDiv({ cls: "qa-section" });
    keySection.createEl("h4", { text: "API Key" });
    const key = this.app.secretStorage.getSecret(provider.secretId) ?? "";
    const keyRow = keySection.createDiv({ cls: "qa-keyrow" });
    if (this.changingKey) {
      const input = labeledInput(keyRow, "新的 API Key", "password", "qa-keyinput", { placeholder: "粘贴新的密钥", autocomplete: "off" });
      const verify = keyRow.createEl("button", { cls: "mod-cta", text: this.busy === "key" ? "验证中…" : "验证并保存" });
      verify.disabled = this.busy === "key";
      const submit = async () => {
        if (!input.value.trim()) return;
        const value = input.value;
        this.busy = "key"; this.error = ""; this.draw();
        try {
          await connectProvider(this.plugin.settings, provider.provider, value, {
            listModels: listModelsFor,
            getSecret: (id) => this.app.secretStorage.getSecret(id),
            setSecret: (id, secret) => this.app.secretStorage.setSecret(id, secret),
          }, { baseUrl: provider.baseUrl, protocol: provider.protocol, name: provider.name });
          await this.plugin.saveSettings();
          this.changingKey = false;
          new Notice("密钥已验证并更换");
        } catch (error) { this.error = `验证失败：${error instanceof Error ? error.message : String(error)}`; }
        this.busy = ""; this.draw();
      };
      verify.addEventListener("click", () => void submit());
      input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) void submit(); });
      window.setTimeout(() => input.focus(), 0);
    } else {
      keyRow.createSpan({ cls: "qa-keymask", text: key ? maskKey(key) : permitsEmptyKey(provider) ? "本机服务，无需密钥" : "未保存密钥" });
      if (!preset.local || provider.provider === "custom") {
        const change = keyRow.createEl("button", { cls: "qa-text-button", text: "更换" });
        change.addEventListener("click", () => { this.changingKey = true; this.draw(); });
      }
      if (preset.website) keyRow.createEl("a", { cls: "qa-text-link", text: "获取密钥 ↗", href: preset.website, attr: { rel: "noopener noreferrer" } });
    }
    if (this.error) keySection.createDiv({ cls: "qa-inline-error", text: this.error, attr: { role: "alert" } });

    // Models
    const modelSection = contentEl.createDiv({ cls: "qa-section" });
    const all = provider.models ?? [];
    const enabled = new Set(provider.enabledModels ?? []);
    const recommended = new Set(recommendedModels(provider.provider, all));
    const head = modelSection.createDiv({ cls: "qa-section-head" });
    head.createEl("h4", { text: `在对话中可选 · ${enabled.size}` });
    const actions = head.createDiv({ cls: "qa-section-actions" });
    const refresh = actions.createEl("button", { cls: "qa-text-button", text: this.busy === "models" ? "获取中…" : "刷新列表" });
    refresh.disabled = Boolean(this.busy);
    refresh.addEventListener("click", async () => {
      this.busy = "models"; this.draw();
      try {
        const models = await listModelsFor(provider, key);
        await this.save({ ...provider, models, fetchedAt: Date.now() });
      } catch (error) { new Notice(error instanceof Error ? error.message : "获取模型失败"); }
      this.busy = ""; this.draw();
    });
    const test = actions.createEl("button", { cls: "qa-text-button", text: this.busy === "test" ? "测试中…" : "测试模型" });
    test.disabled = Boolean(this.busy) || !key || !(provider.model || provider.enabledModels?.[0]);
    test.addEventListener("click", () => void this.testModel(provider, key));
    if (this.testResult) modelSection.createDiv({ cls: this.testResult.startsWith("测试成功") ? "qa-card-desc" : "qa-inline-error", text: this.testResult, attr: { role: "status" } });
    const search = labeledInput(modelSection, "搜索模型", "search", "qa-model-search", { placeholder: all.length ? `搜索 ${all.length} 个模型` : "没有模型列表，可在下方手动添加" });
    search.value = this.query;
    const list = modelSection.createDiv({ cls: "qa-switch-list" });
    const drawList = () => {
      list.empty();
      const q = this.query.trim().toLowerCase();
      const ids = [...all.map((model) => model.id), ...[...enabled].filter((id) => !all.some((model) => model.id === id))];
      // Enabled first, then recommended, then the rest in vendor order.
      const rank = (id: string) => enabled.has(id) ? 0 : recommended.has(id) ? 1 : 2;
      const shown = ids.filter((id) => !q || id.toLowerCase().includes(q) || (all.find((m) => m.id === id)?.name ?? "").toLowerCase().includes(q))
        .sort((a, b) => rank(a) - rank(b));
      for (const id of shown.slice(0, 200)) {
        const model = all.find((item) => item.id === id);
        const row = list.createDiv({ cls: "qa-switch-row" });
        const label = row.createEl("label", { cls: "qa-switch-label" });
        const toggle = label.createEl("input", { type: "checkbox", attr: { role: "switch" } });
        toggle.checked = enabled.has(id);
        const text = label.createDiv({ cls: "qa-switch-text" });
        const name = text.createDiv({ cls: "qa-switch-name", text: model?.name && model.name !== id ? model.name : id });
        if (recommended.has(id)) name.createSpan({ cls: "qa-pill", text: "推荐" });
        if (provider.model === id) name.createSpan({ cls: "qa-pill is-strong", text: "该服务商默认" });
        if (model?.name && model.name !== id) text.createDiv({ cls: "qa-switch-id", text: id });
        if (!model) text.createDiv({ cls: "qa-switch-id", text: "手动添加" });
        toggle.addEventListener("change", async () => {
          if (toggle.checked) enabled.add(id); else enabled.delete(id);
          const next = { ...provider, enabledModels: ids.filter((item) => enabled.has(item)) };
          if (!toggle.checked && provider.model === id) next.model = next.enabledModels[0] ?? "";
          if (toggle.checked && !provider.model) next.model = id;
          await this.save(next);
          this.draw();
        });
        if (toggle.checked && provider.model !== id) {
          const makeDefault = row.createEl("button", { cls: "qa-text-button", text: "设为该服务商默认" });
          makeDefault.addEventListener("click", async () => { await this.save({ ...provider, model: id }); this.draw(); });
        }
        if (toggle.checked) {
          const details = row.createEl("button", { cls: "qa-text-button", text: "配置", attr: { "aria-expanded": "false" } });
          const panel = list.createDiv({ cls: "qa-model-options" });
          panel.hidden = true;
          details.addEventListener("click", () => { panel.hidden = !panel.hidden; details.setAttribute("aria-expanded", String(!panel.hidden)); });
          panel.createDiv({ cls: "qa-switch-id", text: id });
          const options = provider.modelOptions?.[id] ?? {};
          const addNumber = (label: string, value: number | undefined, min: number, max: number, step: string, field: "temperature" | "maxOutputTokens") => {
            const wrapper = panel.createEl("label", { cls: "qa-model-option" });
            wrapper.createSpan({ text: label });
            const input = wrapper.createEl("input", { type: "number", attr: { min: String(min), max: String(max), step, placeholder: "默认" } });
            input.value = value === undefined ? "" : String(value);
            input.addEventListener("change", async () => {
              if (input.value !== "" && (!input.validity.valid || !Number.isFinite(input.valueAsNumber))) { new Notice(`${label}超出允许范围`); input.value = value === undefined ? "" : String(value); return; }
              const latest = this.provider ?? provider;
              const next = { ...(latest.modelOptions?.[id] ?? options) };
              if (input.value === "") delete next[field]; else next[field] = input.valueAsNumber;
              await this.save({ ...latest, modelOptions: { ...latest.modelOptions, [id]: next } });
            });
          };
          if (!apiEfforts(provider.provider, id).length) addNumber("温度（0–2）", options.temperature, 0, 2, "0.1", "temperature");
          addNumber("最大输出 Token（1–65536）", options.maxOutputTokens, 1, 65536, "1", "maxOutputTokens");
        }
      }
      if (shown.length > 200) list.createDiv({ cls: "qa-list-empty", text: `还有 ${shown.length - 200} 个，请搜索` });
      if (!shown.length) list.createDiv({ cls: "qa-list-empty", text: q ? "没有匹配的模型" : "还没有模型。点“刷新列表”，或手动添加模型 ID。" });
    };
    search.addEventListener("input", () => { this.query = search.value; drawList(); });
    drawList();
    const add = labeledInput(modelSection, "手动添加模型 ID", "text", "qa-model-add", { placeholder: "手动添加模型 ID，回车确认" });
    add.addEventListener("keydown", async (event) => {
      const id = add.value.trim();
      if (event.key !== "Enter" || event.isComposing || !id) return;
      await this.save({ ...provider, enabledModels: [...(provider.enabledModels ?? []).filter((item) => item !== id), id], model: provider.model || id });
      this.draw();
    });

    contentEl.appendChild(keySection);
    keySection.createDiv({ cls: "qa-card-desc", text: "密钥仅在连接失败或需要更换时操作。" });

    // Endpoint
    const advanced = contentEl.createEl("details", { cls: "qa-section qa-advanced" });
    advanced.createEl("summary", { text: `接口地址 · ${providerHost(provider)}` });
    if (provider.provider === "custom") {
      const seg = advanced.createDiv({ cls: "qa-segments", attr: { role: "radiogroup" } });
      labelGroup(seg, "接口类型");
      for (const [value, label] of [["openai-chat", "OpenAI 兼容"], ["anthropic", "Anthropic 兼容"]] as const) {
        const option = seg.createEl("button", { text: label, attr: { role: "radio", "aria-checked": String(apiProtocol(provider) === value) } });
        option.addEventListener("click", async () => { await this.save({ ...provider, protocol: value }); this.draw(); });
      }
    }
    const url = labeledInput(advanced, "接口地址", "url", "qa-endpoint-url");
    url.value = provider.baseUrl;
    advanced.createDiv({ cls: "qa-card-desc", text: "修改地址后需要重新填写密钥，避免把密钥发到错误的服务。" });
    url.addEventListener("change", async () => {
      try {
        const next = validateApiUrl(url.value);
        if (next === provider.baseUrl) return;
        this.app.secretStorage.setSecret(provider.secretId, "");
        await this.save({ ...provider, baseUrl: next, secretId: `qiaomu-agent-${provider.id}-${crypto.randomUUID()}` });
        this.changingKey = true;
        this.draw();
      } catch (error) { new Notice(error instanceof Error ? error.message : "地址无效"); }
    });

    // Footer
    const footer = contentEl.createDiv({ cls: "qa-modal-footer" });
    const remove = footer.createEl("button", { cls: `qa-text-button ${this.confirmRemove ? "is-danger-strong" : "is-danger"}`, text: this.confirmRemove ? "确认移除？" : "移除服务商" });
    remove.addEventListener("click", async () => {
      if (!this.confirmRemove) { this.confirmRemove = true; this.draw(); return; }
      this.app.secretStorage.setSecret(provider.secretId, "");
      removeProvider(this.plugin.settings, provider.id);
      await this.plugin.saveSettings();
      this.close();
    });
    const done = footer.createEl("button", { cls: "mod-cta", text: "完成" });
    done.addEventListener("click", () => this.close());
  }
  private async testModel(provider: ProviderConfig, key: string): Promise<void> {
    const model = provider.model || provider.enabledModels?.[0];
    if (!model || this.busy) return;
    this.busy = "test"; this.testResult = ""; this.draw();
    try {
      let response = "";
      await new ApiBackend({ ...provider, model }, key).send(
        { prompt: "只回复 OK。", systemPrompt: "", cwd: null, model, modelOptions: { maxOutputTokens: 128 }, permissionMode: "plan", history: [] },
        { onText: (text) => { response += text; }, onStatus: () => {} }, AbortSignal.timeout(25_000));
      if (!response.trim()) throw new Error("模型没有返回文字");
      this.testResult = `测试成功：${model} 已返回内容`;
    } catch (error) { this.testResult = `测试失败：${error instanceof Error ? error.message : String(error)}`; }
    finally { this.busy = ""; this.draw(); }
  }
}

/** A local agent: read-only facts; its login and models belong to the agent itself. */
class AgentModal extends Modal {
  private busy = false;
  private error = "";
  private closed = false;
  private readonly backendOwner = `model-settings-${crypto.randomUUID()}`;
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin, private readonly agent: CliDetection, private readonly onChange: () => void) { super(app); }
  override onOpen(): void { this.modalEl.addClass("qa-provider-modal"); this.draw(); }
  private draw(): void {
    if (this.closed) return;
    this.modalEl.addClass("qa-provider-modal");
    this.titleEl.empty();
    this.titleEl.addClass("qa-modal-title");
    brand(this.titleEl, agentIconKey(this.agent.id), "bot", 22);
    this.titleEl.createSpan({ text: this.agent.label });
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createDiv({ cls: "qa-card-desc", text: "已找到本机程序。登录状态由该 Agent 管理。" });
    const settings = this.plugin.settings;
    const reported = settings.agentModelCache[this.agent.id]?.models ?? [];
    const custom = settings.agentCustomModels[this.agent.id] ?? [];
    const models = [...reported, ...custom.filter((id) => !reported.some((model) => model.id === id)).map((id) => ({ id, name: id, efforts: [] }))];
    const visible = settings.agentEnabledModels[this.agent.id];
    const isVisible = (id: string) => !visible || visible.includes(id);
    const section = contentEl.createDiv({ cls: "qa-section" });
    const head = section.createDiv({ cls: "qa-section-head" });
    head.createEl("h4", { text: models.length ? `在对话中显示 · ${models.filter((model) => isVisible(model.id)).length + Number(isVisible(""))}/${models.length + 1}` : "在对话中显示" });
    if (nativeTransportFor(this.agent.id) || this.agent.id === "antigravity" || this.agent.id === "pi") {
      const refresh = head.createEl("button", { cls: "qa-text-button", text: this.busy ? "读取中…" : models.length ? "重新读取" : "读取模型" });
      refresh.disabled = this.busy;
      refresh.addEventListener("click", () => void this.loadModels());
    }
    if (this.error) section.createDiv({ cls: "qa-inline-error", text: this.error, attr: { role: "alert" } });
    const search = models.length > 10 ? labeledInput(section, "筛选模型", "search", "qa-model-search", { placeholder: "筛选模型" }) : null;
    const list = section.createDiv({ cls: "qa-switch-list" });
    const rows: Array<{ row: HTMLElement; text: string }> = [];
    const addChoice = (id: string, name: string, detail = "") => {
      const row = list.createDiv({ cls: "qa-switch-row" });
      rows.push({ row, text: `${name} ${id}`.toLowerCase() });
      const label = row.createEl("label", { cls: "qa-switch-label" });
      const toggle = label.createEl("input", { type: "checkbox", attr: { role: "switch" } });
      toggle.checked = isVisible(id);
      const text = label.createDiv({ cls: "qa-switch-text" });
      text.createDiv({ cls: "qa-switch-name", text: name });
      if (detail) text.createDiv({ cls: "qa-switch-id", text: detail });
      toggle.addEventListener("change", () => void this.setModelVisible(id, toggle.checked, models));
    };
    addChoice("", "默认模型", this.agent.id === "zcode" ? "在 ZCode 中更换具体模型" : "使用该 Agent 当前设置的模型");
    for (const model of models) addChoice(model.id, model.name || model.id, model.name !== model.id ? model.id : custom.includes(model.id) ? "手动添加" : "");
    search?.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      for (const item of rows) item.row.hidden = Boolean(query) && !item.text.includes(query);
    });
    if (!reported.length) section.createDiv({ cls: "qa-card-desc", text: nativeTransportFor(this.agent.id) || this.agent.id === "antigravity" || this.agent.id === "pi" ? "首次读取后会保存列表；需要更新时再手动读取。" : "该 Agent 未提供模型列表，可使用默认模型或在下方添加模型 ID。" });
    if (this.agent.id !== "zcode") {
      const manual = section.createDiv({ cls: "qa-manual-model" });
      const input = labeledInput(manual, "手动添加模型 ID", "text", "qa-model-add", { placeholder: "模型 ID" });
      const add = manual.createEl("button", { cls: "qa-text-button", text: "添加" });
      const submit = async () => {
        const id = input.value.trim();
        if (!id || id.length > 160 || models.some((model) => model.id === id)) { new Notice("请输入尚未添加的模型 ID"); return; }
        settings.agentCustomModels[this.agent.id] = [...custom, id];
        if (settings.agentEnabledModels[this.agent.id]) settings.agentEnabledModels[this.agent.id]!.push(id);
        await this.plugin.saveSettings(); this.draw();
      };
      add.addEventListener("click", () => void submit());
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") void submit(); });
    }
    if (this.agent.note) contentEl.createDiv({ cls: "qa-card-desc", text: this.agent.note });
    const advanced = contentEl.createEl("details", { cls: "qa-section qa-advanced" });
    advanced.createEl("summary", { text: "本机程序信息" });
    const facts = advanced.createDiv({ cls: "qa-facts" });
    for (const [name, value] of [["版本", this.agent.version ?? "未知"], ["连接方式", nativeTransportLabel(this.agent.id) || "命令行"], ["位置", this.agent.path ?? ""]] as const) {
      const row = facts.createDiv({ cls: "qa-fact" });
      row.createSpan({ cls: "qa-fact-name", text: name });
      row.createSpan({ cls: "qa-fact-value", text: value });
    }
    const footer = contentEl.createDiv({ cls: "qa-modal-footer qa-modal-footer-simple" });
    footer.createEl("button", { cls: "mod-cta", text: "完成" }).addEventListener("click", () => this.close());
  }
  private async setModelVisible(id: string, shown: boolean, models: ModelChoice[]): Promise<void> {
    const settings = this.plugin.settings;
    const current = settings.agentEnabledModels[this.agent.id] ?? ["", ...models.map((model) => model.id)];
    settings.agentEnabledModels[this.agent.id] = shown ? [...new Set([...current, id])] : current.filter((value) => value !== id);
    await this.plugin.saveSettings(); this.draw();
  }
  private async loadModels(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = ""; this.draw();
    try {
      const backend = this.plugin.backendService.resolve(`cli:${this.agent.id}`, this.backendOwner);
      const request: ChatRequest = { prompt: "", systemPrompt: "", cwd: this.plugin.skillService.getVaultRoot(), permissionMode: "plan", history: [], mcpConfig: {} };
      const models = await backend.listModels?.(request) ?? [];
      if (!models.length) throw new Error("该 Agent 没有返回模型列表，请在聊天中使用其默认模型。");
      this.plugin.settings.agentModelCache[this.agent.id] = { models: models.map(({ id, name, efforts }) => ({ id, name, efforts })), fetchedAt: Date.now() };
      await this.plugin.saveSettings();
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    finally { await this.plugin.backendService.release(this.backendOwner); this.busy = false; this.draw(); }
  }
  override onClose(): void { this.closed = true; this.contentEl.empty(); this.onChange(); void this.plugin.backendService.release(this.backendOwner); }
}
