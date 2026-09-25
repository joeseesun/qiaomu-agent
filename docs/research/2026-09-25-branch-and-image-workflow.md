# 对话分支与图片工作流（2026-09-25）

## 竞品与交互决定

- [Codex 的线程模型](https://openai.com/index/unlocking-the-codex-harness/)支持 fork；[Claudian 的 `/fork`](https://github.com/YishenTu/claudian/blob/main/src/core/commands/builtInCommands.ts)也会复制对话。不能把“分支”宣传成我们独有。相比单纯复制整段历史，从某条已完成回复分支更适合在笔记里试另一版：父对话留在历史中，子对话只带此前上下文，标题说明来源，点击可回父对话。
- [Open WebUI 的 Fork Chat](https://docs.openwebui.com/features/chat-conversations/chat-features/)同样保留原对话并从指定回复继续。我们的差异应放在笔记上下文：两个分支共用真实笔记库，因此历史工具步骤和旧文件修改卡片不能在子对话中再次当作可撤销操作。
- [AI Elements Message](https://elements.ai-sdk.dev/components/message)提供响应版本切换组件；本插件采用其消息操作组合，但独立对话的持久化和导航由宿主处理。

## 图片编辑能力

- 首选 Codex App Server：把参考图作为本轮图片输入，明确要求调用图像编辑或生成工具；已有原生传输能展示 `imageGeneration` 的结果。该工具是否可用取决于 Codex 登录、模型和功能开关，不能以“已附图”推断编辑已成功。
- [OpenAI Responses 图片生成工具](https://developers.openai.com/api/docs/guides/tools-image-generation)支持参考图和强制 `action: edit`；本插件对 OpenAI 图片编辑请求切换 Responses，读取生成结果。官方也推荐 [Responses API 用于多轮编辑](https://developers.openai.com/api/docs/guides/image-generation)。
- [Gemini 图片模型](https://ai.google.dev/gemini-api/docs/image-generation)支持图文输入和图像输出；只对名称标识为图片模型的连接请求 `TEXT` + `IMAGE` 输出。普通 Gemini 聊天模型可能只分析图片。
- [豆包 Seedream 图片 API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh&redirect=1)有单图和多图生图，但它是专用图片接口，不能把现有 OpenAI Chat 兼容接入当作已支持图生图。本轮只研究，待独立适配。

## 完成边界

缩略图和 Markdown 回复图片可打开灯箱；支持左右键/按钮切换、右键下载、插入当前笔记、作为参考图继续对话。插入前显示目标笔记，确认后用 Obsidian 的附件路径和链接规则。参考图回到输入框后，用户填写修改要求并主动发送。图片是否真正生成，需要在所选连接上跑一次真实请求才能验收。

## 本地验收

- 在 `qiaomu-release-vault.osRmr5` 中用 Codex GPT-6-Astra 实际把金毛照片的背景改为蓝色，再在只读图片编辑回合里把蓝色改为暖黄色；两次均收到新的图片附件。
- 第一次完全访问请求曾额外修改当前笔记，因此图片编辑回合现在强制文件只读且不携带当前笔记/选区。第二次请求前后 `safe-write/selection.md` 的 SHA-256 相同。
- 灯箱、右键菜单、下载至 Downloads、插入临时 Markdown 笔记均通过宿主 UI 验证；临时笔记和复制附件已移到 Obsidian 废纸篓，测试下载已清理。
- OpenAI Responses 和 Gemini 图片模型已验证请求构造，尚未用真实 API Key 完成端到端验收；豆包 Seedream 仍需专用接口适配。
