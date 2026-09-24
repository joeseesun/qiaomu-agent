import type { ModelChoice, QiaomuSettings } from "./types";
import { migrateProviders } from "./services/model-sources";
import { recommendedModels } from "./services/key-detection";

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
  useObsidianCli: true,
  skillDirectories: [],
  mcpConfig: "{\n  \"mcpServers\": {}\n}",
  lastConversation: [],
  providers: [],
  recentModels: [],
  agentModelCache: {},
  wechat: {
    bridgeUrl: "",
    secretId: "qiaomu-agent-wechat-bridge-token",
    defaultAccountId: "",
    themeId: "qiaomu-podcast",
    author: "",
    openComment: true,
    recordInNote: true,
  },
};

export function normalizeSettings(raw: unknown): QiaomuSettings {
  const data = raw && typeof raw === "object" ? (raw as Partial<QiaomuSettings>) : {};
  const api = data.api && typeof data.api === "object" ? data.api : DEFAULT_SETTINGS.api;

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    schemaVersion: 1,
    permissionMode: data.permissionMode === "edit" || data.permissionMode === "full" ? data.permissionMode : "plan",
    customPrompts: Array.isArray(data.customPrompts) ? data.customPrompts.filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.body === "string") : [],
    conversations: Array.isArray(data.conversations) ? data.conversations.filter((c) => c && typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.messages)).slice(0, 30) : [],
    modelSelections: data.modelSelections && typeof data.modelSelections === "object" && !Array.isArray(data.modelSelections) ? Object.fromEntries(Object.entries(data.modelSelections).filter(([, v]) => v && typeof v.model === "string" && typeof v.effort === "string")) : {},
    api: { ...DEFAULT_SETTINGS.api, ...api },
    // The built-in default connection is only listed once a key exists for it (checked on load).
    providers: migrateProviders(data, { ...DEFAULT_SETTINGS.api, ...api })
      .filter((item) => Array.isArray(data.providers) || item.secretId !== DEFAULT_SETTINGS.api.secretId)
      // "Nothing selected = everything" is gone: never-curated providers start with recommended models.
      .map((item) => item.enabledModels?.length ? item : { ...item, enabledModels: recommendedModels(item.provider, item.models ?? []) }),
    recentModels: Array.isArray(data.recentModels) ? data.recentModels.filter((item) => item && typeof item.source === "string" && typeof item.model === "string").slice(0, 8) : [],
    agentModelCache: normalizeModelCache(data.agentModelCache),
    wechat: normalizeWechatSettings(data.wechat),
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

function normalizeWechatSettings(raw: unknown): QiaomuSettings["wechat"] {
  const data = raw && typeof raw === "object" ? (raw as Partial<QiaomuSettings["wechat"]>) : {};
  const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  const defaults = DEFAULT_SETTINGS.wechat;
  return {
    bridgeUrl: text(data.bridgeUrl, defaults.bridgeUrl).trim(),
    secretId: text(data.secretId, defaults.secretId) || defaults.secretId,
    defaultAccountId: text(data.defaultAccountId, defaults.defaultAccountId),
    themeId: text(data.themeId, defaults.themeId) || defaults.themeId,
    author: text(data.author, defaults.author),
    openComment: flag(data.openComment, defaults.openComment),
    recordInNote: flag(data.recordInNote, defaults.recordInNote),
  };
}

function normalizeModelCache(raw: unknown): QiaomuSettings["agentModelCache"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: QiaomuSettings["agentModelCache"] = {};
  for (const [key, value] of Object.entries(raw as Record<string, { models?: unknown; fetchedAt?: unknown }>)) {
    if (!Array.isArray(value?.models)) continue;
    const models = value.models.filter((m): m is ModelChoice => Boolean(m && typeof (m as ModelChoice).id === "string"))
      .map((m) => ({ id: m.id, name: typeof m.name === "string" ? m.name : m.id, efforts: Array.isArray(m.efforts) ? m.efforts.filter((e) => typeof e === "string") : [] }));
    result[key] = { models: models.slice(0, 200), fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0 };
  }
  return result;
}
