# 0.6.4 acceptance

## Scope

- Enabled and disabled models expose Edit/Delete. Editing supports model ID, alias and existing parameter controls without enabling a disabled model.
- Exact-model confirmation and cancellation; deleting the default selects another enabled model or clears the selection when none remain.
- Persistent removals survive remote discovery and settings normalization; explicit manual re-add restores the ID. ID edits migrate explicit parameters, not vendor-reported capabilities.
- Active API selection, cached selection and recents stay consistent; disk failures roll back changes. Independent providers/accounts are preserved.

## Validation

- Typecheck, 467 passing Vitest tests and production build; one existing test skipped. New service tests initially failed on the missing edit/removal implementation.
- Real macOS Obsidian 1.13.7 in an isolated synthetic vault, with only Qiaomu Agent enabled: disabled-model edit, ID/parameter migration, failed save preserving draft and original data, cancellation, default deletion, reload persistence, manual re-add, keyboard Enter from a separate settings window and focus restoration.
- Local HTTP fixture exercises actual model discovery and a renamed model request. This is transport/host verification, not a paid vendor model capability claim.
- Desktop light/dark and 360px viewport inspection, including input bounds, no horizontal overflow, independently scrollable content and deletion confirmation. Physical mobile and Windows are unverified.

Final candidate SHA, official scan, CI draft assets, frozen-asset installation, anonymous public checks and formal review are recorded separately after those gates finish. This document does not claim publication or scan approval in advance.
