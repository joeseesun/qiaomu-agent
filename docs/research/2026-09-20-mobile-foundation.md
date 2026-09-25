# 研究吸收：移动端基础与面板隔离

## 本轮实施

- 保持 MIT，独立实现，不复制 Copilot / WeSight 的 AGPL 源码。
- 每个聊天面板拥有独立的原生后端；只重置或关闭当前面板的后端。
- 手机以 API 作为有效连接，不修改同步设置中的桌面 CLI 偏好。
- Node require 在运行时平台边界被拒绝；手机隐藏本地 CLI、外部 Skill 目录、MCP 进程配置。
- 手机对话使用普通标签页，回车不提交；触摸目标与安全区适配。
- API 请求不再解析桌面 MCP 配置，避免无关配置错误阻断手机聊天。

## 组件调查

查阅 https://elements.ai-sdk.dev/components/ 和 model-selector。已有输入框组件继续复用本项目 AI Elements 适配版本。模型选择保持宿主弹窗，本轮未引入新组件或复制竞品实现。

## 验证与未完成

`npm run check`：类型检查、39 项测试、生产构建通过。新增测试覆盖手机同步 CLI 偏好、Node 边界、面板隔离及手机回车/发送按钮。

安装到 `/Users/joe/Documents/rockfish/.obsidian/plugins/qiaomu-agent`（插件 0.1.0），CLI 重载成功，聊天视图 ready 且输入框已挂载，`dev:errors` 无捕获错误。构建与安装的 main.js SHA-256 同为 `3c16c463b7a9e3954723c8d1a9c5248d738a58e8a0229f6d8a82417c1a73ffaa`。仅为桌面宿主加载验收，不代表真实 API 流式调用或手机验收。

这不等于 iOS/Android 真机通过；未验证真实手机网络、文件选择、软键盘、剪贴板。原生线程跨重载恢复、附件独立存储、统一模型强度选择器、手机日记和 API 工具层仍待实现。面板内存隔离不等于会话历史存储已隔离：当前 lastConversation 仍为全局设置字段。
