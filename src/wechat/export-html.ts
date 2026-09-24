import { buildWechatExportCss, type WechatExportStyleTokens } from "./export-style";
import { inlineCss } from "./inline-css";
import { buildWechatExportFragment, normalizeInlinedWechatHtml, normalizeWechatArticleDom, parseWechatArticleHtml } from "./normalize";
import { DEFAULT_WECHAT_EXPORT_THEME_CONFIG, getWechatExportTheme, WECHAT_EXPORT_BUILTIN_THEMES, type WechatExportTheme } from "./themes";

/** The blog's light article palette (fallbacks of qmblog readWechatExportStyleTokens). */
export const WECHAT_STYLE_TOKENS: WechatExportStyleTokens = {
  background: "#f5f4ed",
  panelBackground: "#faf9f5",
  softBackground: "#e8e6dc",
  lineColor: "#f0eee6",
  inkColor: "#141413",
  mutedColor: "#5e5d59",
  accentColor: "#c96442",
  linkColor: "#c96442",
  codeBackground: "#faf9f5",
  codeBorderColor: "#e8e6dc",
  quoteBackground: "#faf9f5",
  articleHeadingColor: "#17120d",
  articleBodyColor: "#2b241c",
  articleQuoteColor: "#51473a",
  articleQuoteBorderColor: "#cdb796",
  articleQuoteNestedBorderColor: "#b8a68a",
  articleQuoteNestedBackground: "rgba(0, 0, 0, 0.02)",
  bodyFontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  monoFontFamily: '"SFMono-Regular", Consolas, monospace',
  titleFontFamily: '"Songti SC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
};

export function listWechatThemes(): WechatExportTheme[] {
  return WECHAT_EXPORT_BUILTIN_THEMES;
}

export function resolveWechatTheme(themeId?: string | null): WechatExportTheme {
  return getWechatExportTheme(DEFAULT_WECHAT_EXPORT_THEME_CONFIG, themeId) ?? WECHAT_EXPORT_BUILTIN_THEMES[0]!;
}

/** Article HTML → WeChat-ready HTML with every style inlined. `data-qm-image` markers are preserved. */
export function buildWechatHtml(articleHtml: string, theme: WechatExportTheme, baseUrl?: string): string {
  const doc = parseWechatArticleHtml(articleHtml);
  normalizeWechatArticleDom(doc, { baseUrl });
  const fragmentDoc = new DOMParser().parseFromString(buildWechatExportFragment(doc.body.innerHTML), "text/html");
  const root = fragmentDoc.body.firstElementChild;
  if (!root) return "";
  inlineCss(root, buildWechatExportCss(WECHAT_STYLE_TOKENS, theme));
  return normalizeInlinedWechatHtml(root.outerHTML);
}

/** Replaces image sources by marker id and strips the markers. Unmapped images keep their src. */
export function finalizeWechatImages(html: string, sources: ReadonlyMap<string, string>): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const image of Array.from(doc.querySelectorAll("img[data-qm-image]"))) {
    const next = sources.get(image.getAttribute("data-qm-image") ?? "");
    if (next) image.setAttribute("src", next);
    image.removeAttribute("data-qm-image");
  }
  return doc.body.innerHTML;
}
