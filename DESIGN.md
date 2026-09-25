# Qiaomu Agent design system

## Direction

Selected direction: **A — Codex 静流**, confirmed 2026-09-20. Dials: variance 5, motion 3, density 6.

Build brief: make conversation the primary surface in a narrow Obsidian sidebar. Translate Codex's quiet transcript and unified composer, and ZCode's inspectable execution process, into host-native controls. No promotional assets, duplicate identities, permanent protocol labels, or simulated review/undo controls. Success means readable Chinese text, compact inspectable tools, stable streaming scroll, and one coherent input surface. Research sources are recorded in `docs/research/ai-sidebar-interface-patterns-2026-09-20.md`.

The chat sidebar should feel like a focused part of Obsidian, not an embedded web dashboard. The connection experience may use a larger modal because it is an occasional setup and switching task; routine chat stays compact.

## Functional contract

- The sidebar shows a conversation title, conversation, attached-note context, Skill selector, permission mode, Agent selector, composer, and new-conversation action. Status appears only when actionable or running.
- The composer selects a model and its supported reasoning effort, not a transport. A separate header settings icon opens connection setup (CLI/API).
- Desktop-native transports are preferred: Codex App Server and ACP where supported. Model APIs remain the mobile fallback.
- On desktop, API chats may read a user-supplied public HTTP/HTTPS page, Markdown/text/JSON, or RSS/Atom/XML feed through a bounded, read-only tool. Internal `obsidian://` links are not public web pages; reading context passed by Qiaomu RSS/Reader supplies the article body. A failed read reports its specific cause.
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
- Reply typography: 15px body at 1.75 line height (Chinese needs more leading than Latin, per W3C clreq), paragraph gaps near half a line, headings capped at 1.3em, 1.4em list indent, CJK–Latin autospace, no fake italic for Chinese. Links keep neutral ink with a faint 1px underline; internal links show the note name, open in place (Cmd/Ctrl or middle click opens a new tab), and unresolved ones use a dashed underline. Quotes use a quiet surface instead of a side rule.

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
- Plugin-owned settings use a Vercel-inspired neutral scale: light ink `#171717`, line `#e5e5e5`, quiet surface `#fafafa`, dark equivalents, and a quiet one-pixel keyboard focus change. Inputs keep stable borders and surfaces on hover; no double borders or focus glow. No purple control accent. `--qa-*` variables stay within the plugin; Chinese uses system fonts and mobile targets remain at least 44px.
- AI Elements [Model Selector](https://elements.ai-sdk.dev/components/model-selector) was reviewed on 2026-09-25. Its search, source grouping, and keyboard pattern match the existing React chat picker. The settings screen uses Obsidian Modal and does not copy the React/cmdk/Tailwind component. No new third-party code or license is introduced.

### Model settings redesign (September 26)

- One page, no tabs inside tabs: 模型服务 first, then 本机 Agent on desktop. Each section has a title, one line of purpose and its own action (添加服务商 / 重新检测) as an outlined icon+text button.
- Source rows sit in one bordered list. The row opens details; the host switch on the right decides whether the source appears in the composer's model menu, and its accessible name says so. A hidden source dims. The subline states the next step when one is needed (需要 API Key, 尚未启用模型) in the warning color.
- Provider details are a single page: 连接 (API Key shown masked with a replace field, endpoint, 验证并保存 enabled only after an edit), then 模型 (刷新列表, 测试, search when there are more than 8, 已启用 before 可启用, a switch per model, 设为默认 and a parameters icon on enabled rows, inline manual ID entry). Removal is a two-step footer action. Switches apply immediately; there is no 完成 button (NN/g toggle guidance).
- Model parameters open in place with the back control inside the title row. Only information the vendor reported is shown; each option says what 自动 or an empty field resolves to.
- The provider chooser groups presets into 海外, 国内, 聚合平台 and 本地与自定义, left-aligned with logos; Enter picks the first match. After a successful connection the provider page opens so the user can choose models.

### Composer toolbar (September 26)

- Access is icon-only (Shield, FolderPen, ShieldAlert); full access keeps a warning tint. The level lives in the accessible name and the host tooltip.
- The toolbar never wraps. It sizes against the composer's own width with a container query: below 330 px the reasoning label hides, below 250 px the model name hides and only the brand icon and chevron remain. The model name truncates before either happens.

### Settings navigation and About (September 25)

- The settings header is a compact identity row with a Lucide tree and a stable, understated tab bar. The active tab uses an underline; there is no large header card or nested segmented surface.
- About opens with one version card: a muted 当前版本 label over a large version number, with outlined link buttons for changelog, bug reports and the guide. It does not repeat the product name, since the settings header already shows it. Below it, the Official Account and tip QR codes are always visible in two equal neutral cards, each on a white plate so they stay scannable in dark themes. A quiet footer holds the author links plus one line each for privacy and license. A container query (not a viewport query) lets the actions wrap and stacks the QR cards below 420 px of the settings pane's width.
- This follows the Qiaomu AI RSS settings content inventory and Apple HIG guidance on grouped layout, stable settings navigation, and progressive disclosure (reviewed 2026-09-25): https://developer.apple.com/design/human-interface-guidelines/settings , https://developer.apple.com/design/human-interface-guidelines/layout , https://developer.apple.com/design/human-interface-guidelines/disclosure-controls .

### Search and external content (September 25)

- OpenAI Responses, Anthropic Messages, Gemini, and xAI Responses use their documented native search tools. OpenRouter uses its server-side web search and fetch tools with the existing OpenRouter key. Native source URLs are retained in the answer. An API model without native search can use the user's Brave Search key, kept only in Obsidian SecretStorage; the model never receives that key. The tool is configured in 工具 → 联网搜索.
- The shared page reader accepts public HTTP/HTTPS HTML, plain text, Markdown, JSON, RSS, Atom, and XML. Every redirect is revalidated, DNS is resolved before connecting and the public IPv4 address is pinned; localhost and private addresses remain inaccessible. Reading a URL does not itself provide keyword search.
- Provider tools can incur vendor charges. The tool loops are bounded, and external text is treated as untrusted material. A model with no search backend must say it cannot verify current information rather than claim it searched.
- API chats can also search and read Markdown in the current vault without write access. `obsidian://open` and Wiki links resolve to vault notes; plugin action URLs need their source plugin to pass a reading snapshot. Vault search is capped at 2,000 files and eight results, with an explicit incomplete flag.
- References: https://platform.openai.com/docs/quickstart/make-your-first-api-request , https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/web-search-tool , https://ai.google.dev/gemini-api/docs/google-search , https://docs.x.ai/developers/tools/web-search , https://openrouter.ai/docs/guides/features/server-tools/web-search , https://api-dashboard.search.brave.com/documentation/guides/authentication .
- Model setup has two tabs: model services and detected local Agents. The connected-service heading has an add icon; an empty list also offers an “添加服务商” button. CLI detection must not imply sign-in.
- Adding a provider stays in one searchable Obsidian modal: choose the brand, then enter its API Key and connect. Ollama and custom endpoints appear at the end of this chooser; Ollama needs no key. Existing connections remain continuous rows with quiet hover and a right-hand chevron; visibility switches are separate. Model rows use separators instead of nested cards, with chevrons for details. A small native modal adds a custom model ID.
- The Agent view and ribbon use Lucide `tree-deciduous`, matching the Qiaomu name without implying a magic action.
- Settings follow the RSS plugin's calm rhythm: one neutral title/navigation surface, short grouped rows, and right-aligned controls. Keep visible text to names, values, actionable errors, and necessary privacy/permission consequences. Put system Prompt, custom models, endpoints, and parameter overrides behind disclosures; avoid repeated headings and success explanations.

### Chat and tools settings (September 26)

- 对话 has three titled sections in the same bordered lists as 模型: 外观 (live preview of chat and code text, then font, size, code font, code size), 默认行为 (file access with a one-line consequence per level; choosing full access here shows the same one-time explanation as the composer), and a disclosure for the system Prompt (full-width, with 恢复默认) and quick prompts (one input per line, Enter adds the next, at most 8).
- Chat font choices: system default, Obsidian interface font, note text font (the description names the resolved family), fonts declared through `@font-face` by themes, snippets and plugins (read from `document.fonts`, icon/math faces excluded — e.g. 朱雀仿宋 from a font plugin), installed common Chinese system fonts (canvas-metric detection over a fixed list, not the permission-gated Local Font Access API), and a free-text family. A custom family is stored by name with the system stack as fallback; if it disappears the setting says so in the warning color. Native `<select>` options cannot render in their own font, so the preview block carries that job. Code text can follow `--font-monospace`.
- 工具 is 搜索 / Obsidian CLI / 扩展. Rows open detail pages with a chevron and state in the subline (counts, next step). No text buttons such as 设置 or 管理.
- Skills and tool connections open as a single page for the row that was chosen; tabs appear only when opened from the command palette. Adding happens in place with a back control in the title row. Skills are grouped by source with a count of enabled ones; paths live in the tooltip; import can pick a folder. Tool connections list Qiaomu entries first (switch plus an overflow menu with 加入 Codex and a two-step 移除), then Codex's read-only list, then the JSON editor. Errors are inline, not notices.
