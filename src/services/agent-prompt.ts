import type { ChatRequest } from "../types";
import { READING_CONVENTIONS } from "../integrations/reading-prompt";

/** Escapes a value for use inside a double-quoted XML attribute. */
export function xmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Fixed, vault-independent conventions placed before the user's own instructions,
 * so the prefix stays stable across turns (cache-friendly) and every backend gets them.
 */
export const OBSIDIAN_CONVENTIONS = `## Working in an Obsidian vault
- The working directory is the vault root. Refer to vault files in replies as wikilinks with vault-relative paths, e.g. [[folder/note]], so they are clickable.
- Move or rename notes through Obsidian (the Obsidian CLI \`move\` command when available) so links are updated; never use shell mv on notes.
- Delete through Obsidian's trash (\`obsidian delete\`); never delete permanently unless the user explicitly asks.
- Change frontmatter properties with the Obsidian CLI \`property:set\` / \`property:remove\` when available instead of hand-editing YAML.
- Keep existing Markdown, YAML frontmatter, wikilinks, embeds, callouts and Chinese typography intact; change only what the request needs.
- Context tags: <active_note path> is the open note; <editor_selection path lines> is the text the user selected. When asked to rewrite or fix "this", change only the selected lines of that note.`;

/** Conventions, then the user's instructions, then (API only) the vault's AGENTS.md. */
export function buildSystemPrompt(userPrompt: string, vaultInstructions?: string): string {
  const parts = [`${OBSIDIAN_CONVENTIONS}\n${READING_CONVENTIONS}`, userPrompt.trim()];
  if (vaultInstructions?.trim()) parts.push(`<vault_instructions source="AGENTS.md">\n${vaultInstructions.trim()}\n</vault_instructions>`);
  return parts.filter(Boolean).join("\n\n");
}

export function selectionBlock(request: Pick<ChatRequest, "selection">): string | null {
  const selection = request.selection;
  if (!selection?.text.trim()) return null;
  const lines = selection.startLine === selection.endLine ? `${selection.startLine}` : `${selection.startLine}-${selection.endLine}`;
  return `<editor_selection path="${xmlAttr(selection.path)}" lines="${lines}">\n${selection.text}\n</editor_selection>`;
}

export function activeNoteBlock(request: Pick<ChatRequest, "activeFilePath" | "activeFileContent">): string | null {
  if (!request.activeFilePath || request.activeFileContent === undefined) return null;
  return `<active_note path="${xmlAttr(request.activeFilePath)}">\n${request.activeFileContent}\n</active_note>`;
}
