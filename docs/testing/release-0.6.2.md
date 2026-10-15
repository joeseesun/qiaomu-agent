# 0.6.2 acceptance

Date: 2026-10-15 (Asia/Shanghai). Scope: shadcn Trace and Code Block host adaptations. Baseline: origin/main 0e4c730; the separate current-note insertion branch is not included.

- Final typecheck/test/build: 428 tests passed, one pre-existing skip, including the additional streaming disclosure regression. Production dependency audit: zero findings, no new dependencies. Existing dev-only audit findings are outside this UI change.
- Isolated macOS Obsidian 1.14.4, dedicated profile and synthetic vault `/tmp/qiaomu-ai-elements-qa`; installed the production build, loaded the real ChatView, and injected deterministic AgentMessage fixtures into its existing chat state. This verifies actual host rendering, not a new live provider call.
- Light/dark at 300/360/760px: content width equals scrollWidth (300/360/760). Long output scrolls locally (234/294/694px viewport, 3037px unwrapped content). Wrapping brings content back to viewport width. No captured window errors or unhandled rejections.
- Visually inspected collapsed chat and expanded output screenshots. Header icons have equal 28px desktop targets; touch CSS provides 40px targets (not physical-device verification). Keyboard focus has a visible outline; native Space closes and Enter opens the focused output disclosure. Initial incomplete CDP Enter events lacked character text; full key events verified native behavior.
- Actual Electron clipboard equals raw output byte-for-byte including tabs, blank lines, literal HTML and final newline; prior text clipboard restored. Output remains inert text. Unit coverage checks rejected clipboard write/retry and late asynchronous completion after content changes.
- Existing timeline tests cover pending approval/question visibility, failure recovery and completion folding. Existing question/append/transport tests remain part of the full suite. Markdown and diff/undo implementations are unchanged.

Release gates still require final candidate SHA, official preview scan, frozen draft asset checks, fresh/upgrade installation and anonymous public asset verification. Those results are recorded in the release handoff; this file does not claim a scan or publication completed before it happened.
