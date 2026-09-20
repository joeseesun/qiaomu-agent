# Local CLI compatibility

Last checked: 2026-09-20 on macOS, using an isolated `/tmp` working directory and read-only/no-tool prompts.

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

