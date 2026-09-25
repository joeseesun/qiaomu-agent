import { describe, expect, it } from "vitest";
import {
  acpLaunch,
  codexGeneratedAttachment,
  acpMcpServers,
  nativeTransportFor,
  nativeTransportLabel,
} from "../src/services/native-agent-backend";

describe("native agent transports", () => {
  it("routes Codex to App Server and supported agents to ACP", () => {
    expect(nativeTransportFor("codex")).toBe("app-server");
    expect(nativeTransportFor("kimi")).toBe("acp");
    expect(nativeTransportFor("qwen")).toBe("acp");
    expect(nativeTransportFor("cursor")).toBe("acp");
    expect(nativeTransportFor("cline")).toBe("acp");
    expect(nativeTransportFor("claude")).toBeNull();
    expect(nativeTransportLabel("codex")).toBe("App Server");
  });

  it("uses the documented ACP launch forms and permission posture", () => {
    expect(acpLaunch("kimi", "plan")).toEqual(["acp"]);
    expect(acpLaunch("opencode", "edit")).toEqual(["acp"]);
    expect(acpLaunch("cursor", "plan")).toEqual(["acp"]);
    expect(acpLaunch("cline", "plan")).toEqual(["--acp"]);
    expect(acpLaunch("qwen", "plan")).toEqual(["--acp", "--approval-mode", "plan"]);
    expect(acpLaunch("gemini", "edit")).toEqual(["--acp", "--approval-mode", "auto_edit"]);
    expect(acpLaunch("gemini", "full")).toEqual(["--acp", "--approval-mode", "auto_edit"]);
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

it("extracts generated images and image-view paths from Codex App Server items", () => {
  expect(codexGeneratedAttachment({ id: "image-1", result: "data:image/png;base64,AQID", savedPath: "/tmp/小狗.png" })).toEqual({
    id: "image-1", name: "小狗.png", mediaType: "image/png", size: 3, base64: "AQID", localPath: "/tmp/小狗.png",
  });
  expect(codexGeneratedAttachment({ id: "view-1", path: "file:///tmp/%E5%B0%8F%E7%8B%97.webp" })).toMatchObject({
    id: "view-1", name: "小狗.webp", mediaType: "image/webp", localPath: "file:///tmp/%E5%B0%8F%E7%8B%97.webp",
  });
  expect(codexGeneratedAttachment({ id: "empty" })).toBeNull();
});
