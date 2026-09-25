# Agent composer implementation and acceptance

## Candidate

- Repository: joeseesun/qiaomu-agent; branch: codex/native-agent-sidebar; PR: #7.
- Plugin: qiaomu-agent 0.1.0; Obsidian desktop: 1.13.7; test host: macOS, vault rockfish.
- Local installed main.js/styles.css rebuilt from this checkout and copied into the vault plugin directory, then reloaded through official CLI.
- Existing other plugins remained enabled. This is host integration evidence, not an isolated performance benchmark.

## Implemented

- React / AI SDK custom callback-to-stream transport; native Codex App Server and ACP remain native, not print-mode subprocess replacements.
- AI Elements-adapted flat messages, conversation scroll, composer and attachment presentation; source/license modifications in THIRD_PARTY_NOTICES.md.
- Model and reasoning selectors separate from connection setup. Codex model/list and ACP config options supply capabilities; manual model ID entry is a fallback for endpoints without listing. No invented provider-wide reasoning switch.
- Slash Prompt filtering and insertion, custom template create/edit/duplicate/delete with delete confirmation. Template selection does not send automatically; IME Enter does not submit.
- Vault @ file selection, local file input, clipboard files/images and file drops, removable previews, explicit type/size/backend errors.
- Lucide icon-only response actions: copy, append to daily note, append to chosen Markdown file. Exact-target confirmation, atomic Vault.process append and conservative undo.
- Previous conversations archived before new conversation; custom prompts, model selection, reasoning and attachment snapshots survive reload.

## Verification

- `npm run check`: typecheck, 35 tests across 12 suites, production build passed.
- `git diff --check`: passed. Dependency installation audit: no vulnerabilities reported.
- Real UI: slash Enter inserts template without sending; custom Prompt saved through host dialog; @ opens native picker and selected fixture is displayed as attachment.
- Real native Codex: fetched five models, selected GPT-5.6-Luna and low effort; no-tool synthetic prompt correctly returned `QIAOMU_ATTACHMENT_OK` from the selected Markdown fixture. Protocol unit test separately asserts model/effort/image fields in turn/start.
- Real rendering: Chinese text, GFM table, user/assistant distinction, Lucide action buttons. Mermaid reaches the host's trust approval card; trust setting was not changed.
- Real write: response appended to `Qiaomu Agent QA/交互验收-20260920.md`, confirmed by disk read. Existing fixture text preserved.
- Real daily path: icon opens confirmation for `10 Daily/2026-09-20.md`; cancelled without writing to the user's real diary.
- Host reload: saved custom Prompt count 1, archived conversation count 1, last user attachment count 1, model/low effort preserved; model capabilities refreshed to low/medium/high/xhigh/max after local CLI discovery.
- Host `dev:errors`: no captured errors at checked checkpoints.
- DOM/unit coverage: file input rejection preserves draft; pasted image becomes removable attachment and reaches mock backend; cancel closes stream even if backend hasn't settled; SDK activity IDs preserved; atomic append formatting and conservative undo checked.

## Visual QA

Two desktop screenshot passes: first found intrinsic grid width overflow from long conversation titles, clipping the slash menu. Fixed with minmax(0, 1fr), min-width:0 and explicit start alignment. Second screenshot shows full-width-safe title truncation, readable right-aligned user message, flat assistant reply, complete menu and composer controls inside the narrow sidebar. No host-global theme or layout overrides were applied.

## Explicit limits / remaining coverage

- Clipboard image and local upload event paths are DOM integration tests, not native OS clipboard/file-dialog end-to-end evidence. Native @ text attachment is end-to-end verified.
- API providers and non-Codex ACP agents were not all live-authenticated in this run. Kimi's prior installed conversation contains an authentication error; CLI detection alone is not account verification.
- ACP reasoning choices can be model-dependent; server rejection is shown if a selected capability is unavailable. Model list support varies by endpoint.
- PDF binary input only permitted for API connections; provider/model PDF or vision capability remains server-validated. DOCX/XLSX/audio parsing not implemented.
- Daily creation/template application and actual daily append were not run against the user's diary. Selected-file append and shared append/undo functions were tested.
- Mobile device, dark theme and detached-window behavior not fully exercised. Mobile has API chat and selected-file writes; daily CLI action explicitly requires desktop.
- Attachments persist as local snapshots in plugin data (not separately encrypted). Six files per turn, 5 MB each, 10 MB combined. Large accumulated conversation archives need future attachment sidecar storage and quota management.
- New Prompt name/body editing is implemented; advanced variable interpolation/favorites are not claimed.
- Local installation and PR update only; no merge, public release or community submission.

## Sources checked

- https://elements.ai-sdk.dev/components/prompt-input
- https://elements.ai-sdk.dev/components/message
- https://elements.ai-sdk.dev/components/attachments
- https://elements.ai-sdk.dev/components/model-selector
- https://elements.ai-sdk.dev/components/confirmation
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- Local Obsidian CLI help and installed Codex app-server generated TypeScript schema.
