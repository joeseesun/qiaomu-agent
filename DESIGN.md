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
- User messages show a quiet timestamp with copy and edit actions. Editing happens in place; resubmitting truncates the later branch, resets the Agent session and regenerates from the edited message.
- File changes require an explicit access choice. A dedicated shield control offers read-only, current-vault write, and desktop-only full filesystem access; no `仅建议` label is permanently shown in the composer.

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
- Access is a compact Lucide shield control in the composer footer. Its icon reflects the active scope, while the anchored menu names read-only, current-vault write and desktop-only full access with a checked choice; removing persistent text never grants write access. Reasoning effort is muted text without a brain icon.
- Model navigation stays in one anchored popover: search, keyboard navigation, checked selection, loading/error/retry, manual ID, and a fixed model-management footer. Management reuses host settings; no second native model menu.
- Quiet input: a stable neutral 1px border, 20px radius, no hover background/ring or focus-within border jump. Keyboard-visible textarea focus has a restrained outline.
- The left plus opens attachment/note/Skill actions; its adjacent shield opens access scope; the right model chip opens a compact non-modal popover containing model selection and supported discrete effort levels. Escape restores focus; outside click and Tab departure dismiss. No hover-only controls.
- User messages have a restrained neutral 18px bubble capped at 90% width; assistant Markdown remains flat with 28px inter-message spacing. Preserve Chinese system fonts and host theme variables.

### Reply actions and persistence

- Reply action buttons are Lucide icons only: Copy, CalendarPlus, FilePlus2. Accessible names and targeted tooltips are retained per the user's explicit icon requirement.
- Assistant reply actions stay hidden until pointer hover or keyboard focus on desktop; touch devices keep them visible. User-message time, copy and edit remain visible below the bubble.
- File append shows an exact path and Markdown preview before committing. It uses Vault.process and offers conservative undo, refusing to overwrite edits in the affected prefix. Manual user writes are distinct from AI tool permission mode.
- Daily target resolution and creation use official Obsidian CLI so host folder/date/template settings remain authoritative. Mobile users can append to an explicitly selected Markdown file; daily CLI actions require desktop.
- New conversations archive the previous transcript instead of discarding it. Persistence retains attachment snapshots (local plugin data); they are not encrypted separately from Obsidian storage.
- Reused AI Elements composition and Apache notices are recorded in THIRD_PARTY_NOTICES.md. Wiki links use the host renderer. Complete Mermaid fences are rendered by Obsidian's own Mermaid (`loadMermaid()`, themed per diagram) and shown as an inert SVG image: no scripts, links or vault access; vault trust settings stay unchanged. Nothing Mermaid-related is bundled. Source is available in a collapsed disclosure.

### September 20 interaction polish

- Functional contract: read diagrams without an execution step; choose a model beside the composer; keep permission out of the everyday toolbar.
- Dials unchanged: restrained variation 5, minimal motion 3, compact density 6. No new decorative assets.
- Notion reference DNA: flat reading surface, 1px neutral boundaries, 8px spacing; translate through existing Obsidian theme variables rather than copying brand colors/fonts.
- Deliberate details: anchored menu, checked current model, theme-aware diagrams, collapsible source, visible focus, Chinese system fonts, bounded mobile controls.

### Settings

- Follow Qiaomu Reader's task-based progressive disclosure: top-level tabs are 模型、对话、工具; the default 模型 page puts connection choice first and folds API fallback details until requested.
- Selecting 模型 API reveals provider, key and model immediately. Protocol, Base URL, MCP and filesystem paths remain under advanced disclosures.
- Connection success is not a persistent chat message; only running, interruption and actionable error states may occupy the composer status area.

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

### WeChat draft publishing

- Entry: command palette and file menu (Lucide `send`). The reply action bar keeps its three icons.
- A host Modal is the confirmation step: account, theme, title, author, digest, cover source, preflight checks (Lucide `circle-x` / `triangle-alert` / `info`), and a shadow-DOM preview isolated from Obsidian CSS. Publishing is disabled while any check is an error.
- Only drafts are created (`publish_now: false`). Progress is announced in a polite live region; closing the modal cancels remaining uploads.

### Models (September 24, after magpie)

- One picker for everything. The composer's model chip opens a non-modal popover: search (“筛选，或输入任意模型 ID”) on top, a vertical source rail (all, recent, each agent and provider by brand mark), and a list grouped by source with small uppercase headers. Choosing a model also chooses its source, so there is no separate connection step.
- Typing an unknown id offers “使用「id」” for the focused source. Enter picks the first match; arrows move through items.
- Local agents show “默认模型” until their list is fetched; fetching starts the agent, so it only happens when that agent is focused in the rail. Lists are cached.
- Reasoning effort is a pill row under the list, only when the chosen model reports levels.
- Settings → 模型 is two cards: local agents (installed only; missing ones collapsed into one line) and providers (brand mark, name, host · model count, masked key with a status dot, chevron). A row expands into an inline editor: key with a “获取密钥” link, model chips that choose what the picker shows, “添加模型 ID”, refresh, and the URL behind a disclosure. A failed fetch (401/403) turns the dot red with “验证失败”.
- “添加服务商” opens a searchable tile grid grouped into 国内厂商 / 海外厂商 / 聚合平台 / 本机运行, plus 自定义 (name, OpenAI or Anthropic compatible, URL). Adding asks for one field, the key, then fetches the vendor's model list.

### Safe writes (September 24)

- Every local-agent turn is tracked. Before-content comes from, in order: what the agent reports (ACP diff `oldText`), a read when the agent announces the write (Codex `item/started` fileChange, ACP edit `locations`/`rawInput`), what the agent read earlier in the turn, and snapshots taken before the turn (active note, files named in the prompt). Codex patches are reversed if our read raced the write. Vault events catch everything else, listed as untracked.
- ACP agents get `fs.readTextFile/writeTextFile`; reads and writes go through the vault (inside the vault only; writes refused in read-only mode).
- After the turn, one "修改了 N 个文件 +a −b" card: kind badge (新建/修改/删除/库外), path, per-file diff with collapsed context, open file.
- Undo is pre-checked: files still as the agent left them are restored; files edited since are listed separately and need a checkbox; untracked ones are only listed; files already back to their before-state are skipped. Created files go to the trash. Undo state is per file ("部分已恢复" → "撤销其余修改…").
- Stopped turns still get their change card (attached after the stream closes).
- Approvals: ACP `session/request_permission` and Codex approval requests become an inline card in the reply (command/paths, 允许一次 / 本次会话都允许 / 拒绝). Read-only turns reject without asking. Codex runs with `on-request` only in writable mode, so escalations (network, outside the vault) reach the user.

### Obsidian awareness (September 24)

- Every backend gets a fixed conventions block before the user's own system prompt (stable prefix): wikilink references, moves/renames through Obsidian so links update, deletes to the trash, `property:set` for frontmatter, keep Markdown/YAML/Chinese typography, and "change only the selected lines" semantics. API mode also receives the vault-root `AGENTS.md` (local agents read it themselves).
- Context blocks share one format with escaped attributes: `<active_note path>`, `<editor_selection path lines>` (1-based, inclusive).
- The editor selection in the most recent note becomes a removable composer chip ("选中 N 行 · 笔记"), refreshed when the composer gains focus; dismissing it lasts until the selection changes. While focus is in the sidebar, the selection stays visible in the note through the CSS Custom Highlight API (no document changes), cleared when the editor regains focus.

### Model settings update (September 25)

- The first screen answers “what does this chat use?” with the selected model and source. Adding an API provider is visible immediately on first use and otherwise opens on demand. Cloud providers stay visible; the longer local Agent list starts collapsed. Showing a source in the picker is separate from changing the current model.
- Provider details lead with the models available in chat. Key replacement, endpoint details, and removal follow. “Default” belongs to that provider, not every conversation.
- Plugin-owned settings use a Vercel-inspired neutral scale: light ink `#171717`, line `#e5e5e5`, quiet surface `#fafafa`, dark equivalents, and a blue keyboard focus ring. No purple control accent. `--qa-*` variables stay within the plugin; Chinese uses system fonts and mobile targets remain at least 44px.
- AI Elements [Model Selector](https://elements.ai-sdk.dev/components/model-selector) was reviewed on 2026-09-25. Its search, source grouping, and keyboard pattern match the existing React chat picker. The settings screen uses Obsidian Modal and does not copy the React/cmdk/Tailwind component. No new third-party code or license is introduced.
- Model setup has two routes in the modal: a desktop-first local Agent tab (detected programs and on-demand model reading), and an API tab (paste a key, confirm ambiguous providers, manage connected models). Each route links to the other. Detection must not imply sign-in. The interaction comparison and state wording are recorded in `docs/research/2026-09-25-model-entry-tabs.md`.
