import type { ApiConnection, QiaomuSettings } from "../types";

export interface ApiPreset {
  label: string;
  baseUrl: string;
  website: string;
  protocol?: ApiConnection["protocol"];
  local?: boolean;
}

// Official endpoint references and verification limits: docs/research/provider-coverage.md.
export const API_PROVIDERS: Record<string, ApiPreset> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", website: "https://platform.openai.com/api-keys" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", website: "https://console.anthropic.com", protocol: "anthropic" },
  google: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", website: "https://aistudio.google.com/apikey", protocol: "google" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", website: "https://openrouter.ai/settings/keys" },
  siliconflow: { label: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", website: "https://cloud.siliconflow.cn" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", website: "https://platform.deepseek.com/api_keys" },
  moonshot: { label: "Kimi · Moonshot", baseUrl: "https://api.moonshot.cn/v1", website: "https://platform.kimi.com" },
  stepfun: { label: "阶跃星辰", baseUrl: "https://api.stepfun.com/v1", website: "https://platform.stepfun.com" },
  mimo: { label: "小米 MiMo", baseUrl: "https://api.xiaomimimo.com/v1", website: "https://platform.xiaomimimo.com" },
  minimax: { label: "MiniMax", baseUrl: "https://api.minimaxi.com/v1", website: "https://platform.minimax.cn" },
  qwen: { label: "通义千问 · 北京", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", website: "https://bailian.console.aliyun.com" },
  "qwen-intl": { label: "通义千问 · 新加坡", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", website: "https://modelstudio.console.alibabacloud.com" },
  glm: { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", website: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys" },
  zai: { label: "Z.ai", baseUrl: "https://api.z.ai/api/paas/v4", website: "https://z.ai/manage-apikey/apikey-list" },
  doubao: { label: "豆包 · 火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", website: "https://console.volcengine.com/ark" },
  baidu: { label: "百度千帆", baseUrl: "https://qianfan.baidubce.com/v2", website: "https://console.bce.baidu.com/qianfan" },
  hunyuan: { label: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", website: "https://console.cloud.tencent.com/hunyuan" },
  xai: { label: "xAI · Grok", baseUrl: "https://api.x.ai/v1", website: "https://console.x.ai" },
  mistral: { label: "Mistral", baseUrl: "https://api.mistral.ai/v1", website: "https://console.mistral.ai" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", website: "https://console.groq.com/keys" },
  together: { label: "Together AI", baseUrl: "https://api.together.ai/v1", website: "https://api.together.ai" },
  fireworks: { label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1", website: "https://app.fireworks.ai" },
  cerebras: { label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", website: "https://cloud.cerebras.ai" },
  perplexity: { label: "Perplexity", baseUrl: "https://api.perplexity.ai", website: "https://www.perplexity.ai/settings/api" },
  ollama: { label: "Ollama · 本地", baseUrl: "http://localhost:11434/v1", website: "https://docs.ollama.com/api/openai-compatibility", local: true },
  lmstudio: { label: "LM Studio · 本地", baseUrl: "http://localhost:1234/v1", website: "https://lmstudio.ai/docs/developer/openai-compat", local: true },
  custom: { label: "自定义接口", baseUrl: "", website: "" },
};

export function apiProtocol(connection: ApiConnection): NonNullable<ApiConnection["protocol"]> {
  return connection.protocol ?? API_PROVIDERS[connection.provider]?.protocol ?? "openai-chat";
}

export function permitsEmptyKey(connection: ApiConnection): boolean {
  if (!API_PROVIDERS[connection.provider]?.local) return false;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection.baseUrl).hostname); }
  catch { return false; }
}

export function validateApiUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error("API 地址不能包含账号、密钥或查询参数");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("远程 API 请使用 HTTPS；HTTP 仅用于本机服务");
  }
  return url.toString().replace(/\/+$/, "");
}

export function selectApiProvider(settings: QiaomuSettings, provider: string): void {
  const preset = API_PROVIDERS[provider];
  if (!preset) throw new Error("未知服务商");
  settings.apiProfiles = { ...settings.apiProfiles, [settings.api.provider]: { ...settings.api } };
  settings.api = { ...(settings.apiProfiles[provider] ?? {
    provider, baseUrl: preset.baseUrl, model: "", protocol: preset.protocol,
    secretId: `qiaomu-agent-${provider}-${crypto.randomUUID()}`,
  }) };
}
