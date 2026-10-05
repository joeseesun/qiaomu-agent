# Local CLI compatibility

## Native transports checked 2026-09-26

The plugin now prefers a persistent protocol when its local executable supports one. It keeps the existing Claude Code and Grok single-run CLI paths when their ACP entry point is unavailable. ZCode falls back to its JSON summary CLI only if App Server setup fails before a prompt is sent; an accepted prompt is never replayed automatically.

| Agent | Preferred transport | Local check | Remaining verification |
| --- | --- | --- | --- |
| Grok 1.0.41 | `grok --no-auto-update agent stdio` (ACP) | Two read-only turns in installed Obsidian plugin streamed `OK`, about 4.9s cold / 1.9s warm | Tool permission/write/cancel interactions |
| Claude Code 2.1.281 | `claude-agent-acp` 0.81.2 (ACP), separately installed | Read-only turn in installed Obsidian plugin streamed `OK`; active ACP mode confirmed as `plan` | Tool approvals, writes and cancellation |
| Pi 0.87.1 | `pi --mode rpc --no-session` (JSONL) | Two read-only turns in installed Obsidian plugin streamed `OK`, about 2.7s cold / 2.4s warm | Tool events and cancellation |
| ZCode 0.16.9 | Bundled `app-server` (private JSON-RPC) | Session created, subscribed and accepted a read-only prompt in installed plugin | Model returned plan-expired error 1309; streaming and approvals require a working provider |

Claude's ACP adapter is optional and is not bundled with the Obsidian plugin. Install it in the same local environment as Claude Code with `npm install -g @agentclientprotocol/claude-agent-acp`; then run the plugin's local-agent detection again. The plugin detects the executable on PATH and in common Node/npm locations. Without it, Claude Code keeps using its existing streaming CLI adapter. The adapter is Apache-2.0 licensed; this plugin invokes its executable and includes no copied adapter code.

The Claude adapter may create a session in `bypassPermissions` mode. The plugin explicitly calls `session/set_mode` before prompting: `plan` for read-only, `acceptEdits` for edit, and `bypassPermissions` only for full access. A missing requested mode stops the turn.

ZCode's App Server is version-sensitive and not ACP. The current integration targets the bundled 0.16.x protocol and retains the existing summary CLI as a setup fallback. No response is replayed after `session/send`, even if the App Server later fails or times out.

References: [Grok ACP](https://docs.x.ai/build/cli/headless-scripting), [Claude Agent ACP](https://github.com/agentclientprotocol/claude-agent-acp), [Pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md), [ZCode CLI](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/README.md). ZCode App Server event shapes were also cross-checked against the community [zcode-acp protocol notes](https://github.com/william0wang/zcode-acp/blob/main/docs/PROTOCOL.md); those notes are not an official stability guarantee.

## Pi 的 nvm 安装检测

macOS 桌面应用的 `PATH` 可能不包含 Node。即使找到 nvm 目录下的 `pi`，它的 `#!/usr/bin/env node` 入口仍可能启动失败，导致设置和模型菜单不显示 Pi。直接检测失败后，插件优先尝试同目录的 Node，再尝试其他已知 Node 路径；模型列表和 RPC 对话沿用检测成功的运行时与脚本路径。

2026-10-05 使用 Pi 1.0.2 验证：精简 `PATH` 的隔离目录中检测成功；Obsidian 1.13.7 设置页识别 Pi 并读取模型列表，对话模型菜单显示「Pi 默认模型」。使用 `openai-codex/gpt-6.1-sol` 在已安装插件中连续两轮无工具测试均返回 `QIAOMU_PI_OK`。自动化测试覆盖直接启动、Node 启动、模型列表、连续 RPC 对话和会话重置。

## Pi 的动态代理环境

桌面应用可能不继承终端的代理变量，导致 Pi 已能启动但模型请求报 `fetch failed`。插件在读取 Pi 模型列表、准备连接和每轮发送前生成子进程环境：优先保留显式 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`，同时兼容小写变量；缺少显式代理时，macOS 通过 `scutil --proxy` 读取当前启用的手动 HTTP/HTTPS 代理与例外列表。其他系统、未启用代理或检测失败时沿用原环境，不猜测地址和端口。

```text
读取模型列表 / 准备连接 / 发送消息
                |
                v
         有显式代理环境变量？
          |               |
         有               无
          |               |
          v               v
       沿用配置     macOS 当前手动代理
                          |       |
                         有       无
                          |       |
                          v       v
                       使用代理   沿用原环境
          \               |       /
           +--------------+------+
                          |
                          v
                 只传给 Pi 子进程
```

RPC 连接会比较本轮与上轮的代理环境；路由变化后重新启动 Pi，并用请求中的最近对话历史恢复上下文。插件不修改父进程环境、系统代理或 Pi 全局设置。已有 Pi `httpProxy` 设置仍由 Pi 自行处理，见 [Pi 网络设置](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md#network-and-retries)。自动检测仅支持 macOS 手动 HTTP/HTTPS 代理，不解析 PAC 或自动转换系统 SOCKS 配置。

2026-10-05 使用 Pi 1.0.2 和 `openai-codex/gpt-6.1-sol` 验证：移除临时 Pi `httpProxy` 设置、清除测试进程的代理环境变量后，通过插件后端动态读取系统代理，连续两轮无工具 RPC 测试均返回 `QIAOMU_PI_OK`。自动化测试覆盖配置优先级、端口变化、连接重建与历史恢复、检测失败以及读取代理期间取消请求。

## Historical headless CLI check

Checked 2026-09-20 on macOS, using an isolated `/tmp` working directory and read-only/no-tool prompts. These are older versions and do not describe the current native transport.

| CLI | Version | Executable | Headless result | Status |
| --- | --- | --- | --- | --- |
| Codex | 0.155.0-alpha.9.2 | ChatGPT app bundle | Returned `QIAOMU_OK` as JSONL | Verified for text streaming and read-only launch |
| OpenCode | 2.0.10 | PATH | Returned `QIAOMU_OK` in nested `part.text` event | Verified for text streaming; file permission semantics still pending |
| Claude Code | 2.1.278 | `~/.local/bin` | Returned `Not logged in` with exit code 0 | Adapter valid; account not configured |
| Kimi CLI | 1.50.0 | `~/.local/bin` | Returned `LLM not set` with exit code 0 | Adapter valid; model not configured |
| Qwen Code | 0.24.1 | PATH | Returned structured `No auth type is selected` | Adapter valid; authentication not configured |
| Grok CLI | 1.0.34 | `~/.grok/bin` | Returned structured `Not signed in` | Adapter valid; authentication not configured |
| Pi | 0.86.0 | PATH | Returned `No API key found` | Adapter valid; provider not configured |
| Gemini CLI | 0.60.0 | PATH | Required auth configuration | Invocation corrected; authentication not configured |

These checks prove executable discovery, supported command-line flags, event parsing, and basic model connectivity only for the exact combinations above. They do not prove MCP execution, Skills execution, Vault writes, cancellation on every CLI, or mobile compatibility.

## Findings applied to the adapter

- A zero exit code is not enough: several CLIs report authentication or model configuration failures while exiting successfully.
- Codex may inherit a large user Skills/plugin catalog. The plugin keeps the user's provider configuration, but the UI must not imply that discovery is free or that a selected Skill was the only context loaded by the CLI.
- OpenCode streams message text inside `part.text` rather than the top-level fields used by several other CLIs.
- Gemini CLI 0.60.0 does not accept `--system-prompt`; the adapter combines the system instructions with the prompt and uses `--skip-trust` plus an explicit approval mode.
- Pi plan mode retains read-only tools (`read,grep,find,ls`) and disables implicit Skills because the selected Skill is injected explicitly.
