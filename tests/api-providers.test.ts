import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/defaults";
import { API_PROVIDERS, apiProtocol, permitsEmptyKey, validateApiUrl } from "../src/services/api-providers";

describe("API provider configuration", () => {
  it("covers requested providers with valid endpoints", () => {
    for (const id of ["openrouter", "siliconflow", "stepfun", "mimo"]) expect(API_PROVIDERS[id]).toBeDefined();
    for (const [id, preset] of Object.entries(API_PROVIDERS)) {
      if (id !== "custom") expect(validateApiUrl(preset.baseUrl)).toBe(preset.baseUrl);
    }
  });
  it("uses native protocols for existing configs and explicit overrides", () => {
    expect(apiProtocol({ ...DEFAULT_SETTINGS.api, provider: "anthropic" })).toBe("anthropic");
    expect(apiProtocol({ ...DEFAULT_SETTINGS.api, provider: "custom", protocol: "google" })).toBe("google");
    expect(apiProtocol({ ...DEFAULT_SETTINGS.api, protocol: "openai-responses" })).toBe("openai-responses");
  });
  it("only allows keyless connections to explicit local presets", () => {
    const connection = { ...DEFAULT_SETTINGS.api, provider: "ollama", baseUrl: "http://localhost:11434/v1" };
    expect(permitsEmptyKey(connection)).toBe(true);
    expect(permitsEmptyKey({ ...connection, baseUrl: "https://example.com/v1" })).toBe(false);
    expect(permitsEmptyKey({ ...connection, provider: "custom" })).toBe(false);
  });
  it.each(["http://example.com/v1", "https://user:secret@example.com/v1", "https://example.com/v1?key=secret", "file:///tmp/api", "https://example.com/#secret"])("rejects unsafe endpoint %s", (url) => {
    expect(() => validateApiUrl(url)).toThrow();
  });
});
