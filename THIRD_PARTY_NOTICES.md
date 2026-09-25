# Third-party notices

## Vercel AI Elements

The components under `src/components/ai-elements/` adapt the composition and selected source patterns from [Vercel AI Elements](https://github.com/vercel/ai-elements), revision `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` (conversation, message, prompt-input, attachments).

Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0. License: https://www.apache.org/licenses/LICENSE-2.0 . A copy is included in `licenses/ai-elements-LICENSE`.

Local modifications: scoped Obsidian theme CSS instead of Tailwind/shadcn global styles; Obsidian MarkdownRenderer instead of Streamdown for vault links, with isolated Mermaid rendering; host-managed file ingestion; icon-only message actions with accessible names. File picking uses the host searchable modal; model picking uses an anchored Obsidian dropdown instead of the upstream Radix dialog. Slash suggestions reuse the input composition, with a host-specific multiline textarea keyboard adapter rather than a second command search input.

AI SDK, React, Lucide and use-stick-to-bottom are dependencies, not unmodified AI Elements widgets. Their upstream license notices remain distributed with their packages and bundled legal comments. This project remains MIT; adapted Apache-licensed portions retain their original license.

## Mermaid

Not bundled. Diagrams are rendered with the Mermaid copy that Obsidian ships (`loadMermaid()`), themed per diagram with an init directive so Obsidian's global configuration is not changed. Output is displayed only as an inert `<img>` in chat.

## Lobe Icons

`src/ui/brand-icons.ts` embeds provider and agent marks from [@lobehub/icons-static-svg](https://github.com/lobehub/lobe-icons) 1.95.1, MIT License. Local modifications: titles removed, internal ids namespaced, root `fill="currentColor"` added; Kimi uses the mono mark. Brand names and logos remain trademarks of their owners and are used only to identify the service.

Design reference only, no code copied: [magpie](https://github.com/yetone/magpie) (MIT) for the provider list, one-field provider setup and grouped model picker.
