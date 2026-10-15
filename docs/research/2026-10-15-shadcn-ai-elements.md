# shadcn AI Elements adoption — 2026-10-15

Scope: execution-record presentation in the Obsidian Agent sidebar. State remains owned by existing AgentMessage data parts; no provider, permission, vault-write or conversation schema changes.

## Sources and decision

- [October announcement](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements): shadcn AI Elements replaces AI SDK Elements; existing copied components remain usable.
- [Trace](https://ui.shadcn.com/docs/components/base/trace) and [Code Block](https://ui.shadcn.com/docs/components/base/code-block): selected source adapted from shadcn-ui/ui `c2477f311c19982ef6e246085438e6cfec3e35ea`, MIT. Source paths: `apps/v4/registry/bases/base/ui/{trace,code-block}.tsx`. Full attribution is in THIRD_PARTY_NOTICES.md.
- [Message Scroller](https://ui.shadcn.com/docs/react/message-scroller) and [Questionnaire](https://ui.shadcn.com/docs/components/base/questionnaire): evaluated, not installed. At the pinned commit, `packages/react/package.json` version 0.3.1 declares `react >=19` and optional `@types/react >=19`; the plugin is on React 18.3.1. A forced dependency install is not a compatibility test.

## Reuse matrix

| Surface | Decision | Host requirements |
| --- | --- | --- |
| Execution rows | Adapt Trace composition and slots | Preserve native disclosure, grouped exploration, completed folding and Chinese status labels |
| Tool output | Adapt Code Block/header/content | Literal text, exact raw copy, errors/retry, wrap toggle and bounded keyboard scrolling; no new highlighter |
| Markdown replies / diffs | Retain host renderer / existing review UI | Wiki links, Mermaid, raw copy/append, tracked diff and undo semantics stay authoritative |
| Message Scroller | Retain use-stick-to-bottom 1.1.6 | A later React migration must compare live-edge follow, reader scroll-away, streamed resize, async Markdown/images, reopen, history prepend and pop-out windows |
| Questionnaire | Retain QuestionCard | A later migration must preserve per-transport answers, secret redaction, single/multiple/freeform, skip, submit-once, IME, focus and shortcuts |

The new components are presentation, not execution backends. Preserve pending questions and approvals outside collapsed work, cancelled vs failed status, and failed-attempt details after recovery. Do not infer an operation succeeded from a rendered Trace row.

## Verification plan

Run existing timeline/question/transport/append tests and full project checks. Add behavioral coverage for output raw copy (blank lines, tabs, markup), copy rejection/retry, stale asynchronous completion, wrap state and independently expanded steps during streaming. In a dedicated synthetic Obsidian vault verify light/dark, 300/360/760px panes, long output, native keyboard disclosure, focus, actual clipboard, and plugin load/upgrade. Official preview scan, release assets and publication remain separate gates.
