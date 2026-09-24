/**
 * Minimal CSS inliner built on the host browser's CSSOM, replacing juice (~470 KB)
 * for WeChat export. It supports what the qmblog themes use: style rules with
 * ordinary selectors, specificity/order cascade, `!important` and existing inline
 * styles. At-rules (media queries, font faces) and pseudo-elements are ignored,
 * because the WeChat editor drops them anyway.
 */

interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

interface MatchedDeclaration extends Declaration {
  specificity: number;
  order: number;
}

/** Splits on commas/semicolons that are not nested in parentheses, brackets or quotes. */
export function splitTopLevel(input: string, separator: "," | ";"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
    } else if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function parseDeclarations(cssText: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const part of splitTopLevel(cssText, ";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    if (property && value) declarations.push({ property, value, important });
  }
  return declarations;
}

/** Selector specificity packed as a*10000 + b*100 + c. */
export function selectorSpecificity(selector: string): number {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let rest = selector.replace(/"[^"]*"|'[^']*'/g, "");
  rest = rest.replace(/:(?:not|is|has)\(([^()]*)\)/g, (_match, inner: string) => {
    const nested = Math.max(0, ...splitTopLevel(inner, ",").map(selectorSpecificity));
    ids += Math.floor(nested / 10000);
    classes += Math.floor((nested % 10000) / 100);
    types += nested % 100;
    return " ";
  });
  rest = rest.replace(/:where\([^()]*\)/g, " ");
  ids += (rest.match(/#[\w-]+/g) ?? []).length;
  classes += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) ?? []).length;
  types += (rest.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?/g, " ").match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  types += (rest.match(/::[\w-]+/g) ?? []).length;
  return ids * 10000 + classes * 100 + types;
}

function readStyleRules(css: string, doc: Document): Array<{ selectorText: string; cssText: string }> {
  const rules: Array<{ selectorText: string; cssText: string }> = [];
  let sheet: CSSStyleSheet | null = null;
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const Sheet = view?.CSSStyleSheet ?? (typeof CSSStyleSheet === "undefined" ? undefined : CSSStyleSheet);
  try {
    if (Sheet) {
      sheet = new Sheet();
      sheet.replaceSync(css);
    }
  } catch {
    sheet = null;
  }
  if (!sheet) {
    const style = doc.createElement("style");
    style.textContent = css;
    doc.head.appendChild(style);
    sheet = style.sheet;
    style.remove();
  }
  for (const rule of Array.from(sheet?.cssRules ?? [])) {
    const styleRule = rule as CSSStyleRule;
    if (typeof styleRule.selectorText !== "string" || !styleRule.style) continue;
    rules.push({ selectorText: styleRule.selectorText, cssText: styleRule.style.cssText });
  }
  return rules;
}

/** Inlines `css` into every element of `root` (root included), in cascade order. */
export function inlineCss(root: Element, css: string): void {
  const doc = root.ownerDocument;
  const matches = new Map<Element, MatchedDeclaration[]>();
  let order = 0;
  for (const rule of readStyleRules(css, doc)) {
    const declarations = parseDeclarations(rule.cssText);
    if (declarations.length === 0) continue;
    for (const selector of splitTopLevel(rule.selectorText, ",")) {
      if (/::?(?:before|after|first-line|first-letter|placeholder|selection|marker)\b/i.test(selector)) continue;
      let elements: Element[];
      try {
        elements = Array.from(root.querySelectorAll(selector));
        if (root.matches(selector)) elements.unshift(root);
      } catch {
        continue;
      }
      if (elements.length === 0) continue;
      const specificity = selectorSpecificity(selector);
      const ruleOrder = order++;
      for (const element of elements) {
        const list = matches.get(element) ?? [];
        for (const declaration of declarations) list.push({ ...declaration, specificity, order: ruleOrder });
        matches.set(element, list);
      }
    }
  }

  for (const [element, declarations] of matches) {
    const style = (element as HTMLElement).style;
    if (!style) continue;
    const inline = parseDeclarations(element.getAttribute("style") ?? "");
    const normal = declarations.filter((item) => !item.important).sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    const important = declarations.filter((item) => item.important).sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    // Apply lowest priority first so later setProperty calls win, as the cascade would.
    const sequence: Declaration[] = [...normal, ...inline.filter((item) => !item.important), ...important, ...inline.filter((item) => item.important)];
    element.removeAttribute("style");
    for (const item of sequence) style.setProperty(item.property, item.value, item.important ? "important" : "");
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  }
}
