# Contributing

本项目采用小步迭代：每个变更解决一个清晰问题，并附带与风险相称的验证。

## 分支与提交

- 功能分支：`codex/<short-topic>`
- Commit 使用简洁的英文祈使句，例如 `Add streaming chat view`
- 不提交 API Key、Vault 内容、MCP 密钥或本地绝对路径

## 合并前检查

```bash
npm run check
```

涉及界面的变更还应在浅色、深色和窄侧边栏下人工检查；涉及文件写入的变更必须在隔离测试库中验证权限与冲突处理。

