# 从 CC Switch 和 ZCode 学到的模型配置规则（2026-09-25）

来源：CC Switch（farion1231/cc-switch，MIT）的 `src-tauri/src/proxy`、`model_capabilities.rs`、`src/config/*ProviderPresets.ts`；ZCode（zai-org/ZCode，Apache-2.0）的 `config/provider/zcode-builtin.json`、`packages/provider`、`packages/model-option-map`。只借用规则，按我们的代码重新实现，没有复制源码。

## 要解决的配置问题

1. **思考模式各家开关不同。** ZCode 的内置数据里，OpenAI 兼容接口至少有四种写法：`thinking: {type}`（智谱、Kimi、MiMo、DeepSeek）、`enable_thinking`（通义千问）、`reasoning_effort`、`reasoning: {effort}`（OpenRouter）。对没有专门规则的兼容接口，ZCode 默认四个字段一起发，服务端会忽略自己不认识的字段。
2. **中转站改了 Claude 的模型名。** `anthropic/claude-sonnet-4.6` 这类写法匹配不上 AI SDK 的判断，SDK 会退回旧的思考预算写法；而 Opus 4.7 及以后的模型只接受自适应思考。CC Switch 的做法是先把 `.` 和 `_` 统一换成 `-`，再按模型家族判断。
3. **Claude 中转的认证方式。** CC Switch 的 Claude 预设里，88 个用 `ANTHROPIC_AUTH_TOKEN`（`Authorization: Bearer`），只有少数用 `x-api-key`。我们原来只发 `x-api-key`。
4. **地址写法不统一。** Anthropic 兼容地址按 Claude Code 的习惯不带 `/v1`（例如 `…/api/anthropic`）；OpenAI 兼容地址如果只写了域名，需要补 `/v1`，但带了自己路径前缀的（例如 `/api/v3`、`/openai`）不能补。重复的 `/v1/v1` 要合并。
5. **不知道模型能力时怎么办。** CC Switch 只把确认不支持图片的模型列进名单，名单是精确匹配，其余一律放行；ZCode 把每个模型分成"智能配置"和"手动配置"，用户只能改少数几项，可以一键恢复。

## 我们的实现

- `services/thinking.ts`
  - OpenAI 官方、Gemini、Anthropic 官方：用 AI SDK 统一的 `reasoning`，由 SDK 自己转换。
  - 中转上改过名的自适应 Claude：显式发 `thinking: {type: "adaptive"}` 加 `effort`。
  - OpenRouter：请求体加 `reasoning: {effort}`。
  - 其他 OpenAI 兼容接口：四个常见开关一起发。
  - 内置两份名单：已知会思考的模型家族，以及确认不支持图片的模型，用于"自动"时给出判断。
- `apiBaseUrl`：按第 4 条的规则补 `/v1`，并合并重复的 `/v1/v1`。
- Claude 中转同时带 `x-api-key` 和 `Authorization: Bearer`；Anthropic 官方只带 `x-api-key`。
- 能力判断的优先级：用户设置 > 服务商模型列表 > 内置名单 > 未知。未知时不拦截图片，也不假设模型会思考。

## 实测

- 智谱 GLM Coding Plan（ZCode 里的 Key）：通过 Anthropic 兼容地址 `…/api/anthropic` 请求，程序自动补了 `/v1`，认证通过，服务商返回套餐到期（1309），这个中文报错原样显示给了用户。
- Claude Code 专用中转（CC Switch 和 `~/.claude/settings.json` 里的 Key）：地址正确，但网关拒绝把这个凭据用于 Claude Code 以外的请求，不做绕过。
- Kimi CLI 通过 ACP：不报告用量，占用环按设计不显示。Codex：报告用量，占用环正常显示。

## 以后可以考虑

- 从 CC Switch 或 ZCode 一键导入已有的服务商。本机的 CC Switch 里只有 Claude Code 专用中转和官方 OAuth 登录，ZCode 的套餐已到期，现在导入没有实际价值，先不做。
