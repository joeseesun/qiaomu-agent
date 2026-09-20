import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiBackend } from "../src/services/api-backend";
import { DEFAULT_SETTINGS } from "../src/defaults";

afterEach(() => vi.unstubAllGlobals());
describe("API discovery transport", () => {
  it.each([
    ["anthropic", "x-api-key"], ["google", "x-goog-api-key"], ["openai-chat", "Authorization"], ["openai-responses", "Authorization"],
  ] as const)("uses %s authentication for custom providers", async (protocol, header) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "example-model" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const backend = new ApiBackend({ ...DEFAULT_SETTINGS.api, provider: "custom", protocol }, "test-secret");
    expect((await backend.listModels())[0]?.id).toBe("example-model");
    expect(fetcher.mock.calls[0]?.[1].headers[header]).toContain("test-secret");
    expect(fetcher.mock.calls[0]?.[1].redirect).toBe("error");
  });
  it("snapshots config and refuses to send secrets over remote HTTP", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const connection = { ...DEFAULT_SETTINGS.api, baseUrl: "http://example.com/v1" };
    const backend = new ApiBackend(connection, "secret");
    connection.baseUrl = "https://example.com/v1";
    await expect(backend.listModels()).rejects.toThrow("HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
