# Qiaomu Context Protocol v1

Date: 2026-09-25. Status: sources implemented in Qiaomu RSS (`claude/agent-api`, 36885e6) and Qiaomu Reader (`claude/agent-api`, cc3992d); agent-side modules in `src/integrations/` with tests, wiring below still to do.

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
- Discovery: `app.plugins.plugins[id]`, checked at the moment of use and never cached. Protocol name and exact version must match; anything else counts as "not installed", so a future version cannot half-work.

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

The setting row appears only while the agent is installed. `saveProgress()` fires the change event on every page turn.

## Ask AI button design

- Icon: Lucide `sparkles` everywhere, matching Qiaomu Reader's existing AI action and the agent's ribbon icon, so "AI" reads the same across the family. Not a brand logo: the action is "ask AI about this", not "open another app".
- Label: "问 AI" as the accessible name and hover hint; icon-only in popups, like the neighbouring actions.
- Position: after existing capture actions in RSS, so current muscle memory is kept; in the context menu under a separator.
- Presence: shown only when it works. No disabled button, no install nag while reading.
- Composer chip on the agent side: kind icon (`Newspaper` article, `BookOpen` book, `FileText` document, `Globe` page) or `TextSelect` when a passage is selected, label from `readingLabel()` ("选中 128 字 · 标题" / "乔木 RSS · 标题"), remove button with accessible name "不附加正在阅读的内容", title attribute with source and location.

## Agent wiring (to do, in files currently owned by the Codex thread)

All logic lives in `src/integrations/`; wiring is about 40 lines:

1. `types.ts`: add `reading?: ContextSnapshot` to `ChatRequest`.
2. `main.ts` `onload`:
   ```ts
   this.reading = this.addChild(new ReadingContextService(this.app, VIEW_TYPE_QIAOMU_AGENT, () => this.eachView((v) => v.refreshControls())));
   this.api = createAgentApi({ pin: (s) => this.reading.pin(s), open: (prompt) => this.activateView(prompt) });
   ```
   Declare `api` as a public field so other plugins find it at `plugins["qiaomu-agent"].api`.
3. `chat-view.ts` request builder: `const reading = imageEdit ? null : this.plugin.reading.current();` then `reading: reading ?? undefined` in the request; after a successful send call `this.plugin.reading.consumed()`. Pass `reading` and `onDismissReading: () => this.plugin.reading.dismiss()` to the panel.
4. `chat-panel.tsx`: render the reading chip in `PromptInputHeader` next to the note and selection chips (design above).
5. `api-backend.ts` `buildApiMessages` and `cli-profiles.ts`: after the selection block, `const reading = readingBlock(request.reading); if (reading) sections.push(reading);`.
6. `agent-prompt.ts`: append `READING_CONVENTIONS` to `OBSIDIAN_CONVENTIONS` (keeps the cached prefix stable).
7. Native agent backends that assemble their own prompt: same as step 5.

Acceptance: RSS selection → 问 AI opens the agent with the chip, question answered with the quote; switching articles updates the chip; removing the chip keeps it removed until the article or selection changes; PDF and web viewer show their chips; a selection in another plugin view survives focusing the composer; with the agent disabled, RSS and Reader show no new UI.

## Opening it to other plugins

Any plugin can join by copying `qiaomu-context.ts`, setting `qiaomuContext` and firing the change event. Candidates, in order of value:

1. Core views (done as built-in adapters): PDF, web viewer. Next: Canvas (selected nodes' text), Bases (current view rows).
2. Popular reading plugins without the protocol: Excalidraw (selected text elements), Kindle / Readwise / Zotero imports (these already produce Markdown notes and work through the note path).
3. Tool-style plugins are a different integration: Dataview queries, Tasks, Templater and Calendar are better exposed to the agent as tools or MCP servers than as reading context.

Publish the spec in the agent README once the agent is released, with `obsidian://show-plugin?id=qiaomu-agent` as the install link from other plugins' settings.
