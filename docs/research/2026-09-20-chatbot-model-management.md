# Chatbot interaction and model management research

Date: 2026-09-20. Scope: representative UX research, official provider documentation, open-source architecture and license review. Not an exhaustive survey of every chatbot. No keys were requested, provider accounts accessed, or paid generation tests made. This is a proposal, not implemented capability.

## Product decisions

Keep the selected quiet-native direction. Composer: plus actions at left, model name + muted effort text at right, send/stop. Remove Brain icon in the next implementation. Model popover switches in place between controls and searchable model list; model management is the fixed final action. Keep connection setup separate from routine selection.

Priorities:

1. Capability-driven model controls. Persist a stable connection ID + model ID, not just a display name. Show recent/favorite models; disambiguate duplicate names with connection labels. Switching affects the next request, never silently replays prior tools.
2. Context transparency. Removable current note, selection and attachment chips; preview exact text and truncation before sending. Citations open real vault files/headings. Do not imply the whole vault was read.
3. Recoverable conversation. Save drafts per conversation; preserve partial responses on stop/failure; explicit retry. Editing/regeneration creates a branch without overwriting prior replies or pretending to undo file writes.
4. Quiet but truthful status. Distinguish connecting, generating, tool execution and approval. Show elapsed time when useful, never fake percentage progress. Streaming must not drag a reader back to the bottom.
5. Write review. Exact target + append/diff preview + approval for relevant writes; conservative undo only where supported. MCP connection is not blanket permission.
6. Platform-aware behavior. No hover-only functions; touch targets and soft keyboard layout; desktop local processes remain unavailable on phones. API streaming/CORS/background behavior needs real-device tests.
7. Later: queued follow-ups with explicit pause-on-cancel semantics; usage details on demand, measured tokens versus estimated costs clearly distinguished. Avoid constantly visible billing dashboards, dozens of prompt cards and unimplemented switches.

Sources: [NN/g prompt controls](https://www.nngroup.com/articles/prompt-controls-genai/), [NN/g chatbot guidelines](https://www.nngroup.com/articles/ai-chatbots-design-guidelines/), [assistant-ui branching](https://www.assistant-ui.com/docs/guides/branching), [external runtime capability and queue semantics](https://www.assistant-ui.com/docs/runtimes/custom/external-store).

AI Elements components reviewed: [Prompt Input](https://elements.ai-sdk.dev/components/prompt-input), [Model Selector](https://elements.ai-sdk.dev/components/model-selector), [Attachments](https://elements.ai-sdk.dev/components/attachments), [Confirmation](https://elements.ai-sdk.dev/components/confirmation), [Context](https://elements.ai-sdk.dev/components/context), [Queue](https://elements.ai-sdk.dev/components/queue). Retain existing adapted components; evaluate each before adding a parallel UI runtime. Component presence does not implement backend semantics.

## Provider presets and key acquisition

| Preset | Base URL | Key entry point | Notes |
| --- | --- | --- | --- |
| Kimi open platform, China | `https://api.moonshot.cn/v1` | [Platform](https://platform.kimi.com/), API Key management after login | General product integration; separate billing from Kimi Code |
| Kimi open platform, global | `https://api.moonshot.ai/v1` | Appropriate regional platform account | Do not assume region/account interchangeability |
| Kimi Code | `https://api.kimi.com/coding/v1` | [Code console](https://www.kimi.com/code/console) | Coding membership restrictions; do not impersonate an approved client |
| GLM / BigModel general | `https://open.bigmodel.cn/api/paas/v4` | [API keys](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) | Default for general note conversations |
| GLM Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4` | BigModel API keys and eligible plan | Coding-only channel, not a substitute for general API |
| Z.ai general / coding | `https://api.z.ai/api/paas/v4` / `https://api.z.ai/api/coding/paas/v4` | Appropriate Z.ai account console | Separate regional presets; ZCode is a client, not a model vendor |
| DeepSeek | `https://api.deepseek.com` | [API keys](https://platform.deepseek.com/api_keys) | Official current OpenAI-format base; do not blindly append `/v1` |
| Doubao / Volcengine Ark | `https://ark.cn-beijing.volces.com/api/v3` | [Ark API keys](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey) | Use account-enabled model IDs or endpoint IDs where required; chat and Responses support varies |
| Custom OpenAI-compatible | User supplied | User's provider console | Explicit Chat Completions vs Responses; no universal key portal |

Endpoint sources: [Kimi Code platform comparison](https://www.kimi.com/code/docs/), [Kimi API overview](https://www.kimi.ai/zh-hans/help/kimi-api/api-overview), [ZCode connection documentation](https://zcode.z.ai/cn/docs/configuration), [DeepSeek first call](https://api-docs.deepseek.com/), [Ark official example](https://www.volcengine.com/docs/82379/1795150). Console pages may require login/JavaScript; DeepSeek console returned 403 to the research fetch, so this is not authenticated console verification.

## Minimal connection flow

Choose provider → paste key → test connection → select enabled models → return to conversation. Presets fill protocol and URL; advanced fields are folded away. Put official “Get API Key” and billing/documentation links next to the key field. Distinguish general API from Coding Plan before showing the key field.

- Model discovery: provider endpoint when supported, cached result plus curated fallback and manual model ID. `/models` failure must not prove chat is unavailable.
- Testing: URL validation + model-list probe separate from an explicit minimal generation test that can incur cost. Distinguish authentication, credit, entitlement, model-not-found, rate-limit, CORS and timeout errors.
- Capabilities: text/image/PDF/tools/reasoning/service tier are separate, with metadata provenance. Model ID alone is insufficient. Do not silently discard attachments after a model switch.
- Compatibility: normalize trailing slashes, show final request path, warn when a full endpoint was pasted into a base field. Do not force `/v1`, or interpret “OpenAI compatible” as full Responses/tool/reasoning support.
- Security: key masking, no keys in transcript/logs/exports; device-local secret storage where verified supported, no automatic vault-sync credentials. Do not forward credentials to a changed domain or silently switch providers after failure. No shared hosted proxy by default.

Implementation layering: connection profile (provider, transport, protocol, URL, secret reference, region/plan) → model catalog and capabilities → per-chat selection (connection ID, model ID, effort, supported service tier). Desktop CLI adapters stay isolated from mobile API code.

Current gap verified in `src/services/api-backend.ts`: non-Anthropic/non-Google calls use `createOpenAI(...).chat`, listing assumes `/models`, and reasoning capabilities use name matching. It needs provider-specific adapters/catalog metadata before broad compatibility claims. Source docs: [AI SDK providers](https://ai-sdk.dev/docs/foundations/providers-and-models), [LibreChat custom endpoint definitions](https://github.com/LibreChat-AI/librechat.ai/blob/main/content/docs/configuration/librechat_yaml/object_structure/custom_endpoint.mdx), [OpenCode providers](https://opencode.ai/docs/providers/).

## Open-source review snapshots

| Project | Snapshot | License checked | Relevant lesson / reuse boundary |
| --- | --- | --- | --- |
| assistant-ui | `d17cdb14fcb5987a380ecc1b0846ede1f8459474` | MIT | Branching, capability-aware actions, queue cancellation. Docs/API review; do not replace existing runtime wholesale. |
| LibreChat | `ba44443fdb232bbe6d4977e2619774b5a72586ac` | MIT | Read custom endpoint initializer: separate protocol routes, discovery, endpoint validation, prevent forwarding user-scoped headers to user-provided URLs. Selective reuse requires notices and tests. |
| OpenCode | `ebb7b76eca82342642c78645109e865614533827` | MIT | Read provider module: SDK registry, models.dev metadata, chat/Responses routing and per-provider options. Adapt architecture, not its desktop runtime. |
| Cherry Studio | `64da47fa6a5276062a3a7966a39bf30f3804012e` | AGPL-3.0 | Provider-centric management and local models; README/license review only this round. No source copying into our MIT distribution. |
| WeSight | `11f4e8c56ff129f5910690a993e9527409db12dc` | AGPL-3.0-or-later, LICENSE read directly | GitHub metadata said NOASSERTION; actual file clarifies AGPL. Keep native-agent architecture as prior research, no new full source audit this round. |
| Obsidian Copilot | `884600d3ae36f98fef07a5a31ef0fe7e3032cf6d` | AGPL-3.0 | Relevant vault/context UX; snapshot/license refresh only this round, not a new full code audit. |

All six had September 2026 commit timestamps in the GitHub snapshot. Recency is not proof of security or quality. No third-party scripts were installed/executed and no source was copied into runtime.

## Recommendation

Go with a narrow next milestone: video-style selector without Brain, fixed model-management entry, provider presets and official key links, capability-based controls and recoverable connection tests. Then improve context preview/citations and message branching. Queue and detailed usage are later enhancements. Verify unit/adapter contract tests, authenticated streaming for each chosen provider, and mobile devices before claiming support. Research does not establish provider interoperability or subscription eligibility.
