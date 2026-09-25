# Model settings redesign: paste a key, done

Date: 2026-09-24. Status: implemented 2026-09-24 (see Implementation notes). Owner: the thread already working on `src/ui/provider-settings.ts`.

## Goal

A user pastes one API key and is finished: provider detected, key verified, sensible models enabled, chat usable. Everything else (relay URL, custom endpoint, model curation) is optional and out of the way. Visual direction: quiet, clear, Vercel-like cards; consistent with the Qiaomu RSS settings page.

## Problems with the current UI (`provider-settings.ts`, `models.css`)

- Cramped: the editor expands inline inside the settings column, with a 48px left indent and a 72px label grid.
- Not really paste-only: the user must first pick one of 27 provider tiles, then paste.
- Model curation is a chip cloud of up to 60+ items with no hierarchy; "none selected = all shown" is implicit.

## References

- LiteLLM ([set keys](https://docs.litellm.ai/docs/set_keys)): `provider/model` routing, `check_valid_key`, `get_valid_models`. Transfer: verify on connect and fetch models automatically.
- Cherry Studio ([provider settings](https://docs.cherry-ai.com/docs/en-us/pre-basic/settings/providers)): check button next to key, multi-key rotation, fetched models must be added with "+". Transfer: the check; drop the manual "+" step by enabling recommended models by default.
- Key-prefix identification ([example rules](https://aidevhub.io/ai-api-key-tester/)): `sk-ant-` Anthropic, `sk-or-` OpenRouter, `AIza` Gemini, `gsk_` Groq, `xai-` xAI, `pplx-` Perplexity, `csk-` Cerebras, `fw_` Fireworks, `sk-proj-`/`sk-svcacct-` OpenAI. Match longest prefix first. Many providers (DeepSeek, Moonshot, SiliconFlow, Qwen, Zhipu, Together, Mistral…) issue ambiguous `sk-` or other generic keys.
- Qiaomu RSS settings (`乔木RSS-Obsidian插件/src/main.ts` `RssSettings`): segmented tabs, native setting groups, final "关于" tab with version, feedback and author links. Mirror this structure.
- Vercel dashboard: one card per concern, title + one-line description + control, muted footer bar holding helper text and the action; grayscale with a single status dot.

## Design

Tabs: 模型 · 对话 · 工具 · 发布 · 关于 (segmented control like RSS).

1. **Add model card (top of 模型 tab, always visible).** Title "添加模型", one line of help, one monospace password input + "连接". On paste:
   - Unique prefix → detect provider → call `listModels()` → show inline result row: brand icon, "识别为 X", "已验证 · N 个模型 · 默认 Y", status dot. No extra click needed.
   - Ambiguous key → show candidate chips ranked by format heuristics (length, charset, `id.secret` shape for Zhipu, UUID for Ark). User picks one; only then is the key sent, and only to that provider.
   - Footer: lock icon "密钥只存在本机 SecretStorage" + disclosure "中转站 / 自定义地址" (protocol segment + base URL).
2. **Connected list.** One row per provider and per local agent: icon, name, "N 个模型已启用", status dot, chevron. Clicking opens a **Modal** (not inline expansion) with room to breathe.
3. **Provider modal.** Key (masked, replace), searchable model list with one row per model (name, id, "推荐" pill, toggle), default model marker, collapsed advanced section for base URL, footer with "移除服务商" (confirm).
4. **Defaults.** Per preset, a small recommended-model list (by id pattern) that is enabled on first connect; the first becomes the default. Explicit `enabledModels` always; drop the "none selected = all" rule.

## Security constraints

- Never send a key to more than one provider to "probe" it. Ambiguous keys require user confirmation first.
- Keep existing rules: SecretStorage only, HTTPS for remote, changing base URL rotates `secretId` (key must be re-entered).

## Acceptance

- Anthropic/OpenRouter/Gemini key: paste → connected with default model, zero other clicks.
- DeepSeek-style `sk-` key: one confirmation click, no request to other vendors (verify in network log/tests).
- Detection unit tests for every prefix and ambiguous fallbacks.
- Settings at 390px width and in a narrow settings pane: no horizontal overflow, 44px touch targets.
- Lucide icons with accessible names; no emoji.

## Related

- Author metadata already fixed: `manifest.json` author 向阳乔木, `authorUrl` https://github.com/joeseesun.
- Earlier research: `2026-09-20-chatbot-model-management.md`, `provider-coverage.md`.

## Implementation notes (2026-09-24)

- `src/services/key-detection.ts`: `detectKey` (unique prefixes, longest first; ambiguous shapes return ranked candidates, never one guess) and `recommendedModels` (per-preset patterns, newest first, non-chat models excluded, falls back to the first chat models).
- `src/services/model-sources.ts` `connectProvider`: lists models from the chosen provider only, then saves the key, enables recommended models and sets the first as default; on failure nothing is saved. Re-pasting a key for the same vendor/endpoint replaces the old key.
- `enabledModels` is explicit; "none selected = all" is removed. Never-curated providers are migrated to their recommended models on load.
- `src/ui/provider-settings.ts`: 添加模型 card (paste → detect → verify; candidate chips for ambiguous keys; 其他服务商… picker; 中转站 / 自定义地址 panel), 已连接 list (providers + local agents, status dot, chevron), provider modal (masked key + 更换 with re-verification, searchable switch list with 推荐/默认 and 设为默认, manual model ID, endpoint disclosure, two-step 移除服务商), agent modal (read-only facts).
- Settings tabs: 模型 · 对话 · 工具 · 发布 · 关于 as a segmented control with arrow-key navigation; 关于 carries version, feedback and author links.
- Visuals: Vercel-style cards with a muted footer bar; grayscale primary buttons, checkboxes and links; the status dot is the only color.

Verified:
- Unit tests: every unique prefix; ambiguous shapes never produce a single vendor; every candidate exists in the catalog; `connectProvider` calls exactly one provider with the trimmed key and saves nothing on failure.
- In Obsidian: an ambiguous `sk-` key showed candidates with zero network requests; a fake `sk-ant-` key contacted only `api.anthropic.com`, failed with 401, and saved nothing.
- Simulated 390px mobile width: no horizontal overflow, every button ≥ 44px.

Not verified: a real key end-to-end for each vendor; a phone.
