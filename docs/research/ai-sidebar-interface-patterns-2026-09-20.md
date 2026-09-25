# AI 侧边栏对话界面研究

日期：2026-09-20

## 结论

成熟 Agent 界面不是把传统聊天气泡塞进侧边栏，而是把一次请求呈现成可审计的任务轨迹：用户意图、上下文、执行步骤、修改结果、验证与后续动作。对 Qiaomu Agent，推荐以 Codex 的安静正文为骨架，吸收 ZCode 的任务轨迹和 Claude Code / VS Code 的变更审阅，但保持 Obsidian 的字体、主题变量和低密度外观。

## 调研对象

| 产品 | 主要界面决策 | 值得吸收 | 不适合直接照搬 |
| --- | --- | --- | --- |
| Codex App | 线程/项目在外层导航；正文像工作记录而非气泡；工具与产物围绕任务展开 | 大面积安静正文、低装饰、结果优先、长任务可恢复 | 独立桌面 App 有更宽画布，Obsidian 右栏不能照搬三栏结构 |
| ZCode 3.14 | 用户问题形成段落锚点；思考与终端按时间出现；最终答案明显；输入框整合权限、模型、上下文和推理强度 | 单一 composer surface、轨迹折叠、最终结果与过程分层 | 其完整任务中心和大画布不适合窄栏常驻 |
| VS Code Chat / Copilot | 输入中使用 `#` 上下文和 `/` 命令；运行中支持排队/纠偏/停止；完成步骤可折叠；修改文件直达 diff | 运行中可 steer、上下文 token、Completed N steps、Changes review | IDE 控件密度偏高，直接复制会让笔记场景变重 |
| Claude Code for VS Code | 权限模式位于输入框底部；计划可独立审阅；手动编辑显示 side-by-side diff；会话可恢复/搜索/归档 | 权限与执行后果靠近发送动作、计划与写入分开、历史可恢复 | 代码 diff 需要转换为 Markdown 笔记的段落/属性/文件审阅 |
| Windsurf / Cascade | Code/Chat 明确分工；对长任务维护 Todo；支持队列、checkpoint、revert | 长任务进度、继续/撤回、Todo 折叠 | 独立 mode 数量过多会增加首次使用成本 |
| Cursor Agent | 模型/模式靠近 composer；编辑结果与会话关联；上下文提及低摩擦 | 上下文入口与输入合并、编辑与追问连续 | 容易形成密集 IDE 工具条，不宜照搬视觉 |
| Cline / Roo 类 | 每个敏感工具调用显式授权；命令、文件、浏览器动作可检查 | 权限透明、失败可恢复、工具细节可展开 | 每步都大卡片会把窄栏变成日志流 |
| Continue | Agent / Chat / Edit 分工；模型、规则、Prompt、MCP 可配置 | 可发现的 slash/Prompt/工具入口 | 配置概念过多，不符合最小努力原则 |
| Obsidian Copilot | Agent 可读写 Vault；可连接 OpenCode、Claude Code、Codex；连接沿用既有登录 | Obsidian 原生任务边界、自动发现本地 Agent | 功能面很宽，视觉层级容易膨胀 |
| Claudian | `@` 文件、`/` 命令、`$` Skill；inline edit；多标签与 session manager | 统一输入语法、内联修改、会话恢复 | 双窗格 session manager 不适合默认右侧窄栏 |
| WeSight | 侧栏聊天、inline edit、文件 mention、slash command、发布工作台 | 本地工作流和笔记上下文整合 | 专项发布功能不应进入核心对话首屏 |

## 共识模式

### 1. Header 表示“当前任务”，不是“当前供应商”

- 顶部主信息应是会话标题或当前工作目标。
- Agent、模型、权限属于会话配置，放进 composer 底栏或会话菜单。
- 连接异常才在 header 暂时提升，不常驻显示“已连接”。

### 2. Assistant 不使用聊天气泡

- 用户问题可以用轻微底色形成锚点。
- Assistant 正文直接落在背景上，使用 Markdown 排版。
- 不在每一轮重复头像、产品名、协议名；只在来源变化或分支时标识。

### 3. 过程压缩，结果展开

- 默认显示 `完成 5 个步骤 · 2 个文件已修改` 这样的摘要行。
- 运行中展开当前一步，历史步骤自动收起。
- 命令、搜索、读取、MCP 调用用统一动作行，不为每一步创建厚重卡片。
- 失败步骤保持展开并给出重试、跳过或查看日志。

### 4. Composer 是整个界面的主视觉锚点

- 文本区、上下文、附件、Skill、权限、Agent/模型和发送属于一个容器。
- 高频输入区固定在底部；不在它上方再堆一排游离 chip。
- 模式文案表达后果，如“仅建议”“可修改当前 Vault”，而不是技术枚举。

### 5. 写入必须有单独的 Review 层

- 对话正文只总结修改，不塞完整 diff。
- 用固定的 changes strip 展示文件数、增删统计和“查看修改”。
- 用户应能接受、撤销、继续修改；失败不抹掉已完成结果。

### 6. 窄栏优先使用渐进披露

- 右侧栏常见宽度约 300–420 px，不能把桌面 Agent 的多栏布局机械缩小。
- 会话历史、连接中心、MCP 管理属于弹窗或独立叶片。
- 当前笔记作为 composer 内的一个可移除 context token，不做常驻灰色横条。

## 当前 Qiaomu Agent 的主要问题

1. 顶部 `Codex · App Server / 已连接` 把传输协议放到了用户目标之前。
2. 每条 Assistant 消息重复 `Codex · App Server`，视觉噪声高，且没有会话标题。
3. 淡紫色用户气泡带来通用消费聊天产品感，与 Obsidian 的编辑器语境割裂。
4. `当前笔记 / Skill / 仅建议` 分散在输入框之外，composer 没有形成一个清晰整体。
5. 工具活动以多个带边框 details 呈现，成功路径也过度卡片化。
6. 没有 `完成 N 步`、Changes summary、diff/撤销入口，读写 Agent 的核心价值不可见。
7. 正文宽度、字号、元信息对比度过弱；窄栏中内容看起来像被缩小的网页。
8. Empty state 只给快捷提问，没有说明当前上下文、读写边界和第一步。

## Qiaomu Agent 的目标结构

```text
Thread header
  └─ 会话标题 · history / new / more

Conversation
  ├─ User intent block
  ├─ Running step / Completed N steps
  ├─ Assistant Markdown result
  └─ Changes summary / review / undo

Unified composer
  ├─ Context tokens: 当前笔记 / 选区 / 附件
  ├─ Prompt textarea
  └─ + / Skill / 权限 / Agent · Model / Send
```

## 可观察验收条件

- 3 秒内能说出本轮任务、当前上下文和是否允许写入。
- 一轮成功对话中，协议名最多出现一次。
- 完成的工具过程最多占一行，除非用户主动展开。
- 输入框只呈现一个视觉容器，所有会话级配置靠近发送动作。
- 有文件修改时，结果区能直接进入审阅或撤销。
- 在 300 px、360 px、420 px 宽度下不出现横向滚动或一字一行。

## 主要来源

- OpenAI Codex App: <https://openai.com/index/introducing-the-codex-app/>
- OpenAI long-horizon Codex workflow: <https://developers.openai.com/blog/run-long-horizon-tasks-with-codex>
- ZCode official product UI: <https://zcode.z.ai/en>
- VS Code Chat: <https://code.visualstudio.com/docs/chat/chat-overview>
- Claude Code for VS Code: <https://code.claude.com/docs/en/ide-integrations>
- Windsurf / Cascade: <https://docs.devin.ai/desktop/cascade/cascade>
- Cline: <https://docs.cline.bot/>
- Continue: <https://docs.continue.dev/>
- Obsidian Copilot: <https://github.com/logancyang/obsidian-copilot>
- Claudian: <https://github.com/YishenTu/claudian>
- WeSight: <https://github.com/freestylefly/wesight-obsidian>
