# Third-party notices

## Vercel AI Elements

The components under `src/components/ai-elements/` adapt the composition and selected source patterns from [Vercel AI Elements](https://github.com/vercel/ai-elements), revision `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` (conversation, message, prompt-input, attachments).

Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0. License: https://www.apache.org/licenses/LICENSE-2.0 . A copy is included in `licenses/ai-elements-LICENSE`.

Local modifications: scoped Obsidian theme CSS instead of Tailwind/shadcn global styles; Obsidian MarkdownRenderer instead of Streamdown to preserve vault links and Mermaid; host-managed file ingestion; icon-only message actions with accessible names. The host file/model pickers use Obsidian's native searchable modal rather than the upstream Radix dialog to preserve multi-window focus and native keyboard behavior. Slash suggestions reuse the input composition, with a host-specific multiline textarea keyboard adapter rather than a second command search input.

AI SDK, React, Lucide and use-stick-to-bottom are dependencies, not unmodified AI Elements widgets. Their upstream license notices remain distributed with their packages and bundled legal comments. This project remains MIT; adapted Apache-licensed portions retain their original license.
