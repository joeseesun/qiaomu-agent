import { describe, expect, it } from "vitest";
import {
  acpLaunch,
  acpMcpServers,
  nativeTransportFor,
  nativeTransportLabel,
} from "../src/services/native-agent-backend";

describe("native agent transports", () => {
  it("routes Codex to App Server and supported agents to ACP", () => {
    expect(nativeTransportFor("codex")).toBe("app-server");
    expect(nativeTransportFor("kimi")).toBe("acp");
    expect(nativeTransportFor("qwen")).toBe("acp");
    expect(nativeTransportFor("claude")).toBeNull();
    expect(nativeTransportLabel("codex")).toBe("App Server");
  });

  it("uses the documented ACP launch forms and permission posture", () => {
    expect(acpLaunch("kimi", "plan")).toEqual(["acp"]);
    expect(acpLaunch("opencode", "edit")).toEqual(["acp"]);
    expect(acpLaunch("qwen", "plan")).toEqual(["--acp", "--approval-mode", "plan"]);
    expect(acpLaunch("gemini", "edit")).toEqual(["--acp", "--approval-mode", "auto_edit"]);
  });

  it("converts stdio and HTTP MCP servers into ACP descriptors", () => {
    expect(acpMcpServers({
      mcpServers: {
        local: { command: "npx", args: ["-y", "server"], env: { TOKEN: "secret" } },
        remote: { url: "https://example.com/mcp" },
      },
    })).toEqual([
      {
        name: "local",
        command: "npx",
        args: ["-y", "server"],
        env: [{ name: "TOKEN", value: "secret" }],
      },
      { type: "http", name: "remote", url: "https://example.com/mcp", headers: [] },
    ]);
  });
});
