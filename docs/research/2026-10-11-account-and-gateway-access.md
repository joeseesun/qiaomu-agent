# 账号、订阅与 Magpie 接入

核对日期：2026-10-11。实现独立于上游；研究源码不作为运行时依赖。

## 本次实现

| 来源 | Qiaomu Agent 入口 | 凭据与模型 |
| --- | --- | --- |
| ChatGPT | Continue with ChatGPT（桌面端） | 官方 SIWC 动态客户端、PKCE、本机回调、签名身份校验；刷新和撤销；仅列出账号公开可用模型 |
| 词元跳动 | 浏览器授权 / API Key | PKCE 授权后换取专属 Key，使用 `https://tokendance.space/gateway/v1` |
| OpenRouter | 浏览器授权 / API Key | PKCE 授权后换取 Key，普通 OpenRouter 模型 API |
| Magpie | 独立网关入口 | 检测 `/api/hello`，获取 `/v1/models`；保留完整模型 ID 和网关报告的思考档位 |
| Claude 订阅 | 已登录 Claude Code，或 Magpie | Magpie 的 Claude 路由调用真实 Claude CLI 并桥接工具；插件不读取或复制 Claude 订阅 token |
| 国内 Coding / Token Plan | 独立套餐预设 | 智谱、Z.ai、Kimi Code 国内、MiniMax、百炼、小米、火山的套餐 Key 和专属地址 |

账号登录只在桌面端提供。手机可以填写 Key 或连接 HTTPS Magpie；未做手机真机验证。Magpie 本机地址默认 `http://127.0.0.1:3425/v1`，检测按钮可读取其公开 `settings.json` 中的端口。远程网关要求 HTTPS 与网关 Key。模型启用、默认模型和工具权限沿用现有逻辑。

## 国内账号登录调查

“插件把凭据归类为 OAuth”不等于厂商为任意第三方提供开放 OAuth。下面是当前上游源码的实现事实；这些登录由用户在 Magpie/原 CLI 中完成，本插件只消费网关模型目录。社区适配不代表厂商背书或所有套餐都允许相同使用方式。

| 来源 | 查到的流程 | 本插件采用路径 |
| --- | --- | --- |
| Kimi Code | 官方 CLI `/login` 支持设备码 OAuth；平台另提供套餐 Key | 已登录 Kimi CLI，或 Kimi Code 套餐 Key |
| MiniMax Code 中国 / 国际 | Magpie 插件使用 mcode 的设备码 OAuth + S256，刷新 token 轮换 | Magpie 的 `minimax-code` / `minimax-code-global`；普通 Token Plan Key 是另一入口 |
| Qoder / Qoder 国内 | PKCE 设备授权、轮询、不同区域账号与 API 主机；国内还有设备 token 模式 | Magpie；国内/国际账号不能混用 |
| ZCode / 智谱 / Z.ai | 浏览器登录后轮询，取得个人/团队计划的 Key；免费计划可能使用 ZCode 会话 | Magpie；也保留智谱/Z.ai Coding Plan Key |
| WorkBuddy / WorkBuddy AI | 浏览器回调与刷新，另可复用桌面登录；企业账号需企业身份 | Magpie |
| Trae / Trae Global | 各区域独立浏览器登录与回调、设备绑定和刷新 | Magpie；区域及当前账号可用模型以网关返回为准 |
| 小米 MiMo | 小米账号长轮询/扫码后换取 MiMo 会话；上游还可按账号实际权益路由 Token Plan | Magpie；另有 MiMo Token Plan Key |
| 百炼 / 火山方舟套餐 | 本次核实的是套餐 Key 与专属 endpoint，未确认可供本插件注册的开放 OAuth | 套餐 Key 预设 |

Magpie 还提供 Codex、Copilot、Gemini、Kiro、Cursor 等路由；是否可用取决于网关版本、安装的插件与账号。本插件不维护一份固定订阅模型名单。

## 研究来源与设计取舍

- [Magpie](https://github.com/yetone/magpie) `4ee3a76b7f50d42c5ecadd5105548c98978a77eb`（MIT）：`internal/gateway/claude_subscription.go`、`internal/provider/signin.go`、`presets.go` 及 [Integrate](https://usemagpie.ai/docs/integrate)。部分内置登录已迁移插件，不能仅看旧的内置 switch。
- [Magpie community plugins](https://github.com/magpie-community/plugins) `bcc94e593339539fbe4c074ea666846455b6c167`：阅读 `packages/{qoder,zcode,workbuddy,trae,minimax,mimo}` 的 README 与登录/刷新实现。未复制其源码；具体包许可证保留在上游。
- Qiaomu Clipper `d97772a`：阅读 `src/utils/oauth/core.ts`、`accounts.ts` 和服务商配置。浏览器扩展的标签页回调不能原样搬到 Obsidian，因此使用桌面回环监听器。
- [OpenAI SIWC](https://developers.openai.com/siwc/token-sharing-open-source)：官方动态客户端授权，不借用 Codex 客户端身份。阅读 Sign-in、Profiles and sessions、Models and inference、Preview limitations。
- [词元跳动 OAuth 文档](https://tokendance.space/docs/api-key-oauth.md)：`callback_url` 原查询参数会保留，因此 state 放入回调 URL；授权 code 只兑换一次。
- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)。
- [Kimi CLI 登录](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html)、[MiniMax Coding Plan](https://platform.minimaxi.com/subscribe/coding-plan)、[智谱 Coding Tool Helper](https://docs.bigmodel.cn/cn/coding-plan/extension/coding-tool-helper)、[百炼 Token Plan](https://help.aliyun.com/zh/model-studio/token-plan-overview)。
- [AI Elements](https://elements.ai-sdk.dev/components/) 已调查：复用现有模型选择组合；无可直接使用的宿主 OAuth 回调控件，账号配置采用 Obsidian Modal。品牌图标沿用 Lobe Icons 1.95.1；操作使用 Lucide。

## 凭据和生命周期

- 凭据仅存 Obsidian SecretStorage；插件 `data.json` 保存引用。登录会打开所选服务的授权站点，并向其兑换/刷新接口发请求；不会把 token 发给 Qiaomu 服务。
- 回调只监听 `127.0.0.1` 随机端口，校验 Host、路径、state、一次性 code；取消、返回、关闭和插件卸载会关闭监听器。ChatGPT 额外验证 ID token 的 JWKS 签名、issuer、audience、nonce、到期时间及原账号身份。
- ChatGPT 刷新按账号合并，并在支持时使用 Web Locks；轮换 token 保存失败时保留待保存副本，避免再次使用旧 token。退出先清空本机 token，避免迟到刷新重新登录；远程撤销失败时给出明确提示。
- ChatGPT 仅发往固定官方 API 地址，关闭服务器存储，过滤不支持的参数，工具放入命名空间，流必须收到 `response.completed`。图片生成/编辑使用其他来源。
- Magpie 内部负责上游登录、刷新和协议转换。插件只读取网关公开端口配置，不读取 Magpie 的账号文件，不自动安装网关或社区认证插件。

## 验证边界

协议测试覆盖本机回调、无效 state、取消、Key 兑换、签名校验、账号隔离、刷新合并、轮换保存失败、退出后迟到刷新、Magpie 检测和目录、真实 AI SDK 工具往返、ChatGPT 命名空间保持及截断流。

这些是协议夹具及宿主验证，不是每一家真实付费账号的授权与扣费验收。真实账号登录和配额仍需使用对应账号完成；未经实际运行不能宣称所有订阅均已端到端通过。
