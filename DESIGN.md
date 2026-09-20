# Qiaomu Agent design system

## Direction

Selected direction: **A — Codex 静流**, confirmed 2026-09-20. Dials: variance 5, motion 3, density 6.

Build brief: make conversation the primary surface in a narrow Obsidian sidebar. Translate Codex's quiet transcript and unified composer, and ZCode's inspectable execution process, into host-native controls. No promotional assets, duplicate identities, permanent protocol labels, or simulated review/undo controls. Success means readable Chinese text, compact inspectable tools, stable streaming scroll, and one coherent input surface. Research sources are recorded in `docs/research/ai-sidebar-interface-patterns-2026-09-20.md`.

The chat sidebar should feel like a focused part of Obsidian, not an embedded web dashboard. The connection experience may use a larger modal because it is an occasional setup and switching task; routine chat stays compact.

## Functional contract

- The sidebar shows a conversation title, conversation, attached-note context, Skill selector, permission mode, Agent selector, composer, and new-conversation action. Status appears only when actionable or running.
- The composer selects a model and its supported reasoning effort, not a transport. A separate header settings icon opens connection setup (CLI/API).
- Desktop-native transports are preferred: Codex App Server and ACP where supported. Model APIs remain the mobile fallback.
- Markdown is rendered through Obsidian's renderer so GFM-like tables, code, internal links, and Mermaid follow the host application.
- Tool activity is grouped into one expandable execution summary per response. Failures initially expand; user expansion choices survive streaming updates.
- File changes require the explicit `允许修改` mode. Write permission stays in settings; no `仅建议` label in the composer.

## Visual language

- Use Obsidian semantic CSS variables for light/dark themes.
- Use host interface/text fonts first, then Apple and common Chinese system fonts.
- Borders are neutral and complete; do not use decorative left-edge borders.
- No gradients, glass effects, oversized hero text, or italics.
- Corner radii: 6–14 px depending on hierarchy; cards never become excessive nested containers.
- Accent color communicates focus or active work, not decoration.

## Components

### Sidebar header

- The first prompt supplies the conversation title; long titles truncate.
- No permanent provider, protocol, or unverified green connection indicator.
- Secondary icons are connection setup, history and new conversation.

### Connection center

- Responsive tile grid; selected tile uses a full neutral outline plus check badge.
- Tiles distinguish `可用`, `未连接`, native transport, and version.
- A single details region explains the selected option and the next required action.
- Primary action is disabled when the option cannot run; errors must explain how to recover.

### Messages and tools

- User prompts use one restrained tinted surface; assistant answers are flat.
- Markdown typography has generous line height and overflow protection for code, Mermaid, and tables.
- Tool calls use native `details/summary` controls with status icons and concise labels.

### Composer

- A single outlined composer contains removable file/image context chips, text input, and a bottom toolbar for attachments, Skill, permission, model, reasoning effort and send/stop.
- Model selection opens a host dropdown anchored to its trigger, not a modal. Manual ID entry remains a separate explicit action. Capability lists come from Codex model/list or ACP configOptions.
- `/` at the start of a single-line draft opens searchable Prompt choices. Enter inserts rather than sends; Escape keeps the draft; IME composition never submits. Custom templates can be created/edited/copied/deleted through the menu.
- `@` at a token boundary opens the native vault file picker. Upload, paste and drop share attachment ingestion and limits (6 files, 5 MB each, 10 MB total). Unsupported inputs retain the draft and display an actionable error.
- Reading older content disables automatic scroll-follow; returning near the bottom resumes it.
- Enter sends; Shift+Enter inserts a line break.
- No permanent permission selector in the composer. Permissions remain in settings; removing a label never grants write access. Reasoning effort is muted text without a brain icon.
- Model navigation stays in one anchored popover: search, keyboard navigation, checked selection, loading/error/retry, manual ID, and a fixed model-management footer. Management reuses host settings; no second native model menu.
- Quiet input: a stable neutral 1px border, 20px radius, no hover background/ring or focus-within border jump. Keyboard-visible textarea focus has a restrained outline.
- The left plus opens attachment/note/Skill actions; the right model chip opens a compact non-modal popover containing model selection and supported discrete effort levels. Escape restores focus; outside click and Tab departure dismiss. No hover-only controls.
- User messages have a restrained neutral 18px bubble capped at 90% width; assistant Markdown remains flat with 28px inter-message spacing. Preserve Chinese system fonts and host theme variables.

### Reply actions and persistence

- Reply action buttons are Lucide icons only: Copy, CalendarPlus, FilePlus2. Accessible names and targeted tooltips are retained per the user's explicit icon requirement.
- File append shows an exact path and Markdown preview before committing. It uses Vault.process and offers conservative undo, refusing to overwrite edits in the affected prefix. Manual user writes are distinct from AI tool permission mode.
- Daily target resolution and creation use official Obsidian CLI so host folder/date/template settings remain authoritative. Mobile users can append to an explicitly selected Markdown file; daily CLI actions require desktop.
- New conversations archive the previous transcript instead of discarding it. Persistence retains attachment snapshots (local plugin data); they are not encrypted separately from Obsidian storage.
- Reused AI Elements composition and Apache notices are recorded in THIRD_PARTY_NOTICES.md. Wiki links use the host renderer. Complete Mermaid fences use a local renderer in an opaque-origin iframe (scripts only, no same-origin, network, popup, top navigation, or vault access); vault trust settings stay unchanged. Source is available in a collapsed disclosure.

### September 20 interaction polish

- Functional contract: read diagrams without an execution step; choose a model beside the composer; keep permission out of the everyday toolbar.
- Dials unchanged: restrained variation 5, minimal motion 3, compact density 6. No new decorative assets.
- Notion reference DNA: flat reading surface, 1px neutral boundaries, 8px spacing; translate through existing Obsidian theme variables rather than copying brand colors/fonts.
- Deliberate details: anchored menu, checked current model, theme-aware diagrams, collapsible source, visible focus, Chinese system fonts, bounded mobile controls.

## Responsive behavior

- At narrow widths, connection cards form two columns and nonessential status copy disappears.
- No hover-only interaction may be required.
- Desktop local CLI features are presented as unavailable on mobile; API remains usable.

## Do / do not

- Do preserve theme compatibility, keyboard focus, and readable Chinese typography.
- Do provide specific recovery guidance for missing CLI/API configuration.
- Do not display provider setup controls in the permanent sidebar.
- Do not silently auto-approve unexpected permission requests.
- Do not copy AGPL implementation code into this MIT project; protocol behavior may be independently implemented from public specifications.
