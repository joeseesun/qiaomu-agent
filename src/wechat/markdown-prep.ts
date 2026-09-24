/**
 * Pre-processing for WeChat export. Mermaid fences and TeX math are replaced by
 * plain-text tokens before Obsidian renders the note, so they can be turned into
 * images afterwards (WeChat supports neither scripts nor MathML/CHTML).
 */

export interface MathItem { token: string; tex: string; display: boolean; }
export interface MermaidItem { token: string; source: string; }

export interface PreparedMarkdown {
  markdown: string;
  math: MathItem[];
  mermaid: MermaidItem[];
  /** First-level heading removed from the body because it duplicates the title. */
  leadingHeading: string | null;
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export function stripFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(markdown);
  return match ? markdown.slice(match[0].length) : markdown;
}

/** Replaces TeX in a code-free chunk; inline code spans are left untouched. */
function replaceMath(chunk: string, add: (tex: string, display: boolean) => string): string {
  let output = "";
  let i = 0;
  while (i < chunk.length) {
    const char = chunk[i]!;
    if (char === "\\" && chunk[i + 1] === "$") { output += "\\$"; i += 2; continue; }
    if (char === "`") {
      let ticks = 1;
      while (chunk[i + ticks] === "`") ticks++;
      const marker = "`".repeat(ticks);
      const end = chunk.indexOf(marker, i + ticks);
      if (end >= 0) { output += chunk.slice(i, end + ticks); i = end + ticks; continue; }
      output += marker; i += ticks; continue;
    }
    if (char === "$" && chunk[i + 1] === "$") {
      const end = chunk.indexOf("$$", i + 2);
      if (end >= 0) {
        const tex = chunk.slice(i + 2, end).trim();
        if (tex) { output += add(tex, true); i = end + 2; continue; }
      }
    }
    if (char === "$" && chunk[i + 1] && !/\s|\$/.test(chunk[i + 1]!)) {
      let end = i + 1;
      while (end < chunk.length && chunk[end] !== "\n") {
        if (chunk[end] === "\\") { end += 2; continue; }
        if (chunk[end] === "$") break;
        end++;
      }
      if (chunk[end] === "$" && !/\s/.test(chunk[end - 1]!) && !/\d/.test(chunk[end + 1] ?? "")) {
        output += add(chunk.slice(i + 1, end), false);
        i = end + 1;
        continue;
      }
    }
    output += char;
    i++;
  }
  return output;
}

export function prepareMarkdown(input: string, title: string): PreparedMarkdown {
  const math: MathItem[] = [];
  const mermaid: MermaidItem[] = [];
  const nonce = Math.random().toString(36).slice(2, 8).toUpperCase();
  const addMath = (tex: string, display: boolean) => {
    const token = `QMMATH${nonce}X${math.length}X`;
    math.push({ token, tex, display });
    return display ? `\n\n${token}\n\n` : token;
  };

  let body = stripFrontmatter(input).replace(/^\s+/, "");
  let leadingHeading: string | null = null;
  const heading = /^#\s+(.+?)\s*#*\s*(?:\r?\n|$)/.exec(body);
  if (heading && heading[1]!.trim() === title.trim()) {
    leadingHeading = heading[1]!.trim();
    body = body.slice(heading[0].length);
  }

  const lines = body.split("\n");
  const out: string[] = [];
  let plain: string[] = [];
  const flush = () => { if (plain.length) out.push(replaceMath(plain.join("\n"), addMath)); plain = []; };
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]!);
    if (!open) { plain.push(lines[i]!); continue; }
    flush();
    const fence = open[2]!;
    const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end]!)) end++;
    const info = open[3]!.trim().toLowerCase();
    if (info === "mermaid" && end < lines.length) {
      const token = `QMMERMAID${nonce}X${mermaid.length}X`;
      mermaid.push({ token, source: lines.slice(i + 1, end).join("\n") });
      out.push(`\n${token}\n`);
    } else {
      out.push(lines.slice(i, Math.min(end, lines.length - 1) + 1).join("\n"));
    }
    i = end;
  }
  flush();
  return { markdown: out.join("\n"), math, mermaid, leadingHeading };
}
