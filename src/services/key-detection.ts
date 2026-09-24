import type { ModelChoice } from "../types";

/**
 * Identifies a provider from the shape of an API key, without sending it anywhere.
 * Only prefixes that one vendor uses are "unique"; everything else yields ranked candidates
 * the user must confirm, so a key is never tried against several vendors.
 */
export type KeyDetection =
  | { kind: "unique"; provider: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "empty" };

/** Longest prefix first. */
const UNIQUE_PREFIXES: Array<[string, string]> = [
  ["sk-proj-", "openai"],
  ["sk-svcacct-", "openai"],
  ["sk-admin-", "openai"],
  ["sk-ant-", "anthropic"],
  ["sk-or-", "openrouter"],
  ["AIza", "google"],
  ["gsk_", "groq"],
  ["xai-", "xai"],
  ["pplx-", "perplexity"],
  ["csk-", "cerebras"],
  ["fw_", "fireworks"],
];

/** Format heuristics for keys several vendors share; order is the suggested ranking. */
const SHAPES: Array<[RegExp, string[]]> = [
  [/^[0-9a-f]{32}\.[A-Za-z0-9]{16}$/, ["glm", "zai"]],                                   // Zhipu id.secret
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ["doubao"]],          // Volcengine Ark UUID
  [/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/, ["minimax"]],                                            // JWT
  [/^sk-[a-z]{48}$/, ["siliconflow", "moonshot", "openai"]],
  [/^sk-[A-Za-z0-9]{48}$/, ["moonshot", "siliconflow", "openai", "stepfun"]],
  [/^sk-[0-9a-f]{32}$/, ["deepseek", "qwen", "qwen-intl", "mimo"]],
  [/^sk-/, ["deepseek", "moonshot", "qwen", "siliconflow", "stepfun", "mimo", "hunyuan", "openai"]],
  [/^[0-9a-f]{64}$/, ["together"]],
  [/^[A-Za-z0-9]{32}$/, ["mistral", "baidu"]],
];

const FALLBACK = ["deepseek", "moonshot", "qwen", "glm", "siliconflow", "doubao", "minimax", "openai"];

export function detectKey(input: string): KeyDetection {
  const key = input.trim();
  if (!key) return { kind: "empty" };
  for (const [prefix, provider] of UNIQUE_PREFIXES) if (key.startsWith(prefix)) return { kind: "unique", provider };
  for (const [shape, candidates] of SHAPES) if (shape.test(key)) return { kind: "ambiguous", candidates };
  return { kind: "ambiguous", candidates: FALLBACK };
}

/** Models that are not for chat (embeddings, speech, images, moderation…). */
const NON_CHAT = /(embed|tts|whisper|transcri|audio|speech|dall-e|image|moderation|rerank|search-preview|realtime|similarity|davinci|babbage|-edit)/i;

/** Per preset, patterns in priority order; each picks its newest-looking match. */
const PREFERRED: Record<string, RegExp[]> = {
  openai: [/^gpt-6(?!.*(mini|nano))/, /^gpt-5(\.\d)?$/, /^gpt-\d(\.\d)?-mini$/],
  anthropic: [/opus/, /sonnet/, /haiku/],
  google: [/gemini-[\d.]+-pro(?!.*(tts|image))/, /gemini-[\d.]+-flash(?!.*(tts|image|lite))/],
  deepseek: [/chat/, /reasoner/],
  moonshot: [/^kimi-k\d/, /kimi-latest/],
  qwen: [/^qwen3?-max/, /^qwen-plus/, /^qwen-turbo|flash/],
  "qwen-intl": [/^qwen3?-max/, /^qwen-plus/, /^qwen-turbo|flash/],
  glm: [/^glm-\d(\.\d)?$/, /^glm-\d(\.\d)?-(air|flash)/],
  zai: [/^glm-\d(\.\d)?$/, /^glm-\d(\.\d)?-(air|flash)/],
  openrouter: [/^anthropic\/claude.*sonnet/, /^openai\/gpt-\d/, /^google\/gemini.*pro/],
  xai: [/^grok-\d(?!.*(image|vision))/],
  mistral: [/mistral-large/, /mistral-medium/, /small/],
  groq: [/llama/, /qwen|deepseek/],
  minimax: [/minimax-m\d/i],
};

/** Newest-looking first: longer version numbers and later dates sort ahead. */
function newestFirst(a: ModelChoice, b: ModelChoice): number {
  return b.id.localeCompare(a.id, undefined, { numeric: true });
}

/** A few sensible chat models to enable on first connect; the first becomes the default. */
export function recommendedModels(presetId: string, models: ModelChoice[], limit = 3): string[] {
  const chat = models.filter((model) => !NON_CHAT.test(model.id));
  const picked: string[] = [];
  const flagged = chat.find((model) => model.isDefault);
  if (flagged) picked.push(flagged.id);
  for (const pattern of PREFERRED[presetId] ?? []) {
    const match = chat.filter((model) => pattern.test(model.id) && !picked.includes(model.id)).sort(newestFirst)[0];
    if (match) picked.push(match.id);
    if (picked.length >= limit) break;
  }
  for (const model of chat) {
    if (picked.length >= limit) break;
    if (!picked.includes(model.id)) picked.push(model.id);
  }
  return picked.slice(0, limit);
}
