# 模型服务商覆盖 · 2026-09-21

## 已实现

26 个服务商/区域/本地预设，另有自定义接口。预设只填地址，不猜测用户可用模型。
四种协议：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Google Generative AI。
按服务商保存独立配置和 SecretStorage 引用；修改地址清空密钥引用；拒绝带凭据 URL、远程 HTTP 和请求重定向。
Ollama / LM Studio 本机地址可无 Key；手机 localhost 指手机，不是电脑。

## 验证边界

预设不等于真实账号验收。当前验证配置隔离、地址校验、协议选择及原有回归测试；没有为这些服务商批量发起付费请求。
模型列表采用 /models；不支持此端点的服务可手动填模型 ID（方舟可能需要推理接入点 ID）。列表分页尚待实现。
API 工具执行、MCP、各家推理扩展参数、速度/服务等级、特殊文件格式并未因加入预设自动获得支持。
OpenRouter reasoning、DeepSeek thinking、硅基流动 enable_thinking、MiMo 思考模式需要后续专门的能力与报文测试；当前不暴露未经适配的强度选项。
Azure、Bedrock IAM、Vertex 服务账号不是普通 API Key 协议，本轮未实现。不能称为“所有模型全部验证”。
Kimi Code、GLM Coding、MiMo Token Plan、Step Plan 与普通按量 API 不混用；订阅限制与不同地址应另设连接，不默认拿编程订阅进行笔记对话。

## 官方依据

- [OpenRouter](https://openrouter.ai/docs/quickstart) / [推理参数](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [硅基流动](https://docs.siliconflow.cn/docs/userguide/quickstart)
- [MiMo](https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call)
- [阶跃](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create)
- [MiniMax](https://platform.minimax.cn/docs/api-reference/text-openai-api)
- [DeepSeek](https://api-docs.deepseek.com/) / [Kimi](https://www.kimi.com/code/docs/)
- [阿里云区域地址](https://help.aliyun.com/en/model-studio/base-url)
- [智谱/ZCode](https://zcode.z.ai/cn/docs/configuration)
- [火山方舟](https://www.volcengine.com/docs/82379/1795150)
- [千帆](https://cloud.baidu.com/doc/qianfan-docs/s/qm8qxemze) / [混元](https://cloud.tencent.com/document/product/1729/111007)
- [Mistral](https://docs.mistral.ai/api) / [Groq](https://console.groq.com/docs/api-reference)
- [Together](https://docs.together.ai/docs/inference/openai-compatibility)
- [Fireworks](https://fireworks.ai/docs/api-reference/post-responses)
- [Cerebras](https://inference-docs.cerebras.ai/resources/openai)
- [Perplexity](https://docs.perplexity.ai/docs/sonar/quickstart)
- [Ollama](https://docs.ollama.com/api/openai-compatibility) / [LM Studio](https://lmstudio.ai/docs/developer/openai-compat)

## 设计与复用

继续 quiet-native 方向；连接配置与聊天模型选择分离；高级协议和地址折叠。
已调查 [AI Elements Model Selector](https://elements.ai-sdk.dev/components/model-selector)：官方为 Dialog + cmdk；用户明确要求输入框锚定菜单，因此本轮未复制其 Dialog 源码，也没有引入新的 UI 运行时。
去掉大脑图标，推理强度显示灰字。已实现同层模型搜索、选择、错误重试、手动 ID 和模型管理入口。
开源调查与许可证边界见同目录 2026-09-20-chatbot-model-management.md；未复制 AGPL 项目源码。

## 本轮回归记录

- `npm run check`：18 个测试文件，63 项测试通过；类型检查、生产构建通过。
- SDK Chat Completions 流式解析：模拟 SSE 中文分片完整拼接；401 不重试；已取消请求不发网络。
- 原生 Obsidian rockfish：插件重载、Codex 目录返回 5 个模型、同层浮层与搜索聚焦、模型管理入口已验证。
- 360px 侧栏：clientWidth 与 scrollWidth 均为 360，浮层 278px；截图检查后恢复原宽度。属于桌面窄屏测试，不是手机真机测试。
- 连接身份变化会废弃旧目录请求，避免切换 API 后继续显示旧连接模型。
- 未进行真实付费 API 生成；四协议认证测试不等于四协议完整流式验收。特殊推理参数与手机真机仍待验证。
