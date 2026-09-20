import type { ChatRequest, CliProfile } from "../types";

function promptWithContext(request: ChatRequest): string {
  const sections: string[] = [];
  if (request.skill) {
    sections.push(
      `<active_skill name="${request.skill.name}" path="${request.skill.path}">\n${request.skill.body}\n</active_skill>`
    );
  }
  if (request.activeFilePath && request.activeFileContent) {
    sections.push(
      `<active_note path="${request.activeFilePath}">\n${request.activeFileContent}\n</active_note>`
    );
  }
  sections.push(request.prompt);
  return sections.join("\n\n");
}

function modelArgs(request: ChatRequest, flag = "--model"): string[] {
  return request.model?.trim() ? [flag, request.model.trim()] : [];
}

export const CLI_PROFILES: CliProfile[] = [
  {
    id: "codex",
    label: "Codex",
    commands: ["codex"],
    versionArgs: ["--version"],
    supportsMcpFile: false,
    buildArgs: (request) => [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      request.permissionMode === "edit" ? "workspace-write" : "read-only",
      ...modelArgs(request, "--model"),
      `${request.systemPrompt}\n\n${promptWithContext(request)}`,
    ],
  },
  {
    id: "claude",
    label: "Claude Code",
    commands: ["claude"],
    versionArgs: ["--version"],
    supportsMcpFile: true,
    mcpFileFlag: "--mcp-config",
    buildArgs: (request, mcpFile) => [
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--permission-mode",
      request.permissionMode === "edit" ? "acceptEdits" : "plan",
      "--append-system-prompt",
      request.systemPrompt,
      ...modelArgs(request),
      ...(mcpFile ? ["--mcp-config", mcpFile, "--strict-mcp-config"] : []),
      promptWithContext(request),
    ],
  },
  {
    id: "kimi",
    label: "Kimi CLI",
    commands: ["kimi", "kimi-cli"],
    versionArgs: ["--version"],
    supportsMcpFile: true,
    mcpFileFlag: "--mcp-config-file",
    buildArgs: (request, mcpFile) => [
      "--print",
      "--output-format",
      "stream-json",
      ...(request.cwd ? ["--work-dir", request.cwd] : []),
      ...(request.permissionMode === "plan" ? ["--plan"] : []),
      ...modelArgs(request),
      ...(mcpFile ? ["--mcp-config-file", mcpFile] : []),
      "--prompt",
      `${request.systemPrompt}\n\n${promptWithContext(request)}`,
    ],
  },
  {
    id: "qwen",
    label: "Qwen Code",
    commands: ["qwen"],
    versionArgs: ["--version"],
    supportsMcpFile: true,
    mcpFileFlag: "--mcp-config",
    buildArgs: (request, mcpFile) => [
      "--output-format",
      "stream-json",
      "--approval-mode",
      request.permissionMode === "edit" ? "auto-edit" : "plan",
      "--system-prompt",
      request.systemPrompt,
      ...modelArgs(request),
      ...(mcpFile ? ["--mcp-config", mcpFile] : []),
      promptWithContext(request),
    ],
  },
  {
    id: "grok",
    label: "Grok CLI",
    commands: ["grok"],
    versionArgs: ["version"],
    supportsMcpFile: false,
    buildArgs: (request) => [
      "--single",
      promptWithContext(request),
      "--output-format",
      "streaming-messages-json",
      "--include-partial-messages",
      "--permission-mode",
      request.permissionMode === "edit" ? "acceptEdits" : "plan",
      "--system-prompt",
      request.systemPrompt,
      ...modelArgs(request),
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    commands: ["opencode"],
    versionArgs: ["--version"],
    supportsMcpFile: false,
    buildArgs: (request) => [
      "run",
      "--format",
      "json",
      ...(request.permissionMode === "edit" ? ["--auto"] : []),
      ...modelArgs(request),
      `${request.systemPrompt}\n\n${promptWithContext(request)}`,
    ],
  },
  {
    id: "pi",
    label: "Pi",
    commands: ["pi"],
    versionArgs: ["--version"],
    supportsMcpFile: false,
    buildArgs: (request) => [
      "--print",
      "--mode",
      "json",
      "--no-session",
      ...(request.permissionMode === "plan" ? ["--no-tools"] : []),
      "--append-system-prompt",
      request.systemPrompt,
      ...modelArgs(request),
      promptWithContext(request),
    ],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    commands: ["gemini"],
    versionArgs: ["--version"],
    supportsMcpFile: false,
    buildArgs: (request) => [
      "--prompt",
      promptWithContext(request),
      "--output-format",
      "stream-json",
      "--approval-mode",
      request.permissionMode === "edit" ? "auto_edit" : "plan",
      "--system-prompt",
      request.systemPrompt,
      ...modelArgs(request),
    ],
  },
];

export function getCliProfile(id: string): CliProfile | undefined {
  return CLI_PROFILES.find((profile) => profile.id === id);
}
