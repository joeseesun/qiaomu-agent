# ZCode integration · 2026-09-25

Installed runtime verified: ZCode 0.16.9, bundled `Contents/Resources/glm/zcode.cjs`, Node 24.21.0.

Original adapter: uses `--prompt --json --mode plan|edit|yolo`; parses the complete JSON summary's `response`. Each turn supplies prior conversation and Obsidian context. Model selection remains in ZCode; no unsupported `--model` option is sent. The app-server protocol is not claimed to be Codex-compatible and is not used in this version.

The desktop bundle needs explicit `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` and `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` paths. Only child-process environment is changed; credentials and user configuration are not edited. Discovery supports standalone CLI paths and the macOS app bundle plus Node 24+ including nvm installations.

Plan/edit/full map explicitly to plan/edit/yolo rather than inheriting headless's yolo default. Headless operations requiring interactive approval fail closed; plugin approval cards and streaming are not implemented for this adapter. Cancellation terminates the child with SIGTERM, then SIGKILL if necessary. Responses arrive at task completion.

Reference: https://github.com/zai-org/ZCode/tree/main/apps/zcode-cli ; local installed CLI help and bundled runtime inspection. No upstream source copied. Existing model controls and native settings UI reused.

Validation: typecheck, 138 tests, production build passed. Real CLI request reached the configured provider but failed with business error 1309 (expired GLM Coding Plan); successful model generation cannot be claimed. Obsidian runtime detected ZCode 0.16.9 as callable using its bundled entry point.
