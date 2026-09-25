# 上下文占用环（2026-09-25）

状态：已实现。来自 `2026-09-25-heavy-user-roadmap.md` 的 P0「上下文清单」，经讨论收窄。

## 决定

最初设想在每条回复下方列出「本次发送了什么」：笔记、选区、阅读内容、历史和逐项 token。讨论后放弃，原因：

- 普通用户想要的是清楚地对话、解决问题，不想逐项核对 AI 读了什么。这类需求主要来自重度用户，他们在意整库检索和 token 成本。
- 发送前，输入框上方的标签已经说明「这次会带上什么」，而且当时还能修改。发出去以后再列一遍，大多数人不会看，反而让对话变得拥挤。

保留的只有一个问题，而且用户确实会遇到：**「为什么聊着聊着变笨了，该不该新开对话？」** 所以只做上下文占用环。

## 界面

- 在输入框底栏的模型选择器和发送按钮之间，放一个 18px 的小圆环，表示当前会话已用的上下文比例。
- 点开后显示「已用 53K / 200K」。
- 达到 80% 时，圆环变成警告色；弹层里说明「对话较长，前面的内容可能被压缩或遗忘」，并提供「新建对话」按钮。
- **只在后端报告了真实数字时显示**，不估算、不显示费用。拿不到时不显示圆环。
- 读屏读作「上下文已用 27%」。圆环沿用现有 `ComposerPopover`，支持键盘打开和 Esc 关闭。

## 数据来源

| 后端 | 已用 | 窗口大小 |
| --- | --- | --- |
| Codex App Server | `thread/tokenUsage/updated` 的 `last.totalTokens` | 同一通知的 `modelContextWindow`（[说明](https://learn.chatgpt.com/docs/app-server)） |
| ACP Agent | `usage_update` 的 `used` | `size`（[RFD](https://agentclientprotocol.com/rfds/session-usage)），并非所有 Agent 都会发 |
| 模型 API | 最后一步的输入加输出 token（AI SDK `finish-step`） | 用户在模型配置里填的值；没填时用服务商模型列表报告的 `context_length`、`context_window`、`max_context_length`、`max_input_tokens` 或 `inputTokenLimit` |
| 普通 CLI 回退 | 无 | 无，不显示 |

## 实现

- `ChatCallbacks.onUsage` 回传 `{ used, size }`，transport 以 `data-usage` 写进助手消息，并随对话保存。圆环取最近一条带用量的回复。
- API 模式的窗口大小由 `services/model-capabilities.ts` 的 `resolveModel` 给出，通过 `ChatRequest.contextWindow` 传给后端。
- 各协议的用量解析集中在 `services/context-usage.ts`，并做数值校验。

## 每个模型的能力配置

服务商详情里每个模型的「配置」包含：上下文窗口（可手填，附 32K / 128K / 200K / 1M 快捷值）、思考模式、图片输入，以及原有的温度和最大输出。三项能力都是「自动 / 开 / 关」，「自动」后面显示检测结果。

- 优先级：用户设置 > 服务商模型列表报告的值（OpenRouter 的 `architecture.input_modalities`、`supported_parameters`，Gemini 的 `thinking`）> 内置规则（OpenAI gpt-5 / o 系列、Gemini 3）。
- 思考模式开启后，输入框提供低、中、高三档，通过 AI SDK 统一的 `reasoning` 参数发送，由 SDK 转换成各家的开关（OpenAI `reasoning_effort`、Claude 自适应思考或思考预算、Gemini `thinkingLevel`）。OpenRouter 另外需要在请求体里加 `reasoning: { effort }`。
- 图片输入只在明确不支持时拦截，并在粘贴图片时就提示；未知的模型照常发送。
- 工具调用暂不提供开关：API 模式还不执行 MCP 或文件修改工具。

## 参考组件

AI Elements [Context](https://elements.ai-sdk.dev/components/context)：借用它的圆环加明细结构和紧凑数字格式（53K、1.2M）。不采用它的 Radix HoverCard（手机上没有悬停，也和宿主焦点管理冲突），也不用 `tokenlens` 价目表（中转、本地模型和订阅制 CLI 的价格都无法得知）。
