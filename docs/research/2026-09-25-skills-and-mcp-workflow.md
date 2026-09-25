# 技能与工具连接：研究、设计及验收

## 用户任务与边界

用户先想完成一个任务，不应先理解 `SKILL.md`、MCP transport 或 JSON。技能是可复用的操作说明；MCP 是外部数据与工具连接。二者可以互补，但安装、启用和实际可用是不同状态。[OpenAI 的技能/MCP 概念说明](https://developers.openai.com/plugins/concepts/skills)。

## 参考产品

| 产品 | 借鉴 | 乔木的取舍 |
| --- | --- | --- |
| [Skills Manager](https://github.com/xingkongliang/skills-manager/blob/main/README.md) | 统一发现本地技能、按 Agent 分配、来源可追溯、搜索与预览 | 乔木只管理自身显示与选用；不接管所有 Agent 的全局技能库或复制其代码 |
| [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot/blob/master/docs/agent-mode-and-tools.md) | 设置页集中管理技能，对话中快捷调用 | 当前不向其他 Agent 目录写符号链接，避免更改它们的全局行为；Copilot 源码为 AGPL，本次没有复用 |
| [Claudian](https://github.com/spxd/obsidian-claudian/blob/main/README.md) | 聊天入口调用技能，按 Agent 实际传输能力区分 MCP | Codex MCP 与 ACP/CLI MCP 明确分开，避免一个开关假装控制所有 Agent |
| [CodePilot](https://github.com/op7418/CodePilot) | 独立 MCP/Skills 入口及运行状态可见性 | 在 Obsidian 中合并为一个两页弹窗，避免侧边栏增层 |
| [Codex 官方文档](https://developers.openai.com/learn/docs-mcp) | MCP 配置由 Codex CLI 与其其他客户端共享，可用 `codex mcp add/list` | 展示 Codex 已有配置；只有用户点“加入 Codex”才写它的全局配置 |

[AI Elements 的 Tool 组件](https://elements.ai-sdk.dev/components/tool)针对**对话中的工具调用结果**，没有覆盖本地技能库发现或 MCP 配置管理；此处使用 Obsidian Modal/Setting 组合并把样式限制在 `.qa-capabilities-modal`。

## 已实现

1. 自动扫描库内标准技能目录、个人技能目录及常见 Agent 技能目录；跟随目录符号链接，用真实文件路径去重。其他目录可手动添加。
2. “技能与工具连接”弹窗提供两个 Tab。技能页支持搜索、刷新、逐项显示开关与导入本地技能文件夹。导入不覆盖同名文件夹，复制到个人技能目录；当前用户的个人目录是 `~/Nutstore Files/.agents/skills`。
3. 对话工具菜单只提供“选择技能”和管理入口；选择弹窗中可直接“使用”，避免把一百多个技能塞进菜单。关闭显示的技能不再随乔木请求主动注入。
4. 工具连接页提供远程 HTTPS/本机 HTTP 地址或本地命令的表单；已安装 Codex 时可直接选择保存到 Codex（全局）或乔木（其他本地 Agent），无需先存一份再同步。保留高级 JSON 兼容原配置。乔木连接的逐项开关在发送给 ACP/CLI 时过滤；ACP 列表变化后新建会话。
5. Codex 现有 MCP 配置以只读列表显示。乔木连接可由用户明确点击加入 Codex；执行 `codex mcp add` 之前检查同名项，通过 `execFile` 传参而非 shell 字符串。成功后重启空闲的 Codex App Server 会话；进行中的回复不被中断。不会自动同步，也不会把本页开关声称为 Codex 全局开关。

## 真实能力边界

- 乔木技能开关控制**乔木菜单与显式 prompt 注入**；Codex、Claude Code 等原生 Agent 仍可能自行读取自己的技能目录。要隔离它们需要 Agent 自身的受支持配置，不应通过改写全局目录制造假隔离。
- Codex 列表的“已配置”来自 `codex mcp list --json`，并不表示服务器已通过鉴权或实际调用成功。新增连接写入 Codex 全局配置后仍需在新对话验证；若写入时 Codex 正在回复，当前回复结束后需要重载插件。
- 当前表单只覆盖无认证的 HTTP / stdio 常见情况。有认证、环境变量、请求头等高级配置保留 JSON 编辑入口；“加入 Codex”遇到这些字段会拒绝丢弃参数，提示回到 Codex 原生配置。
- API 模型目前没有 MCP 客户端能力，因此本页连接不向 API 请求暴露；不会显示虚假的“可用”。
- 导入本地技能时不复制符号链接文件，防止把源文件夹之外的内容意外导入。来自 Git URL、技能市场的安装与更新跟踪未纳入插件；可让外部 Skills Manager 管理来源，乔木只扫描其结果。

## 验收

- `npm run check`：162 项测试通过，生产构建通过；新增 MCP 配置读写、过滤、验证、Codex 参数/状态解析和折叠式技能描述测试。
- 已更新 `/private/tmp/qiaomu-release-vault.osRmr5/.obsidian/plugins/qiaomu-agent` 并通过 Obsidian CLI 重载。实际打开弹窗发现 152 个技能，搜索列表受 380px 滚动高度约束；Codex 原生列表读到 6 项；`dev:errors` 无错误。
- 使用界面添加 `qa_docs_test` 的 OpenAI Docs HTTP MCP 配置，确认写入设置后再从界面移除，确认已清理。没有改动 Codex 全局 MCP 配置，也未验证真实 MCP 工具调用。
