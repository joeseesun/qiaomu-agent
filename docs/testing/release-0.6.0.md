# 0.6.0 acceptance

Date: 2026-10-11 (Asia/Shanghai). Scope: desktop account sign-in, Magpie gateway, Coding Plan presets.

- `npm run check`: typecheck, 420 passing tests / 1 existing skip, production build passed.
- Real AI SDK fixtures: Magpie Claude chat tool call → user answer → second response; ChatGPT Responses namespaced tool call → user answer → second response, preserving namespace with `store:false`.
- OAuth fixtures: loopback callback path/state, cancellation, OpenRouter/TokenDance PKCE code exchange, RSA/JWKS identity verification, single refresh per account, account isolation, rotated-token save failure, local sign-out before remote revocation, fixed SIWC origin, no fabricated key for remote Magpie, truncated SSE rejection.
- Obsidian 1.14.4 / macOS, isolated `qiaomu-home-dashboard-qa`: candidate installed over 0.5.9; actual account chooser inspected in light/dark and narrow window. No horizontal overflow. All three account flows' cancel buttons close their real local listener and save no provider. Browser opening was intercepted in this test; no real authorization grant was issued.
- Magpie UI against an ephemeral loopback fixture: detect `/api/hello`, save gateway, fetch `/v1/models`, retain `claude/qa-sonnet` with `high/max`, verify provider/model in `data.json`. Fixture and temporary provider cleaned up; original QA settings retained. This is protocol/host validation, not an authenticated upstream Claude request.
- Source review: Magpie `4ee3a76b7f50d42c5ecadd5105548c98978a77eb`, community plugins `bcc94e593339539fbe4c074ea666846455b6c167`, Clipper `d97772a`; see integration research.

Not covered: each vendor's real paid-account authorization and quota; Windows/Linux host callbacks; physical iOS/Android. Release preflight, remote CI, official preview scan, frozen-asset installation and anonymous download checks are separate release gates, not implied by the local results above.

The first official preview completed without errors. New JSON boundary warnings were addressed with unknown-value narrowing and credential/token-field validation before freezing the replacement candidate. Node-module warnings refer to type imports and runtime `require` guarded by `getRuntimeRequire()` (desktop only); those imports are not executed on mobile. Existing CSS, legacy settings and unrelated-source warnings are outside this change. The replacement candidate must receive its own completed preview.

Removal persistence is separately covered: a failed settings write restores the active subscription and recent models before any credential deletion.
