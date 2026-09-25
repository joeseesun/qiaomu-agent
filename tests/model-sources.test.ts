import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/defaults";
import { activeProvider, agentShown, chooseModel, connectProvider, DEFAULT_VISIBLE_AGENT_IDS, exposedModels, maskKey, migrateProviders, newProvider, removeProvider, upsertProvider, visibleAgentModels } from "../src/services/model-sources";
import type { QiaomuSettings } from "../src/types";

function fresh(): QiaomuSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("model providers", () => {
  it("shows every discovered agent by default while keeping Pi's catalog opt-in", () => {
    const settings = normalizeSettings({});
    expect(DEFAULT_VISIBLE_AGENT_IDS).toHaveLength(7);
    expect(agentShown(settings, "codex")).toBe(true);
    expect(agentShown(settings, "grok")).toBe(true);
    expect(visibleAgentModels(settings, "pi", [{ id: "anthropic/claude", name: "Claude", efforts: [] }]).models).toEqual([]);
    settings.agentVisibility.grok = false;
    expect(agentShown(normalizeSettings(settings), "grok")).toBe(false);
  });
  it("migrates the old single connection and per-provider profiles into a list", () => {
    const settings = normalizeSettings({
      api: { provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", secretId: "s-deepseek" },
      apiProfiles: { mimo: { provider: "mimo", baseUrl: "https://api.xiaomimimo.com/v1", model: "", secretId: "s-mimo" }, deepseek: { provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "old", secretId: "s-deepseek" } },
    });
    expect(settings.providers.map((p) => p.id)).toEqual(["mimo", "deepseek"]);
    expect(activeProvider(settings)?.id).toBe("deepseek");
    expect(normalizeSettings({}).providers).toEqual([]);
    expect(migrateProviders({ providers: [{ id: "x", provider: "openai", secretId: "k", baseUrl: "u", model: "m" }] }, DEFAULT_SETTINGS.api)).toHaveLength(1);
  });

  it("masks keys without revealing more than eight characters", () => {
    expect(maskKey("sk-abcdefghijklmn1234")).toBe("sk-a…1234");
    expect(maskKey("short")).toBe("••••");
    expect(maskKey("")).toBe("");
  });

  it("exposes only enabled models, including manually added IDs", () => {
    const provider = { ...newProvider("deepseek", []), model: "manual", models: [{ id: "a", name: "A", efforts: [] }, { id: "b", name: "B", efforts: [] }] };
    expect(exposedModels(provider).map((m) => m.id)).toEqual([]);
    expect(exposedModels({ ...provider, enabledModels: ["b", "typed"] }).map((m) => m.id)).toEqual(["b", "typed"]);
  });

  it("keeps per-agent visibility and manual IDs after reload", () => {
    const settings = normalizeSettings({ agentEnabledModels: { kimi: ["", "k3"] }, agentCustomModels: { kimi: ["custom-x"] } });
    const listed = visibleAgentModels(settings, "kimi", [{ id: "k3", name: "K3", efforts: [] }, { id: "k2", name: "K2", efforts: [] }]);
    expect(listed.models.map((model) => model.id)).toEqual(["k3"]);
    expect(listed.showDefault).toBe(true);
    settings.agentEnabledModels.kimi = ["custom-x"];
    expect(visibleAgentModels(settings, "kimi", []).models.map((model) => model.id)).toEqual(["custom-x"]);
    expect(visibleAgentModels(settings, "kimi", []).showDefault).toBe(false);
  });

  it("gives never-curated migrated providers their recommended models", () => {
    const settings = normalizeSettings({ providers: [{ id: "deepseek", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "", secretId: "s",
      models: [{ id: "deepseek-chat", name: "c", efforts: [] }, { id: "deepseek-reasoner", name: "r", efforts: [] }] }] });
    expect(settings.providers[0]!.enabledModels).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("keeps an explicitly empty model list and per-model options after reload", () => {
    const provider = { ...newProvider("deepseek", []), enabledModels: [], showInPicker: false,
      modelOptions: { "deepseek-chat": { temperature: 0.7, maxOutputTokens: 4096 } } };
    const restored = normalizeSettings({ providers: [provider] }).providers[0]!;
    expect(restored.enabledModels).toEqual([]);
    expect(restored.showInPicker).toBe(false);
    expect(restored.modelOptions?.["deepseek-chat"]).toEqual({ temperature: 0.7, maxOutputTokens: 4096 });
  });

  it("restores model picker visibility and readable chat typography settings", () => {
    const settings = normalizeSettings({ hiddenAgents: ["codex"], chatFontFamily: "obsidian", chatFontSize: 18, codeFontSize: 15 });
    expect(settings.hiddenAgents).toEqual(["codex"]);
    expect(settings.chatFontFamily).toBe("obsidian");
    expect(settings.chatFontSize).toBe(18);
    expect(settings.codeFontSize).toBe(15);
    expect(normalizeSettings({ chatFontSize: 99, codeFontSize: 3 }).chatFontSize).toBe(15);
  });

  it("connects with one key sent only to the chosen provider, enabling recommended models", async () => {
    const settings = fresh();
    const secrets = new Map<string, string>();
    const listModels = vi.fn(async (connection: { provider: string }, _key: string) => connection.provider === "anthropic"
      ? [{ id: "claude-sonnet-5", name: "Sonnet", efforts: [] }, { id: "claude-opus-5-5", name: "Opus", efforts: [] }, { id: "claude-haiku-4-5", name: "Haiku", efforts: [] }]
      : []);
    const deps = { listModels, getSecret: (id: string) => secrets.get(id) ?? null, setSecret: (id: string, value: string) => { if (value) secrets.set(id, value); else secrets.delete(id); } };
    const { provider } = await connectProvider(settings, "anthropic", " sk-ant-key ", deps);
    expect(listModels).toHaveBeenCalledOnce();
    expect(listModels.mock.calls[0]![0]).toMatchObject({ provider: "anthropic" });
    expect(listModels.mock.calls[0]![1]).toBe("sk-ant-key");
    expect(provider.enabledModels).toEqual(["claude-opus-5-5", "claude-sonnet-5", "claude-haiku-4-5"]);
    expect(provider.model).toBe("claude-opus-5-5");
    expect(secrets.get(provider.secretId)).toBe("sk-ant-key");
    expect(settings.api.provider).toBe("anthropic");

    // Re-pasting a new key for the same vendor replaces the old key instead of adding a duplicate.
    await connectProvider(settings, "anthropic", "sk-ant-new", deps);
    expect(settings.providers).toHaveLength(1);
    expect([...secrets.values()]).toEqual(["sk-ant-new"]);
  });

  it("saves nothing when verification fails", async () => {
    const settings = fresh();
    const secrets = new Map<string, string>();
    const deps = { listModels: async () => { throw new Error("401"); }, getSecret: () => null, setSecret: (id: string, value: string) => { secrets.set(id, value); } };
    await expect(connectProvider(settings, "deepseek", "sk-bad", deps)).rejects.toThrow("401");
    expect(settings.providers).toEqual([]);
    expect(secrets.size).toBe(0);
  });

  it("gives duplicate presets unique ids and isolated secrets", () => {
    const first = newProvider("openrouter", []);
    const second = newProvider("openrouter", [first]);
    expect(second.id).toBe("openrouter-2");
    expect(second.secretId).not.toBe(first.secretId);
    expect(newProvider("custom", []).id).toMatch(/^custom-/);
  });

  it("choosing a model switches the source and remembers it", () => {
    const settings = fresh();
    upsertProvider(settings, { ...newProvider("deepseek", []), model: "deepseek-chat" });
    upsertProvider(settings, newProvider("moonshot", settings.providers));
    chooseModel(settings, "api:moonshot", "kimi-k3");
    expect(settings.backendKind).toBe("api");
    expect(settings.api.provider).toBe("moonshot");
    expect(settings.api.model).toBe("kimi-k3");
    chooseModel(settings, "cli:codex", "gpt-6");
    expect(settings.backendKind).toBe("cli");
    expect(settings.preferredCli).toBe("codex");
    expect(settings.modelSelections?.["cli:codex"]?.model).toBe("gpt-6");
    expect(settings.recentModels).toEqual([{ source: "cli:codex", model: "gpt-6" }, { source: "api:moonshot", model: "kimi-k3" }]);
    chooseModel(settings, "api:moonshot", "kimi-k3");
    expect(settings.recentModels[0]).toEqual({ source: "api:moonshot", model: "kimi-k3" });
    expect(settings.recentModels).toHaveLength(2);
  });

  it("removing the active provider falls back to another and forgets its recents", () => {
    const settings = fresh();
    upsertProvider(settings, newProvider("deepseek", []));
    upsertProvider(settings, newProvider("moonshot", settings.providers));
    chooseModel(settings, "api:moonshot", "kimi-k3");
    removeProvider(settings, "moonshot");
    expect(settings.api.provider).toBe("deepseek");
    expect(settings.recentModels).toEqual([]);
    removeProvider(settings, "deepseek");
    expect(settings.providers).toEqual([]);
    expect(settings.backendKind).toBe("auto");
    expect(() => chooseModel(settings, "api:deepseek", "x")).toThrow("已被移除");
  });
});
