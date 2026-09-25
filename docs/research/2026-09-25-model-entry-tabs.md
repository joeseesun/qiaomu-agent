# 模型接入：本机 Agent 与 API 模型

2026-09-25。目标：新用户先回答“我已经有本机 Agent，还是只有 API Key？”，再进入相应的接入动作。日常切换模型仍留在对话输入框。

## 对照

| 产品 | 借鉴 | 在 Qiaomu Agent 中的边界 |
| --- | --- | --- |
| [Magpie](https://github.com/yetone/magpie) | 只展示检测到的本机 Agent，按来源组织模型；预设服务商减少 API 接入字段 | Magpie 会写其他 Agent 的配置并路由供应商密钥；本插件只调用已安装的 Agent，不接管它们的账号或改写配置 |
| [ZCode](https://www.zcode.network/en/docs/configuration/) | 首次使用时按登录/密钥路径引导；从聊天模型选择器进入管理 | ZCode 的部分第三方接入要求手动配置地址、添加模型和开启开关；常见 API 在本插件应保持“贴密钥 → 验证 → 推荐模型可用” |
| [Copilot for Obsidian](https://docs.obsidiancopilot.com/settings/) | Agent 使用其自身登录；BYOK 服务商单独管理并验证密钥、发现模型 | 不复制 Copilot 的完整代理安装与多级设置；本插件只展示真实检测和模型列表，不把“程序已找到”冒充“已登录可用” |

## 页面与状态

弹窗保留“当前对话”摘要，下方两个页签：桌面端默认“本机 Agent”，另一个为“API 模型”；移动端直接进入 API 模型。页签各有通向另一接入路径的入口，切换不丢失尚未提交的密钥输入。

- 本机 Agent：检测结果都可在设置中管理；对话菜单默认仅显示已安装的 Codex、Claude Code、OpenCode、Pi、Cursor、Antigravity CLI、Kimi CLI，最多七个。其他 Agent 可自行打开。列表的“已检测”只代表可找到并启动本机程序。详情按需读取 Agent 报告的模型；不支持列表的 Agent 可用其默认模型。版本、协议与可执行路径放进详情折叠区。重新检测失败时原位解释，不自动循环重试。
- API 模型：常驻密钥入口，唯一前缀可直接识别并验证；共享前缀须由用户选择服务商，密钥只发给选定的一家。已接入服务商在下方管理可选模型、密钥与高级地址。其他服务商由一个搜索入口选择预设或自定义接口，预设只要密钥，自定义再填写地址与协议。参考 [CC Switch 预设与自定义配置](https://github.com/farion1231/cc-switch-website/blob/main/public/docs/en/2-providers/2.1-add.md)。
- 成功与失败以文字表达；“已配置”“已检测”“已读取模型”分别指不同事实。无模型、无本机程序、无 API Key 与登录失败都给出可执行的下一步。
- 输入焦点采用插件局部中性色细边界，保留键盘可见焦点。模型选择器的纯图标来源按钮使用隐藏文字提供可访问名称，不出现悬浮 tips。

## 复用与许可

[AI Elements Model Selector](https://elements.ai-sdk.dev/components/model-selector) 的搜索、按来源分组和键盘选择模式与现有 React 弹层一致。Obsidian 设置弹窗使用宿主 Modal；本轮未复制组件源码、未增加包或许可证要求。
