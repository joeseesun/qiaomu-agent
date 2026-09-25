# 笔记内 AI 工作流：竞品、抱怨与机会（2026-09-25）

目标是让第一次使用的人在笔记里完成一次可靠改写：选中文字、说出意图、看懂变化、确认替换，出错时知道下一步怎么做。以下按官方文档和公开 issue 核对；issue 是用户报告，不等于当前版本仍有缺陷。

| 产品 | 值得学习的亮点 | 我们需要拿出的体验 |
| --- | --- | --- |
| [Claudian](https://github.com/YishenTu/claudian) | 选区或光标处内联编辑、词级差异、快捷键；侧栏的 Skills、引用和多会话。 | 保持笔记原位操作和差异预览，同时让改写继承当前笔记相关对话；支持本地 Agent 和 API。 |
| [Obsidian Copilot V4](https://github.com/logancyang/obsidian-copilot/blob/master/docs/custom-commands.md) | Quick Ask、右键自定义命令、复制/插入/替换，模型及笔记上下文可选；替换前校验原选区。 | 在源码模式也能用；把选区、当前笔记和模型来源说清楚；避免让初学者先学习命令模板。 |
| [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer/wiki/2.2-Apply-Edit) | 先看差异，再整批或逐行接受/拒绝。 | 对短选区保持一次确认即可；长段落或整篇才需要分块审批。 |
| [AI Refiner](https://community.obsidian.md/plugins/ai-refiner) | 光标旁输入、词级差异、Retry/Copy/Discard、一键预设、可选上下文范围和实时预览。 | 对齐这些成熟细节；再以与侧栏对话/模型共享、可靠写入和中文笔记上下文形成差异。 |
| [RU AI Assist](https://github.com/mrrepac/ai-assist) | “选区 → 按键 → 完成”；改写日志含词级变化、撤销和再运行；不同动作可选不同模型。 | 后续加可回溯的改写记录和快捷动作，但不让日志挤占笔记编辑空间。 |

## 公开抱怨透露的机会

1. [Claudian 选区没有进入侧栏上下文](https://github.com/YishenTu/claudian/issues/399) 是公开的回归报告。机会：选区必须可见、可核对，提交时绑定同一笔记和范围。
2. [Claudian 内联编辑与侧栏对话割裂](https://github.com/YishenTu/claudian/issues/435) 曾被报告，issue 已关闭。机会：只继承同一笔记最近对话，显式告诉用户“包含最近对话”，避免混入别的笔记。
3. [Smart Composer 应用修改失败](https://github.com/glowingjade/obsidian-smart-composer/issues/550) 的报告描述了等待 60–90 秒后失败。机会：生成与替换分开；确认后只执行编辑器本地 `replaceRange`，并在原文已变化时拒绝覆盖。
4. [Copilot Quick Ask 的快捷替换回归](https://github.com/logancyang/obsidian-copilot/issues/2219) 已标记完成；[Quick Ask 崩溃](https://github.com/logancyang/obsidian-copilot/issues/2464) issue 已关闭。机会：入口和确认动作保持稳定，做真实宿主验收，而不是把旧 issue 当作当前短板。
5. [Copilot 用户觉得显式引用当前笔记过于复杂](https://github.com/logancyang/obsidian-copilot/discussions/733)；[希望选区改写同时看到整篇笔记](https://github.com/logancyang/obsidian-copilot/discussions/1430) 的讨论后来已有相关能力。机会：默认给出清楚的当前笔记上下文，不要求用户理解变量模板或 `@` 语法。

## 落地顺序

- P0（本轮）：命令面板和右键入口；当前笔记与选区、同笔记最近对话；只读生成；词级差异；原文快照校验；一次替换可用 Obsidian 撤销。短选区的核心闭环。
- P1（部分完成）：一键润色/精简/正式/翻译、复制改写结果已加入。本轮还未加入可选择的上下文范围和模型、预览中的继续追问；对于新手要保持少量明确操作。
- P2：长文分段批准、改写历史与跨会话撤销、光标处续写；只有真实需求和可验证场景支持时再增加复杂度。

结论：目前不能声称“全面超越”。Claudian、Copilot 与 AI Refiner 的笔记内流程都已有成熟细节；我们的优先突破口是同一笔记上下文延续、可靠替换、中文友好的低门槛操作，并在实际 Obsidian 中逐项验收。
