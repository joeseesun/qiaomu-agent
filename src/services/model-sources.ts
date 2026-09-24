import type { ApiConnection, ModelChoice, ProviderConfig, QiaomuSettings } from "../types";
import { API_PROVIDERS, apiProtocol } from "./api-providers";
import { recommendedModels } from "./key-detection";

/** A place models come from: a local agent (`cli:<id>`) or a configured provider (`api:<providerId>`). */
export interface ModelSource {
  key: string;
  kind: "agent" | "api";
  label: string;
  icon?: string;
  models: ModelChoice[];
  loading?: boolean;
  error?: string;
  /** Local agents may not have reported models yet. */
  loaded: boolean;
}

export const RECENT_LIMIT = 8;

export function providerLabel(provider: ProviderConfig): string {
  return provider.name?.trim() || API_PROVIDERS[provider.provider]?.label || provider.provider;
}

export function providerIcon(provider: ProviderConfig): string | undefined {
  return API_PROVIDERS[provider.provider]?.icon;
}

export function providerHost(provider: Pick<ApiConnection, "baseUrl">): string {
  try { return new URL(provider.baseUrl).host; } catch { return provider.baseUrl || "未设置地址"; }
}

/** `sk-abcdef…1234` → `sk-a…1234`; never reveals more than 8 characters. */
export function maskKey(key: string): string {
  const value = key.trim();
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Models the picker offers: exactly the enabled ones (explicit list), plus the configured default. */
export function exposedModels(provider: ProviderConfig): ModelChoice[] {
  const all = provider.models ?? [];
  const list = (provider.enabledModels ?? []).map((id) => all.find((model) => model.id === id) ?? { id, name: id, efforts: [] });
  if (provider.model && !list.some((model) => model.id === provider.model)) list.unshift({ id: provider.model, name: provider.model, efforts: [] });
  return list;
}

export interface ConnectDeps {
  listModels: (connection: ApiConnection, key: string) => Promise<ModelChoice[]>;
  getSecret: (id: string) => string | null;
  setSecret: (id: string, value: string) => void;
}

/**
 * Connects one provider with a key: verifies it by listing models from that provider only,
 * enables the recommended models, and saves. On failure nothing is saved and the key is discarded.
 * An existing provider of the same preset and endpoint gets its key replaced instead of a duplicate.
 */
export async function connectProvider(
  settings: QiaomuSettings,
  presetId: string,
  key: string,
  deps: ConnectDeps,
  endpoint: { baseUrl?: string; protocol?: ApiConnection["protocol"]; name?: string } = {},
): Promise<{ provider: ProviderConfig; models: ModelChoice[] }> {
  const fresh = newProvider(presetId, settings.providers);
  const baseUrl = endpoint.baseUrl ?? fresh.baseUrl;
  const existing = settings.providers.find((item) => item.provider === presetId && item.baseUrl === baseUrl);
  const draft: ProviderConfig = existing
    ? { ...existing, protocol: endpoint.protocol ?? existing.protocol, secretId: `qiaomu-agent-${existing.id}-${crypto.randomUUID()}` }
    : { ...fresh, baseUrl, ...(endpoint.protocol ? { protocol: endpoint.protocol } : {}), ...(endpoint.name ? { name: endpoint.name } : {}) };
  const models = await deps.listModels(draft, key.trim());
  deps.setSecret(draft.secretId, key.trim());
  const recommended = recommendedModels(presetId, models);
  const provider: ProviderConfig = {
    ...draft,
    models,
    fetchedAt: Date.now(),
    enabledModels: existing?.enabledModels?.length ? existing.enabledModels : recommended,
    model: existing?.model && models.some((model) => model.id === existing.model) ? existing.model : recommended[0] ?? draft.model,
  };
  if (existing) deps.setSecret(existing.secretId, "");
  upsertProvider(settings, provider);
  return { provider, models };
}

function connectionOf(provider: ProviderConfig): ApiConnection {
  return { provider: provider.provider, protocol: provider.protocol ?? apiProtocol(provider), baseUrl: provider.baseUrl, model: provider.model, secretId: provider.secretId };
}

function sameEndpoint(a: ApiConnection, b: ApiConnection): boolean {
  return a.provider === b.provider && a.baseUrl === b.baseUrl && a.secretId === b.secretId;
}

/** Builds the provider list from the pre-list settings shape (`api` + `apiProfiles`). */
export function migrateProviders(raw: Partial<QiaomuSettings>, api: ApiConnection): ProviderConfig[] {
  if (Array.isArray(raw.providers)) {
    return raw.providers
      .filter((item): item is ProviderConfig => Boolean(item && typeof item.id === "string" && typeof item.provider === "string" && typeof item.secretId === "string"))
      .map((item) => ({ ...item, baseUrl: typeof item.baseUrl === "string" ? item.baseUrl : "", model: typeof item.model === "string" ? item.model : "" }));
  }
  const connections = [...Object.values(raw.apiProfiles ?? {}), api]
    .filter((item): item is ApiConnection => Boolean(item && typeof item.provider === "string" && typeof item.secretId === "string"));
  const providers: ProviderConfig[] = [];
  for (const connection of connections) {
    if (providers.some((item) => sameEndpoint(item, connection))) continue;
    const id = providers.some((item) => item.id === connection.provider) || connection.provider === "custom"
      ? `${connection.provider}-${providers.length + 1}`
      : connection.provider;
    providers.push({ ...connection, id });
  }
  return providers;
}

export function findProvider(settings: QiaomuSettings, id: string): ProviderConfig | undefined {
  return settings.providers.find((item) => item.id === id);
}

/** The provider `settings.api` currently points at, if it is in the list. */
export function activeProvider(settings: QiaomuSettings): ProviderConfig | undefined {
  return settings.providers.find((item) => sameEndpoint(item, settings.api));
}

export function newProvider(presetId: string, existing: ProviderConfig[]): ProviderConfig {
  const preset = API_PROVIDERS[presetId] ?? API_PROVIDERS.custom!;
  const taken = new Set(existing.map((item) => item.id));
  let id = presetId === "custom" ? `custom-${crypto.randomUUID().slice(0, 8)}` : presetId;
  for (let n = 2; taken.has(id); n++) id = `${presetId}-${n}`;
  return { id, provider: presetId, baseUrl: preset.baseUrl, protocol: preset.protocol, model: "", secretId: `qiaomu-agent-${id}-${crypto.randomUUID()}` };
}

export function upsertProvider(settings: QiaomuSettings, provider: ProviderConfig): void {
  const index = settings.providers.findIndex((item) => item.id === provider.id);
  const wasActive = index >= 0 && sameEndpoint(settings.providers[index]!, settings.api);
  if (index >= 0) settings.providers[index] = provider; else settings.providers.push(provider);
  if (wasActive || settings.providers.length === 1) settings.api = connectionOf(provider);
}

export function removeProvider(settings: QiaomuSettings, id: string): void {
  const removed = findProvider(settings, id);
  settings.providers = settings.providers.filter((item) => item.id !== id);
  if (removed && sameEndpoint(removed, settings.api)) {
    const next = settings.providers[0];
    settings.api = next ? connectionOf(next) : { provider: "openai", baseUrl: API_PROVIDERS.openai!.baseUrl, model: "", secretId: `qiaomu-agent-openai-${crypto.randomUUID()}` };
    if (!next && settings.backendKind === "api") settings.backendKind = "auto";
  }
  settings.recentModels = settings.recentModels.filter((item) => item.source !== `api:${id}`);
}

export function rememberRecent(settings: QiaomuSettings, source: string, model: string): void {
  if (!model) return;
  settings.recentModels = [{ source, model }, ...settings.recentModels.filter((item) => !(item.source === source && item.model === model))].slice(0, RECENT_LIMIT);
}

export function apiSelectionKey(connection: ApiConnection): string {
  return `api:${connection.provider}:${connection.baseUrl}`;
}

/**
 * Applies a picker choice: points the chat at the source and records the model.
 * Returns the modelSelections key that now holds the choice.
 */
export function chooseModel(settings: QiaomuSettings, source: string, model: string): string {
  settings.modelSelections ??= {};
  let key: string;
  if (source.startsWith("cli:")) {
    settings.backendKind = "cli";
    settings.preferredCli = source.slice(4);
    key = source;
  } else {
    const provider = findProvider(settings, source.slice(4));
    if (!provider) throw new Error("该服务商已被移除");
    provider.model = model;
    settings.api = connectionOf(provider);
    settings.backendKind = "api";
    key = apiSelectionKey(settings.api);
  }
  const previous = settings.modelSelections[key];
  settings.modelSelections[key] = { model, effort: previous?.model === model ? previous.effort : "" };
  rememberRecent(settings, source, model);
  return key;
}
