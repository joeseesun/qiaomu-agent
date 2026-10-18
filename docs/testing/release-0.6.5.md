# 0.6.5 acceptance

## Scope

- Pele 1.6.0 core + flowchart/sequence/mindmap, with original Mermaid source preserved. Other diagram types and rendering incompatibilities retain the inert-image host fallback.
- Responsive layout, chat-scoped colors/fonts, Lucide zoom/fit actions, keyboard/gesture zoom, normal wheel scrolling, and deterministic teardown.
- Host-sanitized inline SVG with links/images disabled. 20,000 source characters, 500 edges, 1,000,000 SVG characters and existing six-diagram response limit. Limit failures do not bypass protections through fallback; incomplete streaming fences stay text.

## Validation

- `npm run check`: typecheck, 480 passing tests, one existing skipped test, production build. 13 new tests cover real Pele generation/reflow/limits and React fallback, stale results, cleanup, original source and English controls.
- `npm audit --omit=dev`: zero vulnerabilities. Production main.js is 2,479,462 bytes (about 186 kB more than 0.6.4); no React upgrade, runtime CDN or external rendering service.
- Real macOS Obsidian 1.13.7 in an isolated synthetic vault: all three Pele types plus host pie fallback, no horizontal overflow at 320px sidebar, unchanged SVG node across palette switch with changed text color, zoom/fit buttons, focused keyboard zoom, ordinary wheel scrolling, source preservation, incomplete fences, six-diagram cap, hostile label/link markup, source-limit recovery, font-size remeasurement and removal of zoom listeners after unmount.
- Visually inspected light 460px and black 320px sidebars. Browser-only geometry and desktop synthetic input do not establish physical mobile/touch or Windows diagram behavior.

Candidate SHA, CI, official scans, frozen draft asset hashes, fresh/upgrade installation and anonymous public assets are recorded separately when those gates finish; this document does not assert publication in advance.
