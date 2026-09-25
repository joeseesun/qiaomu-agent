import { describe, expect, it } from "vitest";
import { checkImageInput, compactTokens, reportedCapabilities, resolveModel } from "../src/services/model-capabilities";
import { acpContextUsage, apiContextUsage, codexContextUsage, contextUsage } from "../src/services/context-usage";
import { openRouterReasoning, withBodyExtras } from "../src/services/api-backend";
import { fromStoredMessage, toStoredMessage } from "../src/services/chat-transport";
import { normalizeSettings } from "../src/defaults";

describe("reported model capabilities", () => {
  it("reads OpenRouter's context length, image input and reasoning support", () => {
    expect(reportedCapabilities({ id: "anthropic/claude-sonnet-5", context_length: 1_000_000, architecture: { input_modalities: ["text", "image"] }, supported_parameters: ["tools", "reasoning"] }))
      .toEqual({ contextWindow: 1_000_000, vision: true, reasoning: true });
    expect(reportedCapabilities({ id: "deepseek/deepseek-chat", context_length: 128_000, architecture: { input_modalities: ["text"] }, supported_parameters: ["tools"] }))
      .toEqual({ contextWindow: 128_000, vision: false, reasoning: false });
  });

  it("reads Gemini's input limit and thinking flag", () => {
    expect(reportedCapabilities({ name: "models/gemini-3-pro", inputTokenLimit: 1_048_576, thinking: true })).toEqual({ contextWindow: 1_048_576, reasoning: true });
  });

  it("leaves unstated capabilities unknown", () => {
    expect(reportedCapabilities({ id: "some-model", context_length: -1 })).toEqual({});
  });
});

describe("resolved model", () => {
  const provider = { provider: "openrouter", models: [{ id: "a", name: "A", efforts: [], contextWindow: 200_000, vision: false, reasoning: false }] };

  it("uses what the vendor reported until the user overrides it", () => {
    expect(resolveModel(provider, "a")).toEqual({ contextWindow: 200_000, vision: false, efforts: [] });
    expect(resolveModel({ ...provider, modelOptions: { a: { contextWindow: 64_000, vision: true, reasoning: true } } }, "a"))
      .toEqual({ contextWindow: 64_000, vision: true, efforts: ["low", "medium", "high"] });
  });

  it("keeps built-in effort levels and lets the user switch thinking off", () => {
    expect(resolveModel({ provider: "google" }, "gemini-3-pro").efforts).toEqual(["low", "high"]);
    expect(resolveModel({ provider: "openai", modelOptions: { "gpt-5.5": { reasoning: false } } }, "gpt-5.5").efforts).toEqual([]);
    expect(resolveModel({ provider: "custom" }, "unknown").efforts).toEqual([]);
  });

  it("blocks images only for models known not to read them", () => {
    const image = [{ id: "1", name: "a.png", mediaType: "image/png", size: 1 }];
    expect(() => checkImageInput({ vision: false, efforts: [] }, image)).toThrow("不支持图片输入");
    expect(() => checkImageInput({ efforts: [] }, image)).not.toThrow();
    expect(() => checkImageInput({ vision: false, efforts: [] }, [{ id: "2", name: "a.md", mediaType: "text/markdown", size: 1 }])).not.toThrow();
  });

  it("formats token counts compactly", () => {
    expect([950, 9_500, 53_000, 128_000, 1_048_576].map(compactTokens)).toEqual(["950", "9.5K", "53K", "128K", "1M"]);
  });

  it("keeps valid per-model options and drops malformed ones", () => {
    const settings = normalizeSettings({ providers: [{ id: "x", provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "a", secretId: "k", enabledModels: ["a"], modelOptions: { a: { contextWindow: 64_000, reasoning: true, vision: "yes" } } }] });
    expect(settings.providers[0]?.modelOptions?.a).toEqual({ contextWindow: 64_000, reasoning: true });
  });
});

describe("context usage", () => {
  it("parses Codex, ACP and API reports and ignores missing window sizes", () => {
    expect(codexContextUsage({ threadId: "t", tokenUsage: { last: { totalTokens: 53_000 }, total: { totalTokens: 90_000 }, modelContextWindow: 200_000 } })).toEqual({ used: 53_000, size: 200_000 });
    expect(codexContextUsage({ tokenUsage: { last: { totalTokens: 10 }, modelContextWindow: null } })).toBeNull();
    expect(acpContextUsage({ sessionUpdate: "usage_update", used: 1_000, size: 8_000 })).toEqual({ used: 1_000, size: 8_000 });
    expect(apiContextUsage({ inputTokens: 900, outputTokens: 100 }, 4_000)).toEqual({ used: 1_000, size: 4_000 });
    expect(apiContextUsage({ inputTokens: 900, outputTokens: 100 }, undefined)).toBeNull();
    expect(contextUsage(Number.NaN, 10)).toBeNull();
  });

  it("survives saving and reloading a conversation", () => {
    const stored = toStoredMessage(fromStoredMessage({ id: "m", role: "assistant", content: "hi", createdAt: 1, usage: { used: 5, size: 10 } }));
    expect(stored.usage).toEqual({ used: 5, size: 10 });
  });
});

describe("OpenRouter thinking", () => {
  it("adds its reasoning object to the request body only for OpenRouter", () => {
    const extras = openRouterReasoning("openrouter", "openai-chat", "high");
    expect(JSON.parse(withBodyExtras(JSON.stringify({ model: "m" }), extras) as string)).toEqual({ model: "m", reasoning: { effort: "high" } });
    expect(openRouterReasoning("deepseek", "openai-chat", "high")).toBeNull();
    expect(openRouterReasoning("openrouter", "openai-chat", undefined)).toBeNull();
    expect(withBodyExtras("not json", { a: 1 })).toBe("not json");
  });
});

describe("API base URL", () => {
  it("adds the version segment Anthropic-compatible services are often entered without", async () => {
    const { apiBaseUrl } = await import("../src/services/api-providers");
    const anthropic = { provider: "custom", protocol: "anthropic" as const, model: "m", secretId: "s" };
    expect(apiBaseUrl({ ...anthropic, baseUrl: "https://relay.example.com/" })).toBe("https://relay.example.com/v1");
    expect(apiBaseUrl({ ...anthropic, baseUrl: "https://api.anthropic.com/v1" })).toBe("https://api.anthropic.com/v1");
    expect(apiBaseUrl({ ...anthropic, baseUrl: "https://relay.example.com/claude/v1" })).toBe("https://relay.example.com/claude/v1");
    expect(apiBaseUrl({ ...anthropic, protocol: "openai-chat", baseUrl: "https://relay.example.com" })).toBe("https://relay.example.com");
  });
});
