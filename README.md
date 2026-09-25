# 乔木 Agent for Obsidian

Chat with your vault using local AI agents or model APIs. 在 Obsidian 侧边栏里和知识库对话：可以用本机已安装的 Agent（Codex、Claude Code、Gemini CLI 等），也可以接入自己的模型 API Key。

> 当前版本 `0.2.0`：首个提交到 Obsidian 社区目录的版本。桌面端（macOS）已在真实库中验证；移动端只做了平台分支模拟，尚未在 iOS / Android 真机上验收。

## 安装

上架后，在 Obsidian 的「设置 → 第三方插件 → 浏览」搜索 **Qiaomu Agent**，安装并启用。审核期间可从 [GitHub Releases](https://github.com/joeseesun/qiaomu-agent/releases) 下载同一版本的 `main.js`、`manifest.json`、`styles.css`，放进库的 `.obsidian/plugins/qiaomu-agent/`，然后重启 Obsidian。

首次使用时，选择一个本机 Agent，或在「设置 → 模型」添加服务商并粘贴 API Key。本插件不提供模型账户或免费额度，云端模型按服务商规则计费。

## 能做什么

- **对话**：流式回复，用 Obsidian 自带渲染器显示 Markdown、表格、Mermaid 和内部链接；回复可以复制、追加到今日日记或指定笔记。
- **上下文**：自动附加当前笔记和编辑器选区；`@` 引用库内文件或文件夹，也可以附加网页和图片。
- **模型**：输入框旁的一个菜单里选择所有来源的模型，包括本机 Agent 和二十多个云端服务商（OpenAI、Anthropic、Google、DeepSeek、Kimi、智谱、通义、OpenRouter、Ollama 等），也可以自定义 OpenAI / Anthropic 兼容地址。支持的模型可以调整思考强度。
- **文件权限**：只读、可修改当前库、完全访问（仅桌面端）三档，在输入框里随时切换。每轮修改都有变更卡片和 diff，可以预检后撤销，删除会移到回收站。
- **搜索与阅读**：模型自带联网搜索时直接使用；其他模型可连接你自己的 Brave Search Key。可以读取你给出的公开网页、RSS 和 JSON，以及搜索当前库中的笔记。
- **技能与工具连接**：扫描库内和本机目录中的 Agent Skills（`SKILL.md`）；为本机 Agent 配置 MCP 工具连接。
- **外观**：对话字体可跟随 Obsidian 界面或正文字体，也可以使用主题、插件提供的字体或已安装的中文系统字体；字号和代码字体可以单独设置。

## 能力边界

| 能力 | 桌面端 | 移动端 |
| --- | --- | --- |
| 模型 API 对话、笔记上下文、库内技能 | 支持 | 支持（未真机验收；部分服务商的跨域策略可能阻止直连） |
| 本机 Agent（Codex App Server、ACP、兼容 CLI） | 支持 | 不支持 |
| API 模型修改当前库 | 支持 | 支持（未真机验收） |
| 完全访问本机文件与命令行 | Codex 与 API 模型 | 不支持 |
| MCP 工具连接 | 传给本机 Agent；API 模型不使用 | 不支持 |
| Obsidian CLI（日记、属性等） | 需在 Obsidian 中启用命令行 | 不支持 |

“检测到”某个 CLI 只代表版本探测成功，不代表已登录或可调用；技能或 MCP 工具是否真的执行过，以对话中显示的运行记录为准。公众号排版与发布已拆分为独立插件 Qiaomu Publish（`qiaomu-publish`）。

## 联网说明

本插件没有自己的服务器，不收集遥测数据。只有下面这些情况会联网，且都由你的配置或操作触发：

- **模型服务商**：使用云端模型时，你的消息、附加的笔记、选区、图片、网页内容和所选技能正文，会发送到你选择的服务商 API 地址（或你填写的自定义地址），用于生成回复。在设置里拉取模型列表、验证 Key 时，也会请求该服务商。
- **联网搜索**：模型自带搜索（OpenAI、Anthropic、Gemini、xAI、OpenRouter）由服务商执行，可能单独计费。连接 Brave Search 后，搜索词会发送到 `api.search.brave.com`；Brave Key 只保存在本机，不会交给模型。
- **网页读取**：只读取你或模型在对话中给出的公开 HTTP/HTTPS 地址；本机和内网地址会被拒绝。
- **本机 Agent**：对话内容交给你已安装的 CLI（Codex、Claude Code 等），它们是否以及如何联网由其自身配置决定。
- **关于页**：打开「设置 → 关于」时，会从 `radio.qiaomu.ai` 加载作者公众号和打赏二维码图片。

API Key 保存在 Obsidian 的 SecretStorage 中，不写入插件数据文件。

## 访问库外文件（仅桌面端）

- 启动你安装的本机 Agent CLI，并在系统临时目录创建仅当前用户可读写的 MCP 配置文件，运行结束后删除。
- 读取 `~/.agents/skills`、`~/.claude/skills` 等技能目录和你添加的其他目录；导入技能时把所选文件夹复制到个人技能目录。
- 在工具连接里选择“保存到 Codex”时，通过 `codex mcp add` 写入 Codex 自己的全局配置。
- 选择“完全访问”时，Agent 可以读写这台电脑上的文件并运行命令。读取凭据、改动启动项、大范围删除和高风险命令仍会被拦截或先询问；库外的修改同样记录并可撤销。默认权限是只读。

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

首次测试建议使用单独的测试库。若要验证写入，把输入框里的文件权限从“只读”切到“可修改当前库”，并先确认所选本地 Agent 自身的审批策略。

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

## License

MIT。第三方组件及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
