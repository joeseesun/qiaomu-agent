# Video-inspired composer polish

User direction: quiet input without hover highlight, Lucide instead of brain emoji, learn Codex/ZCode interactions. This is refinement of the selected A direction, not a new visual direction.

## References and reuse

- Reviewed the supplied Codex/ZCode recordings. Extracted anchored model controls, discrete effort adjustment, consolidated plus actions, neutral user bubbles and flat assistant answers. No branded assets or implementation copied.
- Reviewed https://elements.ai-sdk.dev/components/prompt-input and https://elements.ai-sdk.dev/components/model-selector on 2026-09-20. Retained existing Apache-2.0 AI Elements-adapted composer/message components and notices. The catalog's dialog selector is not copied: the user's anchored-control requirement uses an independently implemented leaf-local non-modal popover plus Obsidian's existing model menu.
- Notion design reference contributes flat content, neutral 1px boundaries and 8px spacing, translated through host CSS variables. No web fonts or new dependencies.

## Implementation

- Stable 20px composer outline with no hover background/ring; keyboard-visible input focus remains identifiable.
- Lucide Brain and current effort in model trigger; popover contains model submenu and native discrete range control restricted to actual capability values plus default.
- Plus actions: upload, vault file, current note and Skill. Existing attachment, permission and persistence behavior remains intact.
- Escape restores trigger focus; outside pointer and Tab departure dismiss; loading closes model controls; listeners are owner-document scoped and cleaned up.
- Neutral user bubbles (90% maximum width, 18px radius); assistant text stays unboxed, messages separated by 28px.

## Verification boundary

- Typecheck, Vitest and production bundle; actual rockfish desktop plugin reload, model submenu, plus menu and screenshot review.
- First screenshot exposed generated CSS being overwritten during build; fixed source `src/chat-ui.css`, rebuilt/reinstalled, reviewed second pass.
- 360px touch-class simulation: width and scrollWidth both 360; popover remains inside leaf. This is not iOS/Android device validation.
- No model prompt or note write was issued for this UI test. Speed/service-tier backend wiring is not part of this patch; no decorative speed switch is exposed.
