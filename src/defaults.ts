import type { QiaomuSettings } from "./types";

export const DEFAULT_SYSTEM_PROMPT = `你是用户 Obsidian 知识库中的协作助手。

遵守以下原则：
1. 优先理解当前笔记与用户明确提供的上下文。
2. 引用库内文件时使用 [[路径/文件名.md]]，让结果可以在 Obsidian 中打开。
3. 修改文件前说明目标和意图；不要覆盖对话开始后发生的新编辑。
4. 保留用户原有 Markdown、YAML frontmatter、内部链接和中文排版风格。
5. 回答简洁、具体，可执行。`;

export const DEFAULT_SETTINGS: QiaomuSettings = {
  schemaVersion: 1,
  backendKind: "auto",
  preferredCli: "",
  permissionMode: "plan",
  api: {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    secretId: "qiaomu-agent-api-key",
  },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  quickPrompts: ["总结当前笔记", "找出相关笔记", "把这段内容整理得更清楚"],
  autoAttachActiveNote: true,
  skillDirectories: [],
  mcpConfig: "{\n  \"mcpServers\": {}\n}",
  lastConversation: [],
};

export function normalizeSettings(raw: unknown): QiaomuSettings {
  const data = raw && typeof raw === "object" ? (raw as Partial<QiaomuSettings>) : {};
  const api = data.api && typeof data.api === "object" ? data.api : DEFAULT_SETTINGS.api;

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    schemaVersion: 1,
    api: { ...DEFAULT_SETTINGS.api, ...api },
    quickPrompts: Array.isArray(data.quickPrompts)
      ? data.quickPrompts.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [...DEFAULT_SETTINGS.quickPrompts],
    skillDirectories: Array.isArray(data.skillDirectories)
      ? data.skillDirectories.filter((item): item is string => typeof item === "string")
      : [],
    lastConversation: Array.isArray(data.lastConversation)
      ? data.lastConversation.filter((item) => item && typeof item.content === "string").slice(-80)
      : [],
  };
}
