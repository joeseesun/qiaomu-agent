# 0.6.3 acceptance

Date: 2026-10-17 (Asia/Shanghai). Baseline: origin/main 78330d0. Integrates PR #45 at 43058c9 while preserving its original commits and authors.

## Review and corrections

- Reproduced the private-HTTP save failure through `addProviderConnection`: the original chooser accepted consent but the persistence helper rejected the URL.
- Reproduced public DNS names (including `fda.gov` and `feature.example.com`) being classified as private IPv6. IPv6 now requires an actual valid literal before prefix classification.
- Added exact saved endpoint consent, propagated through provider selection, reload and API requests. Changing a URL clears the checkbox; requests cannot use permission from a different origin or port. Public HTTP remains rejected.
- MCP's form now requires the same explicit private-HTTP confirmation before saving local or Codex configuration.
- New tests cover actual persistence, rejection before secret writes, model selection, authorization scope, IPv6 lookalikes, MCP confirmation and English/Chinese feedback. Original implementation failed the applicable regression cases before correction.

## Validation

- `npm run check`: 449 passed, one existing skip; typecheck and production build passed.
- `npm audit`: zero findings after updating compatible development-only resolutions: Obsidian SDK 1.14.4 and its Moment/CodeMirror dependencies, plus source-map-js 1.2.2. No production dependency changed; main.js remained byte-identical before/after these lockfile updates. Minimum supported host unchanged.
- Isolated macOS Obsidian 1.13.7 profile, synthetic vault, only this plugin enabled, version 0.6.3. Confirmed unapproved save creates no provider, an approved connection persists, private-to-private edit clears consent, public lookalike gets no opt-in, and changed endpoint cannot save without re-confirmation.
- A controlled server bound to the test machine's private IPv4 received the actual host GET `/v1/models` and streaming POST `/v1/chat/completions`; fixture authorization was verified and the plugin reported successful model testing. No live paid model or personal notes were used.
- Reload and reopening preserve provider URL, exact approval, model selection and stored key. Settings normalization adds its existing default fields without changing these values.
- Inspected light and dark screenshots. At 380px host width, provider modal client/scroll widths both 302px and notice widths both 268px. Native checkbox uses a label and scoped neutral color. Existing protocol selector scrolls within its row.
- New text uses the existing language adapter; English/Chinese unit coverage. Full English host UI, Windows and mobile devices are not claimed tested.

## Component investigation

Reviewed https://ui.shadcn.com/docs/ai-elements and current Alert/Checkbox documentation. Source reference: shadcn-ui/ui d2fba50ee5b9113008b5bb908563527b7efd2f27 (MIT). This change retains the existing imperative Obsidian Modal and native labeled checkbox instead of adding a React root and Base UI dependency to a small form notice. No upstream source was copied; existing license records remain intact.

## Distribution boundary

Final candidate SHA, official preview scan, CI draft assets, fresh/upgrade installation, anonymous download hashes and official review are recorded in the release handoff after they occur. This document does not assert those gates passed in advance.
