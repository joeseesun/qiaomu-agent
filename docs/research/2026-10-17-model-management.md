# Model management

The model list now provides Edit and Delete for enabled and disabled entries. Editing opens the existing host modal with an ID/name form and the existing parameter controls. Deletion confirms the exact model and explains default fallback. A saved removal is respected by future discovery; adding that ID manually restores it.

Reviewed [shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements), [Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu), and [Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog) on 2026-10-17. Model Selector covers picking models and reasoning, not persisted provider CRUD. Keep Obsidian Modal, native inputs and existing Lucide controls for host focus, popout windows and mobile styling. No upstream implementation copied and no new dependency or peer-runtime upgrade; the repository's existing MIT license is unchanged.

Identity changes update enabled/default models, explicit parameters, active chat selection and recent models together. Failed persistence rolls these back. Changing the ID does not copy the previous model's vendor-reported capabilities. Discovery remains separate from manual configuration. Historical conversation contents are unchanged.
