# 参考项目吸收与公众号草稿发布方案 · 2026-09-24

## 快照与许可证

| 项目 | Commit | 许可证 | 可复用程度 |
| --- | --- | --- | --- |
| [zai-org/ZCode](https://github.com/zai-org/ZCode) | `29628c9` | Apache-2.0 | 可复用源码，需保留 NOTICE |
| [YishenTu/claudian](https://github.com/yishentu/claudian) | `069511f` | MIT | 可复用源码，需保留版权声明 |
| [op7418/CodePilot](https://github.com/op7418/CodePilot) | `1ae6d76` | BSL-1.1 | **只借鉴思路，不复制代码** |
| [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) | `f55c33b` | AGPL-3.0 | **只借鉴思路，不复制代码**（与之前 mobile-foundation 的决定一致） |
| [sunbooshi/note-to-mp](https://github.com/sunbooshi/note-to-mp) | `34abe3c` | MIT | 可复用，但核心取 token 依赖作者的付费中转服务 |
| [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) | 2026-09-15 | MIT | 可以作为内置 Skill 打包 |
| 乔木博客 `lib/wechat-*`、`tools/wechat-bridge` | 本地 | 自有代码 | 公众号链路的首选来源 |

## 现状差距（对照代码）

- `native-agent-backend.ts` 的 `session/request_permission` 会按权限模式**自动选择**允许或拒绝，没有交互式审批 UI；ACP `clientCapabilities: {}` 没有声明 `fs`，因此 Agent 写库绕过了 Obsidian Vault API，没有 diff 审阅，也没有可撤销的检查点。
- 上下文只有“当前笔记 + 附件”，缺少编辑器选区、光标位置、Canvas 选区，也不会在侧边栏获得焦点后继续保留选区。
- 指令来源只有设置里的 `systemPrompt`，没有读取库内 `AGENTS.md`，也没有项目级指令。
- 工具活动按条列出，没有分组；运行中不能排队追加消息。
- 没有“对选区就地改写”的入口。

## 值得整合的设计（按优先级）

### P0：安全写入闭环（ACP Vault Client + 审批 + 检查点）

来源：Copilot `VaultClient`（仅思路），ZCode `ConversationFileSummaryPanel` / `ConversationFileRewindDialog`（Apache），CodePilot `file-checkpoint`（仅思路）。

1. ACP 初始化时声明 `fs.readTextFile` / `fs.writeTextFile`，由插件通过 `app.vault` 实现，路径严格限制在库内，越界时返回 `invalidParams`。
2. 每次写入前保存原文快照，形成本轮的检查点；写入后产生每轮一张的“变更摘要”（文件列表 + 统一 diff）。
3. 回滚前先做预检，把文件分成 `safe`（仍是 Agent 写入的版本）、`unsafe`（`external_modified`，用户后来改过）和 `ignored`（通过 bash 修改，无法追踪）三类，只自动回滚 safe，其余让用户逐个确认。这和现有 FilePlus2 追加时“拒绝覆盖受影响前缀里的编辑”的保守原则一致。
4. `session/request_permission` 改为内联审批卡片：允许一次 / 始终允许 / 拒绝。“始终允许”规则按 Claudian `approvalRules` 的方式匹配（bash 用精确或显式通配，文件工具按路径段前缀匹配），写入插件数据，可在设置里撤销。
5. Codex App Server 的命令和补丁审批请求走同一张卡片。

### P0：Obsidian 感知的 Agent 提示与内置 Skills

来源：Claudian `core/prompt/mainAgent.ts`（MIT）、kepano/obsidian-skills（MIT）、Copilot 的指令文件设计文档（仅思路）。

- 上下文统一用 XML 标签：`<editor_selection path lines>`、`<editor_cursor path line>`、`<canvas_selection path>`、`<linked_content path>`；用户原文放在 CDATA 里，路径只解码一次。
- 系统提示写明规则：移动或重命名一律通过 Obsidian CLI 或 `fileManager.renameFile`，保证链接自动更新；删除进回收站；属性修改用 `property:set`；回复里提到的库内文件用 `[[wikilink]]`。
- 内置 obsidian-markdown / obsidian-bases / json-canvas / obsidian-cli 四个 Skill，用户不需要手动安装。
- 指令只保留一个来源：库根目录的 `AGENTS.md`，用户拥有这个文件，插件不覆盖、不自动生成镜像。设置里的 `systemPrompt` 退化为“附加说明”。把可变内容（选区、当前笔记）放在请求末尾，保证前缀稳定，提高缓存命中率。

### P1：选区与就地改写

来源：Claudian `SelectionController` + inline edit（MIT），Copilot Quick Ask（仅思路）。

- 焦点从编辑器移到侧边栏时，用 CSS Custom Highlight API 保持选区高亮，并自动把选区作为一张可移除的上下文 chip。
- 新增“就地改写”命令：选中文字后按快捷键打开小输入框，模型只返回 `<replacement>` 或 `<insertion>`，以词级 diff 预览，确认后通过 `editor.transaction` 写回，并支持一次撤销。移动端也可以使用（走 API）。
- Copilot 的 Prompt 模板变量值得借鉴：`{}` 表示选区，没有选区时取当前笔记；`{activeNote}`、`{[[笔记]]}`、`{#tag}`。可以接到现有的 `/` 模板上。

### P1：执行过程分组与运行中排队

来源：Copilot《Agent trail grouping》（仅思路），ZCode `ConversationQueuePanel`。

- 连续的工具调用和推理折叠成一行，例如“运行 12 个命令，读取 2 个文件，思考 51 秒”；遇到正文、子 Agent 或需要用户回答的交互时打断分组。Copilot 实测最长连续机器行数从 21 降到 5。**不要**在回合结束时自动折叠整段轨迹。
- 运行中可以继续输入，消息进入队列并显示在 composer 上方；支持编辑、删除和“立即纠偏（steer）”。

### P2：项目、记忆与侧聊

- **项目**（Copilot）：`<插件目录>/projects/<名称>/AGENTS.md` 加一份上下文列表（文件、文件夹、标签、属性），每个项目有独立的会话历史。说明清楚：上下文是焦点提示，不是权限边界。
- **记忆**（CodePilot / Copilot）：用户说“记住”时追加到 `memory.md`，只追加不覆写；日常记录写 `memory/daily/YYYY-MM-DD.md`；不存密钥。可以直接落在库里，方便用户审阅。
- **侧聊 `/btw`**（Claudian）：开一个临时对话，不污染主会话。
- **回复选区浮层**（ZCode `MarkdownSelectionTooltip`）：在回复里选中文字，可以“引用追问”或“追加到笔记”。
- **相关笔记**（Copilot）：需要本地索引，成本高，放到最后。

### 不建议整合

- Claudian Collab、ZCode 插件市场和远程工作区、CodePilot 的 IM Bridge、生成式 UI 和心跳：超出“克制的 Obsidian 侧边栏”的定位。
- 多标签加双栏会话管理器：窄侧边栏默认不采用，历史继续使用现有的归档列表。

## 一键发布到公众号草稿箱

### 为什么不直接照搬 note-to-mp

公众号的 `stable_token` 要求调用方 IP 在白名单内。note-to-mp 通过作者的服务 `obplugin.dualhue.cn` 获取 token（会员功能），因此排版器可以复用，发布链路不适合照搬。你已经有 `tools/wechat-bridge`：部署在固定 IP 的 VPS 上，支持多账号，已经处理了 token 刷新重试、图片转码、封面回退和 SSRF 防护，应当复用它。

### 方案

```text
当前笔记 (frontmatter + Markdown)
  → Obsidian MarkdownRenderer 离屏渲染 DOM
  → 移植博客 normalizeWechat*（DOM 函数，可直接复用）
  → Mermaid/数学公式 → PNG/SVG；Callout → 公众号提示块
  → 主题 CSS（wechat-themes / wechat-export-style）+ juice 内联
  → 本地图片逐张上传到 bridge → mmbiz URL
  → 预检（移植 wechat-publish-inspect：标题 ≤64、摘要字节、封面、外链脚注）
  → 确认弹窗（账号、标题、封面、图片数、警告）
  → POST bridge /v1/wechat/publish（固定 publish_now=false，只进草稿箱）
  → 回写 frontmatter：wechat_media_id、wechat_draft_at、wechat_account
```

需要修改 bridge，因为它现在只能抓取公网图片 URL，并且会拒绝 `data:` 图片，而 Obsidian 的本地图片不是公网地址：

1. 新增 `POST /v1/wechat/images`（请求体为原始图片字节，返回 `url`，复用 `uploadArticleImage` 的转码逻辑），封面走 `?kind=cover` 返回 `thumb_media_id`。
2. `collectArticleImageAssets` 跳过已经是 `mmbiz.qpic.cn` 的地址，避免重复上传。
3. `publishArticle` 接受 `thumb_media_id`，有值时跳过封面上传。

插件端：

- 设置里新增“公众号”分组，填写 Bridge URL，Token 存到 `SecretStorage`，账号列表从 `/v1/accounts` 拉取。用 `requestUrl`，不受 CORS 限制，因此移动端同样可用。
- frontmatter 字段兼容中英文：`title/标题`、`author/作者`、`digest/摘要`、`cover/封面`、`wechat_account/公众号`、`source_url/原文链接`。
- 入口：命令面板“发布当前笔记到公众号草稿箱”、文件菜单，以及在 AI 回复操作栏增加一个 Lucide `Send` 图标（带可访问名称和提示；点击后一定先弹确认）。
- 预览：先用侧边栏或 Modal 显示套好主题后的 HTML，同时提供“复制公众号格式”作为不需要 bridge 的兜底方式。
- Agent 集成：写一个 `wechat-draft` Skill，让 Agent 只负责润色和生成摘要，最后一步仍由用户在确认弹窗里点击。发布属于对外动作，不开放给自动审批。

### 工作量估算

| 步骤 | 内容 |
| --- | --- |
| 1 | bridge 增加图片上传接口和 mmbiz 跳过逻辑（约 80 行 + 测试） |
| 2 | 把博客 `wechat-themes`、`wechat-export-style`、`normalizeWechat*`、`wechat-publish-inspect` 抽成与框架无关的模块，放入插件（Tiptap 相关部分不搬） |
| 3 | Obsidian 渲染适配：wikilink 图片解析、Callout、Mermaid 转图、嵌入笔记 |
| 4 | 设置、确认弹窗、frontmatter 回写、命令和回复操作栏入口 |
| 5 | 用测试号走通端到端：纯文本、含本地图片、含 GIF、含 Mermaid、标题超长 |

注意：juice 大约会给插件增加 100KB+；主题 CSS 是博客自有代码，可以直接搬，但以后需要两边同步，长期看应该抽成共享包。

## 实施状态（2026-09-24）

公众号草稿发布已实现，详见 README「发布到公众号草稿箱」。

- 博客 `tools/wechat-bridge`：新增 `POST /v1/wechat/images` 接口，已在公众号图床的图片不再重复上传，支持直接传入 `thumb_media_id`。新增测试 `tests/lib/wechat-bridge-direct-upload.test.ts`。**尚未部署到 VPS。**
- 插件 `src/wechat/`：博客排版代码移植、CSSOM 内联器、Markdown 预处理（公式和 Mermaid）、Obsidian DOM 清理、栅格化、Bridge 客户端、发布流程、确认弹窗和设置页。
- 验证情况：
  - 桌面 Obsidian 临时库已跑通：本地图片、行内公式、块级公式、Mermaid、Callout、任务列表、代码、表格、外链脚注都正常。
  - 对本地模拟 Bridge 完整发送过一次：5 次上传加 1 次建草稿，frontmatter 成功写回。
  - 尚未验证：真实公众号接口、移动端真机。
- 设计取舍：
  - Obsidian 只带 CHTML 版 MathJax，所以公式改走 MathML 加 foreignObject 转 PNG。已实测 Obsidian 的 Chromium 不会因此污染 canvas。
  - 没有使用 juice，避免 `main.js` 再增加约 470KB。
