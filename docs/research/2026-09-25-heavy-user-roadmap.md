# 重度用户视角的功能路线（2026-09-25）

状态：方案，未开发。后续开发以本文为准，逐项实现前再核对当时代码和竞品现状。
范围：乔木 Agent，以及它和乔木 RSS、Qiaomu Reader 的联动。已完成或进行中的能力（安全写入、选区与就地改写、对话分支、图片、Skills/MCP、公众号发布、粘贴密钥配置、上下文协议）不再重复展开。

## 结论先行

用户抱怨最集中的不是「模型不够强」，而是四件事：**不知道 AI 看了什么、找不到对的笔记、每个插件配一遍密钥、AI 写的东西混进自己的笔记**。我们的差异化来自乔木插件家族：阅读（RSS、Reader）→ 思考 → 写作 → 发布，是一条完整链路，其他 AI 插件只有中间一段。

优先做的 8 件事：

| 优先级 | 功能 | 解决的抱怨 |
| --- | --- | --- |
| P0 | 上下文协议接线 + 引用可跳回原文 | 选中文章就能问；回答能核对 |
| P0 | 「本次发送了什么」上下文清单 | 不知道 AI 看了什么、token 不可预期 |
| P0 | 免索引的库检索（搜索 + 链接 + 时间范围） | 向量索引慢、贵、中文切分差、找不准 |
| P0 | AI 写入的署名与来源标记 | 分不清哪些是自己写的 |
| P1 | 共享 AI 中枢：一个密钥给所有插件用 | 每个插件各配一遍密钥和模型 |
| P1 | 读后成文：从阅读到自己的笔记 | 摘要是噪音，洞见才是信号 |
| P1 | 周期回顾（日、周、月） | 回顾总是被跳过 |
| P1 | 整理建议只提建议、批量审阅 | 自动打标签和链接会弄乱库 |

## 用户在抱怨什么（有出处）

1. **不知道 AI 看了什么**：Copilot 用户说上下文「有时没有内容，有时是随机单个文件，有时 token 暴多」，子目录查询比父目录还费 token，希望能按文件夹、按「最近 5 天」可靠地取上下文（[Copilot 讨论 #2019](https://github.com/logancyang/obsidian-copilot/discussions/2019)）。中文论坛也抱怨「中间过程不透明，难以调试」（[Obsidian 中文论坛](https://forum-zh.obsidian.md/t/topic/31483)）。
2. **找不到对的笔记**：Vault QA 取回不相关的笔记（[#1224](https://github.com/logancyang/obsidian-copilot/issues/1224)、[#1567](https://github.com/logancyang/obsidian-copilot/issues/1567)），模型只复述问题（[#1198](https://github.com/logancyang/obsidian-copilot/issues/1198)），不理解文件夹结构（[#1412](https://github.com/logancyang/obsidian-copilot/issues/1412)），回答里的笔记链接点不开（[#1042](https://github.com/logancyang/obsidian-copilot/issues/1042)）。Copilot 自己后来也改成了「免索引搜索 + 可选语义检索」。
3. **索引慢、卡、贵**：Smart Connections 大库嵌入几小时不完成、冻结、崩溃（[#356](https://github.com/brianpetro/obsidian-smart-connections/issues/356)、[#473](https://github.com/brianpetro/obsidian-smart-connections/issues/473)、[#595](https://github.com/brianpetro/obsidian-smart-connections/issues/595)、[#790](https://github.com/brianpetro/obsidian-smart-connections/issues/790)），用户问「怎么负担得起」（[讨论 #352](https://github.com/brianpetro/obsidian-smart-connections/discussions/352)）。中文用户：全库反复嵌入把余额烧掉、切分逻辑不适配中文、内置提示词是英文（[中文论坛](https://forum-zh.obsidian.md/t/topic/31483)）。
4. **每个插件配一遍密钥**：「每个插件都要我单独配 API Key 和选模型」，希望有一个中心插件，其他插件共享配置（[Obsidian 论坛](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431)）。提议出现过，但没有被广泛采用。
5. **AI 内容污染笔记**：时间一长分不清哪些是自己写的；「一份 PDF 的摘要是噪音，读 PDF 时的洞见才是信号」（kepano 语）；建议 AI 只做检索，AI 生成内容明确标出来（[ssp.sh](https://www.ssp.sh/brain/using-obsidian-with-ai/)）。双链派认为整理本身就是思考，不该外包（[异步视界](https://blog.iaieye.com/posts/obsidian-evolved/obsidian-ai/)）。
6. **上下文出不了 Obsidian**：库里的知识进不了 Claude、Cursor、终端里的 Agent（[Unabyss](https://unabyss.com/blog/best-ai-plugins-for-obsidian)）。
7. **自主越强，边界越重要**：评测把「编辑边界」和「能否形成可重复的工作流」列为核心维度，提醒自主型 Agent 要有监督（[SystemSculpt 评测](https://systemsculpt.com/blog/best-obsidian-ai-plugins-2026)）。
8. **隐私**：日记、研究笔记不想发到云端；需要按文件夹排除、本地模型（[Copilot 讨论 #2019](https://github.com/logancyang/obsidian-copilot/discussions/2019) 中的排除配置负担，及多款本地优先插件的定位）。

## 模拟重度用户的一天

每个工作流写：怎么用 → 卡在哪 → 我们做什么。

### 1. 信息流读者（乔木 RSS + Reader 用户，我们的主场）
早上在 RSS 里刷 30 篇，读 5 篇，晚上读一章书。
- 卡点：读到好段落想问「这和我之前记的 X 有什么关系」，要先导出 Markdown、再开 AI、再粘贴；问完的结论散在聊天记录里。
- 我们做：上下文协议已做好（选中即问）。补上**引用跳回原文**和**读后成文**：回答里引用的段落可点击回到 RSS 文章或书页的位置；「写成我的笔记」产出一条带原文链接、带自己观点提示的笔记，而不是整篇摘要。

### 2. 研究者或学生（PDF 论文 + 文献笔记）
Zotero 导入、Obsidian 看 PDF、写文献笔记和综述。
- 卡点：跨 5 篇论文比较观点；AI 编造引用；PDF 页码对不上。
- 我们做：多来源对话（同时附加几篇 PDF 或笔记，清单里看得见）；回答必须带「来源 + 页码」，核对不到的引用标成未验证（Reader 已有 `verifiedQuotes` 思路，可复用）；综述草稿写进新笔记，每段带来源链接。

### 3. 写作者（公众号作者，乔木本人）
选题 → 素材 → 提纲 → 初稿 → 改稿 → 排版发布。
- 卡点：素材在 RSS 收藏、书摘、日记里到处都是；AI 改稿容易丢掉个人语气。
- 我们做：「从素材开始写」：按主题把 RSS 收藏、书摘、相关笔记拉成素材清单（用户勾选），生成提纲，再逐段写；个人语气用库根目录的风格说明（`AGENTS.md` 或写作 Skill）；发布沿用已完成的公众号草稿箱。

### 4. 日记与复盘
每天写日记，周日做周回顾，年底年度回顾。
- 卡点：回顾总被跳过；日记很私密，不想发到云端。
- 我们做：「本周回顾」一键：按日期范围读日记和已完成任务，只生成草稿到新的周记，不改原日记；日记文件夹可以设成「只用本地模型」或「不发送」。

### 5. 项目与任务（Tasks、Dataview 用户）
项目笔记、会议记录、任务散在各处。
- 卡点：「这个项目卡在哪」「下周该做什么」需要人工汇总。
- 我们做：按项目文件夹或标签汇总进展和未完成任务；新任务按 Tasks 语法写回，写入走审批卡片。Dataview、Tasks 更适合作为工具（查询）接入，而不是上下文。

### 6. 卡片笔记派（Zettelkasten）
坚持自己写、自己连。
- 卡点：不想要 AI 代写，但想要「我是不是写过类似的」「这张卡可以连到哪」。
- 我们做：只读的**相关笔记和链接建议**：列出候选和理由，用户逐条接受才插入链接；不自动打标签、不自动改写。

### 7. 会议与语音
手机录音，回来整理纪要和待办。
- 卡点：录音在手机里；转写、摘要、提取待办要跨三个工具。
- 我们做：对话里附加音频 → 转写（用户选服务）→ 纪要 → 待办，全部写成草稿等确认；移动端先保存录音再转写，网络失败可重试（参考 Voice MD 的做法）。

### 8. 开发者或知识工程师
库是给 AI 的长期上下文，还在用 Claude Code、Cursor。
- 卡点：库里的知识只能在 Obsidian 内用。
- 我们做：P2 考虑本地只读的库 MCP 服务，或直接引导使用 Obsidian CLI，把整理好的库开放给外部 Agent；默认只读，按文件夹授权。

## 功能方案

### P0-1 上下文协议接线 + 引用跳回原文
- 接线按 `docs/integrations/qiaomu-context-protocol.md` 的第 7 步完成。
- 引用：回答中引用 `<reading>` 或笔记内容时，渲染成可点击的引用。点击后：RSS 打开该文章并滚动到段落（需要在协议里加一个可选的 `reveal(anchor)` 能力，v1 兼容地扩展为 `ContextProvider.reveal?`）；Reader 跳到页或 CFI；笔记跳到行。
- 组件：先看 AI Elements 的 `InlineCitation` 和 `Sources`。
- 验收：引用文本在原文中找不到时显示「未核对」，不伪装成出处。

### P0-2 「本次发送了什么」上下文清单
- 输入框上方的卡片已经有了（笔记、选区、阅读内容）。补一个可展开的清单：每项的来源、字数或估算 token、是否截断；发送后在这条消息上保留同一份清单，事后可以查。
- 按时间范围和文件夹添加上下文（「最近 7 天的日记」「项目/Alpha 文件夹」），清单里显示实际命中的文件数。
- 超过模型上下文或用户设定的预算时，发送前提示并给出裁剪选项。
- 组件：AI Elements `Context`（token 用量）。
- 验收：同一问题同一范围，两次发送的文件清单一致。

### P0-3 免索引的库检索
- 默认不建向量库：组合 Obsidian 内置搜索、Obsidian CLI `search:context`、标题与别名、双链关系和文件修改时间，由模型多轮检索（Agent 模式天然适合）。
- 中文：检索词由模型改写成多个中文关键词和同义词，不依赖分词器；按段落返回上下文而不是整篇。
- 回答里的笔记链接一律用可点击的 wikilink（现有约定），并在消息下列出「用到的笔记」。
- 语义检索作为 P2 可选项，只做增量索引，并且明确显示进度和费用。
- 验收：在 2 万篇笔记的库里，首次使用无需等待；在测试集上比对取回的笔记是否相关。

### P0-4 AI 写入的署名与来源
- 写入笔记时（追加到日记、写成笔记、周回顾）默认带一个可配置的标记：`> [!ai]` callout，或属性 `ai_generated: true` 加上 `sources:`。用户可以在设置里选「不标记」。
- 生成的读书笔记只放「原文引用 + 待你填写的想法」，而不是代写结论（呼应 kepano 的观点）。
- 验收：搜索 `ai_generated` 能列出全部 AI 写入的笔记。

### P1-1 共享 AI 中枢
- 在已有的 `plugin.api` 上加 `complete({ messages, model?, signal })` 和 `models()`，其他插件（Reader 翻译、RSS 摘要、第三方插件）用 Agent 里已经配好的密钥和模型，不用再配一遍。
- 每次调用来自哪个插件，要在 Agent 里可查、可关；第一次调用时请用户授权这个插件（按插件 ID 记住）。
- 密钥永远不离开 Agent：别的插件拿不到密钥，只能拿到结果。
- 验收：Reader 在未配置内置 AI 时能用 Agent 的模型翻译；在 Agent 里撤销授权后 Reader 调用失败，并提示原因。

### P1-2 读后成文
- 入口：RSS、Reader 选中后的「问 AI」旁边不加新按钮；在 Agent 回答的操作栏里加「写成笔记」（沿用 `FilePlus2`）。
- 产出：标题、来源链接、我摘的原文、AI 提出的 2～3 个问题，以及留给用户写的空位；写入位置沿用 RSS 的文章保存文件夹。
- 验收：生成的笔记能被 RSS 的「已保存」识别并互相链接。

### P1-3 周期回顾
- 做成内置 Skill：日回顾、周回顾、月回顾，读取日期范围内的日记（兼容 Daily Notes、Periodic Notes 的路径设置）和完成的任务。
- 只写到新的周记或月记，不改原日记；写入走审批卡片。
- 私密文件夹规则（P2-1）生效时，这些文件不会被发送。

### P1-4 整理建议（只提建议）
- 命令：「给这篇找相关笔记和链接」「找出孤立笔记」「找出重复或可合并的笔记」「统一标签写法」。
- 结果是一个审阅列表：每条建议附理由，逐条接受或全部忽略；接受后才写入，走已有的安全写入与撤销。
- 不做后台自动打标签和自动链接。

### P2
1. **私密文件夹与模型路由**：按文件夹设「不发送」或「只用本地模型」；上下文清单里被排除的文件显示为已屏蔽。
2. **语音转写与纪要**：音频附件 → 转写 → 纪要 → 待办，移动端先落盘再转写。
3. **每日简报**：打开 Obsidian 时（或定时）生成今日简报：RSS 新文章精选、今日待办、昨日遗留；需要 RSS 协议扩展一个只读的「今日文章列表」。
4. **库 MCP 服务**：本地只读服务，把库开放给 Claude Desktop、Cursor；按文件夹授权，默认关闭。
5. **更多上下文适配器**：Canvas（选中节点文字）、Bases（当前视图的行）、Excalidraw（选中文字元素）。
6. **用量与预算**：按天或月统计 token 和估算费用，只在设置里查看，不在聊天界面常驻。

## 不做什么

- 默认全库嵌入、后台常驻索引。
- 未经审阅就自动打标签、自动加链接、自动改写原文。
- 常驻的费用仪表盘、几十个提示词卡片、没实现就先摆出来的开关。
- 把整篇摘要当作笔记的默认产物。

## 开发顺序建议

1. Codex 提交后：上下文协议接线（第 7 步），RSS、Reader 两个分支合并发版。
2. P0-2 上下文清单 → P0-3 免索引检索 → P0-1 引用跳回（它依赖检索和协议的 `reveal`）→ P0-4 署名。
3. P1 按「共享 AI 中枢 → 读后成文 → 周期回顾 → 整理建议」推进；共享中枢先于其他插件的 AI 改造。
4. 每项都在真实库里验收：一个 2 万篇笔记的库、一个以中文为主的库、手机端。

## 来源

- [Copilot 讨论 #2019：上下文不可预期](https://github.com/logancyang/obsidian-copilot/discussions/2019)
- [Copilot #1224 取回无关笔记](https://github.com/logancyang/obsidian-copilot/issues/1224)、[#1567](https://github.com/logancyang/obsidian-copilot/issues/1567)、[#1198](https://github.com/logancyang/obsidian-copilot/issues/1198)、[#1412](https://github.com/logancyang/obsidian-copilot/issues/1412)、[#1042](https://github.com/logancyang/obsidian-copilot/issues/1042)、[Copilot 发布记录](https://github.com/logancyang/obsidian-copilot/blob/master/RELEASES.md)
- [Smart Connections #356](https://github.com/brianpetro/obsidian-smart-connections/issues/356)、[#473](https://github.com/brianpetro/obsidian-smart-connections/issues/473)、[#595](https://github.com/brianpetro/obsidian-smart-connections/issues/595)、[#790](https://github.com/brianpetro/obsidian-smart-connections/issues/790)、[讨论 #352 费用](https://github.com/brianpetro/obsidian-smart-connections/discussions/352)
- [Obsidian 论坛：为什么没有统一的 AI 接口插件](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431)
- [Obsidian 中文论坛：Text Generator、Smart Connections、Copilot 调查](https://forum-zh.obsidian.md/t/topic/31483)
- [异步视界：Obsidian × AI 方法论分裂](https://blog.iaieye.com/posts/obsidian-evolved/obsidian-ai/)
- [ssp.sh：Keep AI out of your vault](https://www.ssp.sh/brain/using-obsidian-with-ai/)
- [Unabyss：所有 AI 插件都做不到的一件事](https://unabyss.com/blog/best-ai-plugins-for-obsidian)
- [SystemSculpt：2026 Obsidian AI 插件评测](https://systemsculpt.com/blog/best-obsidian-ai-plugins-2026)
- [MindStudio：Claude Code + Obsidian 第二大脑](https://www.mindstudio.ai/blog/build-ai-second-brain-claude-code-obsidian)
- [Voice MD 插件](https://community.obsidian.md/plugins/voice-md)、[LexVoice](https://github.com/Lynn-x/LexVoice)
