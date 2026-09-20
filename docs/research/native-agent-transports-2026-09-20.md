# Native agent transports: WeSight, Codex App Server, and ACP

Research date: 2026-09-20

## Decision

Use a transport-first runtime instead of treating every local agent as a one-shot CLI:

1. Codex uses its native App Server over JSONL stdio.
2. Gemini CLI, OpenCode, Qwen Code, and Kimi CLI use ACP over JSON-RPC stdio.
3. A capability adapter normalizes both protocols into Qiaomu Agent events.
4. Claude Code, Grok CLI, Pi, and unknown tools keep a tested one-shot streaming fallback until a native or maintained ACP entry point is verified.
5. Mobile never attempts to spawn a local process. It uses configured model APIs and Obsidian's Vault APIs.

This is a `Go`, with a staged migration. Codex App Server should land first, then the shared ACP client, then individual ACP compatibility fixtures.

## Why the current runtime feels slow

`src/services/cli-backend.ts` starts a new child process for every turn. `src/services/cli-profiles.ts` also sends the full system prompt, selected Skill, active-note content, Obsidian CLI instructions, and the user prompt again for each process. That design is simple, but it repeatedly pays process startup, configuration discovery, Skill/MCP loading, authentication checks, and session reconstruction.

A persistent protocol does not make model inference itself faster. It removes repeated local startup work, preserves a session, enables real incremental events, and gives the UI a first-class cancel/approval path. We should measure connect time, time to first event, time to first text delta, and total turn time instead of promising an unmeasured speedup.

## WeSight review

- Repository: <https://github.com/freestylefly/wesight-obsidian>
- Reviewed commit: [`11f4e8c56ff129f5910690a993e9527409db12dc`](https://github.com/freestylefly/wesight-obsidian/tree/11f4e8c56ff129f5910690a993e9527409db12dc)
- Version at commit: `1.0.0`
- License: AGPL-3.0-or-later
- Manifest: `minAppVersion: 1.11.4`, `isDesktopOnly: true`
- Build: TypeScript + esbuild; Node/Electron process APIs are used at runtime.

### What it does well

- `src/runtime/codexDesktop.ts` discovers the Codex binary bundled with ChatGPT/Codex desktop apps, while preferring an explicitly installed CLI when available.
- `src/runtime/codexAppServer.ts` owns one long-lived `codex app-server --listen stdio://` child, performs `initialize` / `initialized`, correlates request IDs, parses JSONL incrementally, keeps stderr diagnostics, times out requests, and shuts down cleanly.
- `src/runtime/codexRuntime.ts` separates connection status from turns, resumes or starts threads, maps `item/*` and `turn/*` notifications to UI events, buffers early notifications until the turn ID is known, and interrupts a turn without killing the whole server.
- Model, account, configuration, and capability reads come from App Server rather than hard-coded dropdowns.
- The runtime manager keeps Codex on the persistent path and leaves other tools on their existing adapters.

### What we should not copy

- The source is AGPL-3.0-or-later while Qiaomu Agent is MIT. We can independently implement the public protocol and architectural pattern, but should not copy WeSight source into this repository.
- WeSight currently declares `approvalPolicy: "never"`, then automatically approves command/file requests in its server-request handler. Qiaomu Agent needs an explicit, visible approval model instead: read-only, vault-write, and full local access are different capabilities.
- It hard-codes `service_tier="fast"`; our client should preserve the user's Codex configuration unless a documented compatibility repair is actually needed.
- WeSight is desktop-only. Qiaomu Agent should keep a mobile API/Vault path even though local process transports are desktop-only.

## Official protocol baseline

### Codex App Server

OpenAI documents App Server as the product-integration surface for authentication, conversation history, approvals, interruption, and streamed agent events. It uses bidirectional JSON-RPC-shaped messages without the `jsonrpc` field. The default stdio transport is newline-delimited JSON. A client initializes once, then starts/resumes threads and starts turns while consuming `item/*` and `turn/*` notifications.

Primary source: <https://developers.openai.com/zh-Hans/docs/app-server>

Important implementation points for this plugin:

- Use stdio, not experimental WebSocket, for the local Obsidian child process.
- Generate or vendor schemas per supported Codex version during development; negotiate capabilities at runtime.
- Keep one server per resolved binary/environment and multiple logical threads.
- Scope approvals and UI state by `threadId` and `turnId`.
- Render agent text deltas separately from reasoning, command execution, file changes, MCP calls, plans, and errors.
- Support `turn/interrupt`; do not kill the server to stop one response.
- Let App Server expose the user's native Skills and MCP configuration instead of re-injecting all of it into every prompt.

### Agent Client Protocol

ACP standardizes editor-to-agent communication. Local agents normally run as subprocesses and communicate over JSON-RPC stdio. It defines sessions, Markdown content, streamed session updates, cancellation, permission requests, filesystem/terminal delegation, model and mode capabilities, and MCP integration.

Primary sources:

- <https://agentclientprotocol.com/get-started/introduction>
- <https://github.com/agentclientprotocol/agent-client-protocol>

For Qiaomu Agent, ACP should be one shared client implementation with small launch profiles rather than a separate parser for every CLI.

## Compatibility observed on this Mac

| Agent | Installed version | Native integration observed | Recommended path |
| --- | --- | --- | --- |
| Codex | `0.155.0-alpha.9.2` | `codex app-server` | App Server |
| Gemini CLI | `0.60.0` | `gemini --acp` | ACP |
| OpenCode | `2.0.10` | `opencode acp` | ACP |
| Qwen Code | `0.24.1` | `qwen --acp` | ACP |
| Kimi CLI | `1.50.0` | `kimi acp` (`--acp` deprecated) | ACP |
| Claude Code | `2.1.278` | no native ACP entry point in current help | one-shot stream initially; evaluate maintained adapter separately |
| Grok CLI | `1.0.34` | streaming JSON describes ACP session-update records, but no ACP server entry point was exposed | one-shot streaming |
| Pi | `0.86.0` | no ACP/App Server entry point observed | one-shot streaming |
| ZCode | not found on PATH | not verified | unavailable until detected |

Official implementation references:

- Gemini ACP: <https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md>
- OpenCode ACP: <https://dev.opencode.ai/docs/acp/>
- Qwen ACP architecture: <https://github.com/QwenLM/qwen-code/blob/main/docs/developers/architecture.md>
- Kimi ACP: <https://github.com/MoonshotAI/kimi-cli#ide-integration-via-acp>

CLI help and protocol availability are version-sensitive. Detection must probe the resolved executable, record the version, and fall back safely instead of assuming support from the agent name.

## Proposed runtime architecture

```text
Chat view
  -> AgentRuntimeManager
       -> CodexAppServerTransport
       -> AcpTransport
       -> OneShotCliTransport
       -> ApiTransport (desktop + mobile)
            |
            v
       Normalized runtime events
       connection / session / text / reasoning / tool / diff /
       approval / artifact / error / completed
```

### Core contracts

- `AgentDescriptor`: discovery candidates, protocol preference, launch arguments, config roots, mobile availability.
- `AgentConnection`: lifecycle, capabilities, authentication state, models, modes, Skills/MCP visibility.
- `AgentSession`: new/load/resume, current model/mode, context roots, persisted ID.
- `AgentTurn`: prompt parts, cancel, steer/follow-up, event stream, completion status.
- `ApprovalRequest`: operation type, target, impact, requested scope, allow once/session/deny.

The UI consumes normalized events and never parses provider-specific NDJSON.

## Product and safety consequences

- Connection state belongs in a compact header, not in a permanent status sentence below the composer.
- The composer shows the current permission scope before sending. Permission requests appear inline with the tool that requested them.
- Tool calls are collapsed event rows by default; active and failed items expand automatically.
- The active note is a removable context token. Reading a note and authorizing file writes are separate controls.
- Skills and MCP are discoverable from the selected native runtime when possible. “Found”, “enabled”, and “authorized for this turn” must be distinct states.
- The message body remains Markdown rendered by Obsidian so GFM, internal links, code blocks, and Mermaid inherit host behavior.
- A session remains alive while its view/plugin is alive, but every child process and listener is terminated on plugin unload.

## Verification plan

1. Unit-test JSONL framing, request correlation, out-of-order notifications, malformed lines, timeout, server exit, and cleanup.
2. Contract-test App Server and ACP against fake child processes before using real CLIs.
3. For every installed CLI, verify initialize, capability negotiation, new session, two sequential prompts, cancel, read-only behavior, write approval, tool event rendering, and process cleanup.
4. Benchmark cold connect and warm turn separately; record time to first event and first text delta.
5. Test the Obsidian view in light/dark themes, a narrow right sidebar, a full tab, reload, and plugin disable.
6. Test mobile only through API + Vault behavior; do not claim local CLI support on mobile.

