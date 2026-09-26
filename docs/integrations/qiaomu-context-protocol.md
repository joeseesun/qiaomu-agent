# Qiaomu Context Protocol v1

Date: 2026-09-25. Status: implemented end to end. Agent `claude/integrations`; Qiaomu RSS and Qiaomu Reader `claude/agent-api`. Verified in Obsidian (see Verification).

## Why

The user reads in many places: Qiaomu RSS articles, Qiaomu Reader books and PDFs, the core PDF view, the core web viewer, and third-party plugin views. Qiaomu Agent should know what is being read and what is selected, without exporting Markdown first. Each plugin must keep working alone, and no plugin may depend on another at build or run time.

## Shape

```text
 Source plugin                                   Qiaomu Agent
 plugin.qiaomuContext = {                        plugin.api = {
   protocol: "qiaomu-context", version: 1,         protocol: "qiaomu-agent", version: 1,
   snapshot(leaf) -> ContextSnapshot | null        ask({ context, prompt? })   // opens agent, pins context
 }                                               }
 workspace.trigger("qiaomu-context:changed", id)  ──▶ agent re-reads the snapshot
```

- Pull: the agent tracks the most recent reading leaf (main area, not sidebars, not itself) and asks every compatible provider for a snapshot of it. First non-null wins.
- Push: a source's own "Ask AI" action calls `agent.ask({ context })`. That context is pinned until the next message is sent or the user removes it.
- Fallback: without a provider, built-in adapters cover the core PDF view (file, page of the selection), the core web viewer (http(s) URL and title) and a text selection in any other view. The agent keeps the last DOM selection inside the reading leaf, because it disappears when focus moves to the composer.
- Reading leaf: the most recent main-area leaf that is not a note, sidebar or the agent. It stays the reading context while it is visible, so reading in one pane and writing in another keeps the article; a background tab or a closed pane stops counting.
- Discovery: `app.plugins.plugins[id]`, checked at the moment of use and never cached. Protocol name and exact version must match; anything else counts as "not installed", so a future version cannot half-work.
- Versioning: v1 may gain optional fields and optional methods (for example a future `reveal(anchor)` to jump back to a quoted passage). Consumers feature-detect them and ignore unknown ones. Only breaking changes raise the version.
- Extending the agent: built-in adapters are a list (`BUILTIN_ADAPTERS` in `reading-context.ts`); supporting another view type is one `ContextAdapter` object.

The canonical definitions are `src/integrations/qiaomu-context.ts` (copy it unchanged into TypeScript plugins) and the JavaScript port `qiaomu-reader/src/qiaomu-context.js`.

## Snapshot

| Field | Meaning |
| --- | --- |
| `sourceId`, `sourceName` | Plugin id and display name, e.g. `qiaomu-ai-rss`, "乔木 RSS" |
| `kind` | `article`, `book`, `document`, `page` or `other` |
| `title` | Required, shown on the composer chip |
| `url` | http(s) only; anything else is dropped |
| `path` | Vault path when the content is a vault file (the agent may then read it with tools) |
| `author`, `published`, `location` | Optional metadata; `location` is chapter, page or reading version |
| `text`, `truncated` | Readable body, at most 60,000 characters, cut on a sentence boundary |
| `selection` | `{ text, location? }`, at most 20,000 characters |

The agent sanitizes every snapshot again (`sanitize()`): strings only, bounded lengths, known kinds, safe URLs.

## Security and privacy

- Snapshot content is untrusted third-party text. The prompt wraps it in `<reading>` / `<reading_selection>`, escapes closing tags inside it, and the system prompt says to treat it as material, never as instructions (`READING_CONVENTIONS`). This matters for web articles written to hijack agents.
- The agent never sends on its own: `ask()` only attaches context and focuses the composer.
- `compose({ prompt, submit? })` (optional v1 method, added for Qiaomu Home): starts a fresh conversation with the draft and no attached context. It sends only when `submit: true`, which a caller may pass only when the user already pressed send in the caller's own UI (Home's search box with `⌘↵`). The prompt is trimmed and capped at 4,000 characters. Check `typeof api.compose === "function"` before calling; older Agent versions do not have it.
- The reading chip is visible and removable before sending, like the note and selection chips. Nothing is attached silently.
- Sources hand over only what is on screen or selected. No credentials, no library-wide data.

## Source behavior implemented

**Qiaomu RSS**: provider returns the article as currently rendered (original, rewrite or translation; `location` is the version label). "问 AI" (Lucide `sparkles`) is appended to the selection popup and the article context menu only while a compatible agent is enabled. Localized in all eight RSS languages. `renderReader()` fires the change event.

**Qiaomu Reader**: provider returns the open book with the current page text (EPUB) or the condensed full text (PDF, `truncated` from the PDF context). The existing "问 AI" button is unchanged; routing decides who answers:

| Setting `aiAssistant` | Built-in AI ready | Answers |
| --- | --- | --- |
| `auto` (default) | yes | Built-in AI (existing users see no change) |
| `auto` | no | Qiaomu Agent, so no second API key is needed |
| `agent` | any | Qiaomu Agent |
| `builtin` | any | Built-in AI |

The setting row appears only while the agent is installed. `saveProgress()` fires the change event on every page turn. While the agent answers, opening a book no longer auto-opens the built-in AI companion panel, so two AI sidebars never compete.

## Ask AI button design

- Icon: Lucide `sparkles` everywhere, matching Qiaomu Reader's existing AI action and the agent's ribbon icon, so "AI" reads the same across the family. Not a brand logo: the action is "ask AI about this", not "open another app".
- Label: "问 AI" as the accessible name and hover hint; icon-only in popups, like the neighbouring actions.
- Position: after existing capture actions in RSS, so current muscle memory is kept; in the context menu under a separator.
- Presence: shown only when it works. No disabled button, no install nag while reading.
- Composer chip on the agent side: kind icon (`Newspaper` article, `BookOpen` book, `FileText` document, `Globe` page) or `TextSelect` when a passage is selected, label from `readingLabel()` ("选中 128 字 · 标题" / "乔木 RSS · 标题"), remove button with accessible name "不附加正在阅读的内容", title attribute with source and location.

## Agent wiring (done)

- `main.ts`: `reading` (ReadingContextService, a child component) and the public `api` (createAgentApi).
- `chat-view.ts`: captures `reading.current()` with the other inputs before the first await, uses a handed-over context once, renders the chip; `focusComposer()` focuses without replacing a draft.
- `chat-panel.tsx`: reading chip in the prompt header with kind icon, preview tooltip and remove button.
- `api-backend.ts`, `cli-profiles.ts` (CLI, native agents, ZCode): reading block after the selection block. The "material, not instructions" line sits inside the block, so native sessions that send the system prompt only on the first turn still get it.
- `agent-prompt.ts`: `READING_CONVENTIONS` appended to the stable conventions.

## Verification (2026-09-25, Obsidian desktop, test vault)

- RSS article → provider snapshot (title, URL, reading version, 877 chars) → agent sees it.
- Select a paragraph → popup shows 追加到今日日记 / 追加到当前笔记 / 问 AI → click → chip "选中 55 字 · datasette 1.0a41", composer focused. A real model reply quoted the title and summarized the selection.
- Reader PDF → snapshot (document, 7 pages, 4037 chars). Built-in AI unset, route auto → Ask AI goes to the agent; selecting text in the PDF and pressing the toolbar AI button hands over the selection; the built-in companion no longer auto-opens.
- Agent disabled → RSS popup back to two actions; Reader routes to built-in; no errors captured.
- Not verified: mobile, EPUB page turns, the Reader settings row visually, web viewer and core PDF adapters in the host.

## Opening it to other plugins

Any plugin can join by copying `qiaomu-context.ts`, setting `qiaomuContext` and firing the change event. Candidates, in order of value:

1. Core views (done as built-in adapters): PDF, web viewer. Next: Canvas (selected nodes' text), Bases (current view rows).
2. Popular reading plugins without the protocol: Excalidraw (selected text elements), Kindle / Readwise / Zotero imports (these already produce Markdown notes and work through the note path).
3. Tool-style plugins are a different integration: Dataview queries, Tasks, Templater and Calendar are better exposed to the agent as tools or MCP servers than as reading context.

Publish the spec in the agent README once the agent is released, with `obsidian://show-plugin?id=qiaomu-agent` as the install link from other plugins' settings.

## Sibling protocol: Qiaomu Home

The start page 乔木Home uses a second, independent protocol, `plugin.qiaomuHome` (`qiaomu-home` v1), for "what can the user resume, create or find". Qiaomu Agent implements it in `src/integrations/home.ts` (recent conversations, a new-conversation action, title search). Spec: `docs/qiaomu-home-protocol.md` in the qiaomu-home repository.
