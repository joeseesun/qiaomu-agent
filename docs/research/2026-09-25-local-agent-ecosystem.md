# 本机 Agent 发现与模型管理（2026-09-25）

## 产品边界

用户只需要知道三件事：本机是否找到工具、模型能否列出、对话能否实际调用。检测到程序不等于已登录；列出模型也不等于一次聊天测试成功。本插件不读取其他工具的凭据，不改写它们的配置。

## 依据与取舍

| 来源 | 可借鉴事实 | 在本插件中的处理 |
| --- | --- | --- |
| [Google 公告](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) 与[迁移文档](https://antigravity.google/docs/cli/gcli-migration/) | 个人账号的 Gemini CLI 通道已迁移至 Antigravity CLI；企业许可与 API Key 使用仍有例外 | 新增 `agy`，优先展示；保留 Gemini CLI 供仍可使用的账号，不自动迁移用户配置 |
| [Antigravity Headless](https://antigravity.google/docs/cli/headless/) | `agy models` 可列模型，`agy -p … --output-format stream-json` 可调用；登录由 CLI 管理 | 按需读取列表；聊天用结构化流；未登录时显示真实错误。本机 `agy 1.2.7` 已检测，`agy models` 因未登录返回错误 |
| [Cursor ACP](https://prod.cursor.com/docs/cli/acp)、[Cline ACP](https://github.com/cline/cline/blob/main/docs/usage/acp.mdx)、[Auggie](https://github.com/augmentcode/auggie) | 各有本机 CLI，Cursor/Cline/Auggie 可作 ACP 服务 | 新增可执行文件发现和 ACP 启动入口；尚需在各自已登录环境做端到端验证 |
| [Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md)、[OpenClaw ACP](https://docs.openclaw.ai/cli/acp) | 两者可作为 ACP 服务；OpenClaw 依赖 Gateway | 新增发现和 ACP 启动；不把仅安装 CLI 或缺 Gateway 标成可聊天 |
| [AgentManager](https://github.com/kevinelliott/agentmanager) | MIT，广泛维护 CLI 安装/版本目录，含 Cursor、Cline、Auggie、OpenClaw | 适合参考候选命令与检测路径，不直接把 109 个目录项标成可调用 |
| [Magpie](https://github.com/yetone/magpie) | 以已安装/已配置工具组织界面，并读取各工具模型配置 | 适合参考产品分组；其跨 Agent 配置写入与网关代理超出本插件范围 |
| [Pi CLI](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi --list-models` 返回内置/自定义服务商目录；它不证明每个服务商都已登录 | 首次进入 Pi 来源时读取并缓存；默认只显示当前模型，用户在设置中选择额外型号，避免把数百个目录项放进日常菜单 |
| [OpenClaw 模型目录](https://github.com/openclaw/openclaw/blob/main/docs/cli/models.md) | 区分已发布列表、实时刷新、鉴权与可见性 | API 模型连接时读取列表、保留缓存；显式刷新与真实聊天测试分开 |
| [Lobe Icons](https://github.com/lobehub/lobe-icons) | MIT，现有项目已使用 1.95.1 的静态 SVG | 继续使用该版本的 Cursor、Cline、Hermes、OpenClaw、Antigravity 图标；ZCode 用本项目原创单色 Z 字标，不冒充官方 Logo |

## 验收边界

- API 接入时通过所选服务商的模型端点拉取列表；在服务商详情中可以刷新、逐个显示/隐藏，手动补模型 ID。测试模型会发一条短消息；列表成功不代表测试成功。
- 本机 Agent 模型开关只控制 Obsidian 对话列表，不写回外部 CLI。默认模型指该 CLI 自己的当前模型；手动模型 ID 仍需该 CLI 支持。
- Cursor、Cline、Auggie、Hermes、OpenClaw 的命令与协议依据官方/源码资料，但当前机器未装这些 CLI，因此仅覆盖单元测试与发现逻辑。Antigravity 在当前机器可检测，因未登录无法完成模型读取或聊天。
