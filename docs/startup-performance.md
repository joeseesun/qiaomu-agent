# Startup performance — 0.3.1

Research and verification: 2026-09-27. Baseline: `4ec6fc5` (0.3.0).

## Findings and changes

| Path | Avoidable wait | Change |
| --- | --- | --- |
| All API/CLI model selections | Opening a chat refreshed models and disabled Send until discovery returned | Use configured models and cached metadata immediately; keep discovery in the picker/settings on demand, even with an empty cache |
| Local discovery | Serial version/help probes; repeated refresh calls repeated the whole scan | Four bounded workers, stable result order, shared in-flight scan, deduplicated probes within each scan |
| Integration readiness | CLI results waited for skill discovery to finish | Publish CLI results independently of skill scanning |
| Codex/ACP | First send started the transport; concurrent discovery/send could duplicate initialization | Prepare only the selected transport while composing; serialize initialization and ACP session setup |
| ACP | Every turn resent model/effort options | Skip values already confirmed by the server; track legacy model selection per session |
| Pi RPC/ZCode App Server | Existing persistent processes started only at Send | Start the selected process in the background without a model request; retain existing restart/permission rules |
| API request preparation | Vault instructions, note and change snapshots were read serially | Capture the request first and perform independent reads concurrently |
| Generic CLI | Runtime environment/prefix handling differed from native transports; UTF-8 chunks could split Chinese text | Honor discovered launch prefixes/environment and decode incrementally |

The existing transport architecture remains: Codex App Server, supported ACP agents, Pi RPC, ZCode App Server, streaming CLI fallback, and AI SDK streaming HTTP. This release does not change the user's chosen model/reasoning level, disable configured integrations, pre-send a prompt, or weaken permissions. Empty model-cache state no longer requires a discovery request before using a configured ID.

There is no safe universal way to keep an arbitrary one-shot CLI alive. Claude without its optional ACP adapter and Antigravity keep their streaming CLI path. API requests already stream without a local helper process; speculative authenticated HTTP requests are unnecessary and were not added.

## Protocol research

- [ACP initialization](https://agentclientprotocol.com/protocol/v1/initialization) separates connection negotiation from session creation and prompting. [Session setup](https://agentclientprotocol.com/protocol/v1/session-setup) owns workspace/MCP context. We prepare only the connection and still create sessions with the actual request context.
- [Claude Agent ACP](https://github.com/agentclientprotocol/claude-agent-acp/tree/e6681d2a5734857727352474c8c9aa848f9210ee) is the existing optional Apache-2.0 adapter; it is invoked externally, not copied or installed by the plugin. Mode selection remains explicit before prompting.
- [Pi RPC](https://github.com/earendil-works/pi/blob/2b0a123de98318c2ff8069661721ce0c3794c34e/packages/coding-agent/docs/rpc.md) documents the long-lived subprocess and strict JSONL framing. The existing MIT-licensed external CLI integration is retained without copying code.
- [Grok headless/ACP documentation](https://docs.x.ai/build/cli/headless-scripting) supports the existing stdio route. Cached authentication remains required.
- ZCode remains on the already integrated version-sensitive 0.16.x protocol. Startup fallback is allowed only before a prompt has been sent, never by replaying an ambiguous result.
- The installed AI SDK source/types were checked: streaming and React's 75 ms update throttle were already enabled. No artificial token delay was removed or claimed.
- [AI Elements](https://elements.ai-sdk.dev/components/) was reviewed. Existing model-picker and status components suffice; these changes require no new visual component or dependency.

## Automated and installed-host validation

`npm run check`: typecheck, **291 tests in 45 files**, production build. `git diff --check` passed. New regressions cover connection/session races, initialization retry, close during preparation, crash/history recovery, pre-cancelled sends, unchanged ACP settings, legacy model changes, permission restart, workspace change, bounded discovery, shared scans, result ordering and mobile no-probe behavior. Pi/ZCode tests now assert that preparation does not send a prompt or create a session.

In the real desktop Obsidian host, switching through API, Codex, Claude, Qwen, Pi and ZCode with no agent model cache made **zero automatic model-list requests**. Each synchronous control refresh took 1–2 ms. Original settings were restored after the check. The production build was installed and reloaded in both the dedicated release vault and the daily vault; installation preserved their data files.

Local CLI discovery, same machine and environment: **3,810 ms → 2,913 ms** (one sample each, approximately 24% lower). Results remained in the same order. This is startup detection time, not model generation time. Desktop discovery also now recognizes the current bundled Codex executable location.

## Real response samples

Read-only, empty working directory, short no-tools marker request; two sequential turns per working CLI. Preparation happens before the first send. These are samples from current accounts/routes, not statistical before/after claims.

| CLI | Version | Prepare | First text, first turn | First text, follow-up |
| --- | --- | ---: | ---: | ---: |
| Codex | 0.158.0-alpha.2 | 50 ms | 4,569 ms | 3,158 ms |
| Claude Code + ACP | 2.1.281 | 208 ms | 8,816 ms | 7,828 ms |
| Qwen Code | 0.24.1 | 1,637 ms | 2,871 ms | 1,573 ms |
| Grok CLI | 1.0.41 | 1,521 ms | 15,176 ms | 2,700 ms |
| OpenCode | 2.0.16 | 683 ms | 4,368 ms | 1,689 ms |
| Pi RPC | 0.87.1 | 6 ms | 2,965 ms | 2,151 ms |

Installed-host API samples, with only the synthetic prompt sent and search disabled:

| Provider/model | First text, first request | First text, second request |
| --- | ---: | ---: |
| StepFun / step-5-preview | 2,788 ms | 4,562 ms |
| DeepSeek / deepseek-flash | 817 ms | 483 ms |
| DeepSeek / deepseek-v4-pro | 1,179 ms | 1,077 ms |
| Qwen / qwen3-max-preview | 448 ms | 355 ms |
| Qwen / qwen-plus-latest | 235 ms | 217 ms |

All entries in these two tables returned the expected marker. Providers were not silently switched and secrets were not copied into fixtures.

Unavailable real-response cases: Kimi required authentication; Gemini returned a service-side client migration notice; Antigravity reported failed/timed-out authentication; ZCode reported an expired plan. A separate release-vault DeepSeek credential fixture returned HTTP 401, while the daily-vault DeepSeek configuration succeeded. Cursor/Cline/Auggie/Hermes/OpenClaw were not installed. Shared protocol tests cover their common paths, not real account connectivity. Windows and mobile devices were not available for live testing.

Codex-only measurements made before this broader change showed roughly 45 ms connection preparation and no stable end-to-end first-text improvement. Model/network latency remains separate from the plugin waits removed here. This release does not claim every model generates faster.
