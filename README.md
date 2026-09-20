# 乔木 Agent for Obsidian

一个克制、原生、面向知识库读写的 Obsidian AI 侧边栏。目标是让用户打开侧边栏就能开始对话，同时保留本地 Agent、模型 API、Skills 与 MCP 的扩展空间。

> 当前阶段：`0.1.0` 可构建原型。适合开发验证，尚未发布到 Obsidian 社区插件市场。

## 首版能力

- 原生 `ItemView` 侧边栏，不引入 React 与第二套设计系统
- 使用 Obsidian `MarkdownRenderer` 增量呈现 Markdown、GFM 与 Mermaid
- 自动附加当前 Markdown 笔记，支持自定义系统 Prompt 和快捷提问
- 桌面端探测 Codex、Claude Code、Kimi Code、Qwen Code、Grok、OpenCode、Pi 与 Gemini CLI
- Codex 使用长连接 App Server；Kimi、Qwen、Gemini 与 OpenCode 优先使用原生 ACP
- 卡片式“连接 Agent”中心展示检测状态、协议和版本，日常侧边栏只保留当前连接
- “仅建议 / 允许修改”显式权限切换；本地 Agent 负责实际文件工具与审批
- 支持 OpenAI、OpenRouter、Anthropic、Google、DeepSeek、xAI 和自定义兼容 API
- API Key 保存到 Obsidian `SecretStorage`
- 扫描库内与自定义目录中的 Agent Skills（`SKILL.md`）
- 可把 MCP JSON 配置临时传给已支持该参数的本地 CLI
- `isDesktopOnly: false`：移动端保留 API 对话、笔记上下文和库内 Skills

## 能力边界

| 能力 | 桌面端 | 移动端 | 当前状态 |
| --- | --- | --- | --- |
| 当前笔记读取 | 支持 | 支持 | 已实现 |
| 本地 Agent CLI | 支持 | 不支持 | Codex App Server、ACP 与兼容 CLI 回退 |
| 模型 API 对话 | 支持 | 支持，受服务商网络策略影响 | 已实现流式适配器 |
| Markdown / GFM / Mermaid | 支持 | 支持 | 交给 Obsidian 原生渲染器 |
| Skills | 库内与外部目录 | 仅库内 | 已实现选择与注入 |
| MCP | ACP 会话传入；Codex 使用本机配置；兼容 CLI 透传 | 尚未内置直连 | 已接入原生 Agent 会话 |
| API 模式直接改库 | 尚未支持 | 尚未支持 | 后续使用受控工具层实现 |
| Obsidian CLI | 支持自动检测与本地 Agent 引导 | 不可用 | 已接入，需在 Obsidian 中启用 |

“检测到”只代表版本探测成功；“可调用”代表已有参数适配器；“实际执行了 Skill/MCP 工具”必须以运行事件为准。ZCode 目前只检测桌面应用，不把它显示为可调用 CLI。

## 为什么不直接使用 AI Elements

AI Elements 面向 React 19、Tailwind CSS 4 与 shadcn 生态。Obsidian 已提供成熟的主题变量、组件生命周期和 Markdown 渲染管线。首版使用原生 DOM 与 Obsidian API，可以减少包体、样式冲突和移动端风险。

Vercel AI SDK 的流式协议与统一模型抽象仍值得借鉴。项目后续可在不替换界面的情况下，把 API 适配层迁移到 AI SDK Core，或实现兼容的 UI message stream。

## 开发

```bash
npm install
npm run dev
```

构建并检查：

```bash
npm run check
```

将以下文件复制到测试库的 `.obsidian/plugins/qiaomu-agent/`：

- `main.js`
- `manifest.json`
- `styles.css`

首次测试建议使用单独的测试库。若要验证写入，将权限从“仅建议”切换成“允许修改”，并先确认所选本地 Agent 自身的审批策略。

## 架构

```text
ChatView
  ├─ Obsidian MarkdownRenderer
  ├─ BackendService
  │    ├─ NativeAgentBackend
  │    │    ├─ Codex App Server
  │    │    └─ ACP（Kimi / Qwen / Gemini / OpenCode）
  │    ├─ CliBackend（不支持原生协议时回退）
  │    └─ ApiBackend（桌面 / 移动）
  └─ SkillService
       ├─ Vault Skills
       └─ External Skills（桌面端）
```

CLI 能力被放在动态加载边界之后，移动端不会静态导入 Node.js / Electron 模块。

当前逐项验证结果见 [Local CLI compatibility](docs/cli-compatibility.md)。

## 迭代路线

1. 完成 Kimi、Qwen、Gemini 与 OpenCode 的 ACP 端到端兼容矩阵。
2. 增加来源引用、文件 diff 与逐次写入确认。
3. 引入独立的 MCP client 层，并完善权限请求 UI。
4. 把 Obsidian CLI 扩展为 API 模式的受控工具调用。
5. 完成移动端 API 兼容测试和社区插件发布材料。

## 隐私与安全

- API Key 通过 Obsidian SecretStorage 保存。
- 当前笔记、历史消息、Skill 内容会按所选连接发送给本地 Agent 或模型 API。
- MCP 配置可能包含敏感环境变量；临时文件以仅当前用户可读写的权限创建并在运行后删除。
- 默认权限为“仅建议”。本插件不会把发现某个 CLI 或 MCP 服务等同于授权执行。

## License

MIT
