import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/defaults";

describe("normalizeSettings", () => {
  it("fills defaults and limits persisted history", () => {
    const result = normalizeSettings({
      quickPrompts: ["one", 2, "two"],
      lastConversation: [
        { id: "1", role: "user", content: "hello", createdAt: 1 },
        { broken: true },
      ],
    });
    expect(result.quickPrompts).toEqual(["one", "two"]);
    expect(result.lastConversation).toHaveLength(1);
    expect(result.api.baseUrl).toBe(DEFAULT_SETTINGS.api.baseUrl);
  });
});

