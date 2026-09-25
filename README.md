# 乔木 Agent for Obsidian

一个克制、原生、面向知识库读写的 Obsidian AI 侧边栏。目标是让用户打开侧边栏就能开始对话，同时保留本地 Agent、模型 API、Skills 与 MCP 的扩展空间。

> 当前阶段：`0.1.0` 首个社区发布候选。桌面端已做隔离库验证；移动端仍待真机验收。

## 安装

正式上架后，在 Obsidian 的「设置 → 第三方插件 → 浏览」搜索 **Qiaomu Agent**，安装并启用。审核期间可从 [GitHub Releases](https://github.com/joeseesun/qiaomu-agent/releases) 下载同一版本的 `main.js`、`manifest.json`、`styles.css`，放入仓库的 `.obsidian/plugins/qiaomu-agent/` 后重启 Obsidian。首次使用可选择本机已安装的 Agent，或配置自己的模型 API Key；本插件不提供模型账户或免费额度。

## 首版能力

- 原生 `ItemView` 侧边栏，聊天界面使用 React、AI SDK 与适配后的 AI Elements
- 使用 Obsidian `MarkdownRenderer` 增量呈现 Markdown、GFM 与 Mermaid
- 自动附加当前 Markdown 笔记，支持自定义系统 Prompt 和快捷提问
- 桌面端探测 Codex、Claude Code、Kimi Code、Qwen Code、Grok、OpenCode、Pi 与 Gemini CLI
- Codex 使用长连接 App Server；Kimi、Qwen、Gemini 与 OpenCode 优先使用原生 ACP
- 统一模型选择器：本地 Agent 与所有模型服务商在同一个列表里，按来源分组，可搜索、看最近使用、输入任意模型 ID；选中模型即切换来源
- magpie 式模型设置：选厂商、贴密钥，自动拉取模型列表；可以勾选哪些模型出现在选择器中
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
| Markdown / GFM / Mermaid | 支持 | 待真机验收 | Markdown 与 Mermaid 都使用 Obsidian 内置渲染；图表以静态图片显示 |
| Skills | 库内与外部目录 | 仅库内 | 已实现选择与注入 |
| MCP | ACP 会话传入；Codex 使用本机配置；兼容 CLI 透传 | 尚未内置直连 | 已接入原生 Agent 会话 |
| API 模式直接改库 | 尚未支持 | 尚未支持 | 后续使用受控工具层实现 |
| 修改审阅与撤销 | 支持 | 不适用 | 本地 Agent 每轮给出变更摘要与 diff，撤销前预检；权限请求在对话中审批 |
| Obsidian CLI | 支持自动检测与本地 Agent 引导 | 不可用 | 已接入，需在 Obsidian 中启用 |
| 公众号草稿箱 | 支持 | 支持（未真机验收） | 通过自建 qmblog Bridge 发送，只进草稿箱 |

“检测到”只代表版本探测成功；“可调用”代表已有参数适配器；“实际执行了 Skill/MCP 工具”必须以运行事件为准。ZCode CLI 仅在本机安装且配置可用时才能调用，检测到桌面应用不代表 CLI 可用。

## 界面与移动端边界

当前使用 React、AI SDK 与经宿主适配的 AI Elements 组件，来源与许可证见 `THIRD_PARTY_NOTICES.md`。Markdown 继续交给 Obsidian 渲染；模型和文件选择沿用宿主弹窗，避免引入第二套主题及焦点管理。

手机打开同步仓库时，即使桌面选择了 CLI，也会在本设备使用 API，不自动改写桌面的连接偏好。API Key 需要在当前设备检查配置。手机以普通标签页打开对话，回车换行、按钮发送；触摸操作区至少 44px。

移动端兼容声明不是实机验收：当前覆盖平台分支模拟和桌面构建，iOS/Android 的网络、软键盘、文件选择和流式回复仍需真机测试。部分 API 的跨域策略可能阻止直连。手机可确认后追加回复到指定笔记；“今日日记”目前仍依赖桌面 CLI，移动端日记适配尚未完成。API 模式尚不执行 MCP 或文件修改工具；Skill 正文注入不等同于支持其脚本执行。

## 发布到公众号草稿箱

命令面板「发布当前笔记到公众号草稿箱」，或在文件菜单选择「发布到公众号草稿箱」。弹窗里可以选公众号和排版主题，修改标题、作者、摘要，查看发布前检查和排版预览，然后发到草稿箱；也可以只复制公众号格式。Agent 顶部的手机图标、命令面板和文件菜单都能打开随笔记更新的公众号预览；预览与 Agent 共用右侧栏页签，可切换手机框和深色模拟。

- 排版复用乔木博客的公众号主题和规范化代码（`src/wechat/`），CSS 用浏览器 CSSOM 内联，不引入 juice。
- 本地图片、公式（MathJax → MathML → PNG）和 Mermaid 图（Obsidian 内置 Mermaid → PNG）通过所选连接上传，换成公众号图床地址。
- 属性：`title/标题`、`author/作者`、`digest/摘要`、`cover/封面`、`wechat_account/公众号`、`wechat_theme/公众号主题`、`source_url/原文链接`。成功后写回 `wechat_media_id`、`wechat_draft_at`、`wechat_account`。
- 在「设置 → 发布」可添加直连微信、受邀乔木中转，或继续使用自建 qmblog Bridge。直连要求当前设备出口 IP 在公众号 API 白名单；中转要求邀请密钥，并将中转的固定出口 IP 加入白名单。自建 Bridge 需要包含 `POST /v1/wechat/images` 接口的版本。所有 AppSecret、邀请密钥和 Bridge 令牌保存在 Obsidian SecretStorage，不写入同步的插件数据。
- 所有连接只创建草稿，不执行正式群发。深色预览只是模拟，最终排版需在公众号后台核对。首次使用建议先用测试公众号执行一次完整草稿流程。

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
2. 增加来源引用。（文件 diff、审批与撤销已完成）
3. 引入独立的 MCP client 层，并完善权限请求 UI。
4. 把 Obsidian CLI 扩展为 API 模式的受控工具调用。
5. 完成移动端 API 兼容测试。

## 隐私与安全

- API Key 通过 Obsidian SecretStorage 保存。
- 使用云模型时，用户发送的消息、所附笔记或阅读内容、选择的 Skill 内容会发送给所选模型服务商的 API 地址；模型服务商及自定义 API 地址由用户选择。使用本地 Agent 时，这些内容会交给用户已安装的本地 CLI；该 CLI 是否进一步联网由其自身配置决定。没有选择连接时不会发送对话。
- 只有用户主动执行「发布当前笔记到公众号草稿箱」时才发送正文与图片。直连方式从当前设备向微信 API 发送；自建 Bridge 方式发到用户配置的 Bridge；乔木中转方式将 AppID、AppSecret、正文与图片经 HTTPS 传至乔木服务器，再由服务器调用微信 API。乔木中转不持久保存 AppSecret 或公众号账号；此操作只创建草稿，不直接公开发表。
- 桌面端为了启动用户安装的 CLI、读取用户显式选择的仓库外 Skill 目录及创建临时 MCP 配置文件，会访问 Obsidian 仓库以外的文件系统。移动端不运行这些桌面能力。
- MCP 配置可能包含敏感环境变量；临时文件以仅当前用户可读写的权限创建并在运行后删除。
- 默认权限为“仅建议”。本插件不会把发现某个 CLI 或 MCP 服务等同于授权执行。

## License

MIT
