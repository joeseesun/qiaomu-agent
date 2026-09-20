# Qiaomu Agent design system

## Direction

Selected direction: **A — Codex 静流**, confirmed 2026-09-20. Dials: variance 5, motion 3, density 6.

Build brief: make conversation the primary surface in a narrow Obsidian sidebar. Translate Codex's quiet transcript and unified composer, and ZCode's inspectable execution process, into host-native controls. No promotional assets, duplicate identities, permanent protocol labels, or simulated review/undo controls. Success means readable Chinese text, compact inspectable tools, stable streaming scroll, and one coherent input surface. Research sources are recorded in `docs/research/ai-sidebar-interface-patterns-2026-09-20.md`.

The chat sidebar should feel like a focused part of Obsidian, not an embedded web dashboard. The connection experience may use a larger modal because it is an occasional setup and switching task; routine chat stays compact.

## Functional contract

- The sidebar shows a conversation title, conversation, attached-note context, Skill selector, permission mode, Agent selector, composer, and new-conversation action. Status appears only when actionable or running.
- Clicking the active Agent opens the connection center. Provider cards expose availability, native transport, and version without permanently occupying sidebar space.
- Desktop-native transports are preferred: Codex App Server and ACP where supported. Model APIs remain the mobile fallback.
- Markdown is rendered through Obsidian's renderer so GFM-like tables, code, internal links, and Mermaid follow the host application.
- Tool activity is grouped into one expandable execution summary per response. Failures initially expand; user expansion choices survive streaming updates.
- File changes require the explicit `允许修改` mode. `仅建议` remains the default-safe posture.

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
- The only persistent secondary action is new conversation.

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

- A single outlined composer contains context chips, text input, and a bottom toolbar for Skill, permission, Agent and send/stop.
- Agent selection opens the existing connection center. Context only appears when an actual note is attached.
- Reading older content disables automatic scroll-follow; returning near the bottom resumes it.
- Enter sends; Shift+Enter inserts a line break.
- The permission selector uses plain-language Chinese labels.

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
