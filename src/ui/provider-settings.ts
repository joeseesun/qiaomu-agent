import { FuzzySuggestModal, Modal, Notice, Platform, setIcon, type App } from "obsidian";
import type QiaomuAgentPlugin from "../main";
import type { ApiConnection, CliDetection, ModelChoice, ProviderConfig } from "../types";
import { API_PROVIDERS, apiProtocol, permitsEmptyKey, validateApiUrl, type ApiPreset } from "../services/api-providers";
import { ApiBackend } from "../services/api-backend";
import { detectKey, recommendedModels } from "../services/key-detection";
import { connectProvider, maskKey, providerHost, providerIcon, providerLabel, removeProvider, upsertProvider } from "../services/model-sources";
import { nativeTransportLabel } from "../services/native-agent-backend";
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

class PresetPicker extends FuzzySuggestModal<[string, ApiPreset]> {
  constructor(app: App, private readonly choose: (id: string) => void) { super(app); this.setPlaceholder("搜索服务商…"); }
  getItems(): Array<[string, ApiPreset]> { return Object.entries(API_PROVIDERS).filter(([id]) => id !== "custom"); }
  getItemText([id, preset]: [string, ApiPreset]): string { return `${preset.label} ${id} ${providerHost(preset)}`; }
  onChooseItem([id]: [string, ApiPreset]): void { this.choose(id); }
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
  private customName = "";
  private customUrl = "";
  private customProtocol: NonNullable<ApiConnection["protocol"]> = "openai-chat";
  private detecting = false;

  constructor(private readonly plugin: QiaomuAgentPlugin, private readonly rerender: () => void) {}

  private get settings() { return this.plugin.settings; }
  private get app() { return this.plugin.app; }
  private secret(provider: ApiConnection): string { return this.app.secretStorage.getSecret(provider.secretId) ?? ""; }

  render(container: HTMLElement): void {
    container.addClass("qa-models");
    this.renderAddCard(container);
    this.renderConnected(container);
  }

  private renderAddCard(container: HTMLElement): void {
    const { body, footer } = card(container, "添加模型", "粘贴任意服务商的 API Key，自动识别、验证并启用推荐模型。");
    const row = body.createDiv({ cls: "qa-keyrow" });
    const input = row.createEl("input", { type: "password", cls: "qa-keyinput", attr: { "aria-label": "API Key", placeholder: "sk-…、AIza…、gsk_…", autocomplete: "off", spellcheck: "false" } });
    input.value = this.pendingKey;
    const connect = row.createEl("button", { cls: "mod-cta", text: "连接" });
    const run = () => { this.pendingKey = input.value.trim(); void this.start(); };
    connect.addEventListener("click", run);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); run(); } });
    input.addEventListener("input", () => { this.pendingKey = input.value.trim(); });
    // Pasting is the whole flow: the value lands after the paste event, then detection starts.
    input.addEventListener("paste", () => window.setTimeout(run, 0));

    if (this.custom) {
      const panel = body.createDiv({ cls: "qa-custom" });
      const name = panel.createEl("input", { type: "text", attr: { "aria-label": "名称", placeholder: "名称，例如 我的中转站" } });
      name.value = this.customName;
      name.addEventListener("input", () => { this.customName = name.value.trim(); });
      const seg = panel.createDiv({ cls: "qa-segments", attr: { role: "radiogroup", "aria-label": "接口类型" } });
      for (const [value, label] of [["openai-chat", "OpenAI 兼容"], ["anthropic", "Anthropic 兼容"]] as const) {
        const option = seg.createEl("button", { text: label, attr: { role: "radio", "aria-checked": String(this.customProtocol === value) } });
        option.addEventListener("click", () => { this.customProtocol = value; this.rerender(); });
      }
      const url = panel.createEl("input", { type: "url", attr: { "aria-label": "接口地址", placeholder: this.customProtocol === "anthropic" ? "https://…" : "https://…/v1" } });
      url.value = this.customUrl;
      url.addEventListener("input", () => { this.customUrl = url.value.trim(); });
    }

    const status = body.createDiv({ cls: "qa-result", attr: { role: "status", "aria-live": "polite" } });
    this.renderResult(status);

    const lock = footer.createDiv({ cls: "qa-card-footer-note" });
    setIcon(lock.createSpan({ cls: "qa-inline-icon" }), "lock");
    lock.createSpan({ text: "密钥只保存在本机 SecretStorage" });
    const actions = footer.createDiv({ cls: "qa-card-footer-actions" });
    const other = actions.createEl("button", { cls: "qa-text-button", text: "其他服务商…" });
    other.addEventListener("click", () => new PresetPicker(this.app, (id) => void this.connect(id)).open());
    const toggle = actions.createEl("button", { cls: "qa-text-button", text: this.custom ? "收起自定义地址" : "中转站 / 自定义地址" });
    toggle.setAttribute("aria-expanded", String(this.custom));
    toggle.addEventListener("click", () => { this.custom = !this.custom; this.result = null; this.rerender(); });
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
      more.addEventListener("click", () => new PresetPicker(this.app, (id) => void this.connect(id)).open());
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
      this.result = { state: "ok", icon: preset.icon, title: `已连接 ${providerLabel(provider)}`, detail: `已验证 · ${models.length} 个模型${provider.model ? ` · 默认 ${provider.model}` : ""}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.result = { state: "error", icon: preset.icon, title: `${label} 验证失败`, detail: /[(（](401|403)[)）]/.test(message) ? "密钥无效或没有权限。如果选错了服务商，重新粘贴后换一家。" : message };
    }
    this.rerender();
  }

  private renderConnected(container: HTMLElement): void {
    const providers = this.settings.providers;
    const agents = Platform.isDesktopApp ? this.plugin.backendService.getDetections() : [];
    const ready = agents.filter((agent) => agent.callable);
    const { body, footer } = card(container, "已连接", "点击一行查看模型、更换密钥或移除。");
    const list = body.createDiv({ cls: "qa-list" });
    if (!providers.length && !ready.length) list.createDiv({ cls: "qa-list-empty", text: Platform.isDesktopApp && !agents.length ? "正在检测本机 Agent…" : "还没有连接。在上方粘贴一个 API Key 开始。" });
    for (const provider of providers) {
      const key = this.secret(provider);
      const ok = Boolean(key) || permitsEmptyKey(provider);
      const enabled = new Set([...(provider.enabledModels ?? []), ...(provider.model ? [provider.model] : [])]).size;
      this.row(list, providerIcon(provider), "boxes", providerLabel(provider), `${enabled} 个模型已启用 · ${providerHost(provider)}`, ok ? "ok" : "error",
        () => new ProviderModal(this.app, this.plugin, provider.id, this.rerender).open());
    }
    for (const agent of ready) {
      this.row(list, agentIconKey(agent.id), "bot", agent.label, [agent.version, nativeTransportLabel(agent.id) || "CLI"].filter(Boolean).join(" · "), "ok",
        () => new AgentModal(this.app, this.plugin, agent).open());
    }
    const missing = agents.filter((agent) => !agent.callable);
    footer.createDiv({ cls: "qa-card-footer-note", text: missing.length ? `本机未找到：${missing.map((agent) => agent.label).join("、")}` : Platform.isDesktopApp ? "本地 Agent 沿用各自的登录" : "手机上只使用模型 API" });
    if (Platform.isDesktopApp) {
      const redetect = footer.createDiv({ cls: "qa-card-footer-actions" }).createEl("button", { cls: "qa-text-button", text: this.detecting ? "检测中…" : "重新检测" });
      redetect.disabled = this.detecting;
      redetect.addEventListener("click", () => void this.detect());
      if (!agents.length && !this.detecting) void this.detect();
    }
  }

  private async detect(): Promise<void> {
    if (this.detecting) return;
    this.detecting = true;
    try { await this.plugin.refreshIntegrations(); } finally { this.detecting = false; this.rerender(); }
  }

  private row(list: HTMLElement, icon: string | undefined, fallback: string, name: string, sub: string, state: "ok" | "error", open: () => void): void {
    const row = list.createEl("button", { cls: "qa-list-row" });
    brand(row, icon, fallback);
    const text = row.createDiv({ cls: "qa-list-text" });
    text.createDiv({ cls: "qa-list-name", text: name });
    text.createDiv({ cls: "qa-list-sub", text: sub });
    dot(row, state);
    setIcon(row.createSpan({ cls: "qa-list-chevron" }), "chevron-right");
    row.addEventListener("click", open);
  }
}

/** One provider: key, searchable model switches, default model, endpoint, removal. */
class ProviderModal extends Modal {
  private query = "";
  private changingKey = false;
  private confirmRemove = false;
  private busy = "";
  private error = "";

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

    // Key
    const keySection = contentEl.createDiv({ cls: "qa-section" });
    keySection.createEl("h4", { text: "API Key" });
    const key = this.app.secretStorage.getSecret(provider.secretId) ?? "";
    const keyRow = keySection.createDiv({ cls: "qa-keyrow" });
    if (this.changingKey) {
      const input = keyRow.createEl("input", { type: "password", cls: "qa-keyinput", attr: { "aria-label": "新的 API Key", placeholder: "粘贴新的密钥", autocomplete: "off" } });
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
    head.createEl("h4", { text: `模型 · 已启用 ${enabled.size}` });
    const refresh = head.createEl("button", { cls: "qa-text-button", text: this.busy === "models" ? "获取中…" : "刷新列表" });
    refresh.disabled = this.busy === "models";
    refresh.addEventListener("click", async () => {
      this.busy = "models"; this.draw();
      try {
        const models = await listModelsFor(provider, key);
        await this.save({ ...provider, models, fetchedAt: Date.now() });
      } catch (error) { new Notice(error instanceof Error ? error.message : "获取模型失败"); }
      this.busy = ""; this.draw();
    });
    const search = modelSection.createEl("input", { type: "search", cls: "qa-model-search", attr: { "aria-label": "搜索模型", placeholder: all.length ? `搜索 ${all.length} 个模型` : "没有模型列表，可在下方手动添加" } });
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
        if (provider.model === id) name.createSpan({ cls: "qa-pill is-strong", text: "默认" });
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
          const makeDefault = row.createEl("button", { cls: "qa-text-button", text: "设为默认" });
          makeDefault.addEventListener("click", async () => { await this.save({ ...provider, model: id }); this.draw(); });
        }
      }
      if (shown.length > 200) list.createDiv({ cls: "qa-list-empty", text: `还有 ${shown.length - 200} 个，请搜索` });
      if (!shown.length) list.createDiv({ cls: "qa-list-empty", text: q ? "没有匹配的模型" : "还没有模型。点“刷新列表”，或手动添加模型 ID。" });
    };
    search.addEventListener("input", () => { this.query = search.value; drawList(); });
    drawList();
    const add = modelSection.createEl("input", { type: "text", cls: "qa-model-add", attr: { "aria-label": "手动添加模型 ID", placeholder: "手动添加模型 ID，回车确认" } });
    add.addEventListener("keydown", async (event) => {
      const id = add.value.trim();
      if (event.key !== "Enter" || event.isComposing || !id) return;
      await this.save({ ...provider, enabledModels: [...(provider.enabledModels ?? []).filter((item) => item !== id), id], model: provider.model || id });
      this.draw();
    });

    // Endpoint
    const advanced = contentEl.createEl("details", { cls: "qa-section qa-advanced" });
    advanced.createEl("summary", { text: `接口地址 · ${providerHost(provider)}` });
    if (provider.provider === "custom") {
      const seg = advanced.createDiv({ cls: "qa-segments", attr: { role: "radiogroup", "aria-label": "接口类型" } });
      for (const [value, label] of [["openai-chat", "OpenAI 兼容"], ["anthropic", "Anthropic 兼容"]] as const) {
        const option = seg.createEl("button", { text: label, attr: { role: "radio", "aria-checked": String(apiProtocol(provider) === value) } });
        option.addEventListener("click", async () => { await this.save({ ...provider, protocol: value }); this.draw(); });
      }
    }
    const url = advanced.createEl("input", { type: "url", attr: { "aria-label": "接口地址" } });
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
}

/** A local agent: read-only facts; its login and models belong to the agent itself. */
class AgentModal extends Modal {
  constructor(app: App, private readonly plugin: QiaomuAgentPlugin, private readonly agent: CliDetection) { super(app); }
  override onOpen(): void {
    this.modalEl.addClass("qa-provider-modal");
    this.titleEl.empty();
    this.titleEl.addClass("qa-modal-title");
    brand(this.titleEl, agentIconKey(this.agent.id), "bot", 22);
    this.titleEl.createSpan({ text: this.agent.label });
    const { contentEl } = this;
    const facts = contentEl.createDiv({ cls: "qa-section qa-facts" });
    for (const [name, value] of [["版本", this.agent.version ?? "未知"], ["连接方式", nativeTransportLabel(this.agent.id) || "命令行"], ["位置", this.agent.path ?? ""]] as const) {
      const row = facts.createDiv({ cls: "qa-fact" });
      row.createSpan({ cls: "qa-fact-name", text: name });
      row.createSpan({ cls: "qa-fact-value", text: value });
    }
    const models = this.plugin.settings.agentModelCache[this.agent.id]?.models ?? [];
    const section = contentEl.createDiv({ cls: "qa-section" });
    section.createEl("h4", { text: models.length ? `模型 · ${models.length}` : "模型" });
    if (models.length) {
      const list = section.createDiv({ cls: "qa-switch-list" });
      for (const model of models.slice(0, 100)) {
        const row = list.createDiv({ cls: "qa-switch-row" });
        const text = row.createDiv({ cls: "qa-switch-text" });
        text.createDiv({ cls: "qa-switch-name", text: model.name });
        if (model.name !== model.id) text.createDiv({ cls: "qa-switch-id", text: model.id });
      }
    } else section.createDiv({ cls: "qa-card-desc", text: "在输入框的模型选择器里选中这个 Agent，即可获取它的模型列表。" });
    contentEl.createDiv({ cls: "qa-card-desc", text: `登录、密钥和默认模型由 ${this.agent.label} 自己管理。` });
    const footer = contentEl.createDiv({ cls: "qa-modal-footer" });
    footer.createEl("button", { cls: "mod-cta", text: "完成" }).addEventListener("click", () => this.close());
  }
  override onClose(): void { this.contentEl.empty(); }
}
