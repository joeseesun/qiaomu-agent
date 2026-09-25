import { loadMathJax } from "obsidian";
import { renderMermaidSvg, sizeSvg } from "../services/host-mermaid";

export interface RasterImage {
  blob: Blob;
  /** CSS pixel size of the rendered image (the PNG itself is `scale` times larger). */
  width: number;
  height: number;
}

const SCALE = 2;
const MAX_EDGE = 4000;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片编码失败")), "image/png"));
}

/** Rasterizes a standalone SVG document string. Chromium keeps the canvas untainted for data-URL SVGs. */
export async function svgToPng(svg: string, width: number, height: number, background = "#ffffff"): Promise<RasterImage> {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const scale = Math.min(SCALE, MAX_EDGE / Math.max(w, h));
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建画布");
  if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { blob: await canvasToBlob(canvas), width: w, height: h };
}

const MATH_FONT = `"STIX Two Math", "Latin Modern Math", "Cambria Math", "Times New Roman", math, serif`;

/**
 * Renders TeX through Obsidian's MathJax to MathML, lays it out natively, then
 * rasterizes it inside an SVG foreignObject. Returns null when MathJax fails.
 */
export async function mathToPng(tex: string, display: boolean, color = "#1a1a1a"): Promise<RasterImage | null> {
  await loadMathJax();
  const mathJax = (window as unknown as { MathJax?: { tex2mml?: (tex: string, options: { display: boolean }) => string } }).MathJax;
  if (!mathJax?.tex2mml) return null;
  let mathml: string;
  try { mathml = mathJax.tex2mml(tex, { display }); } catch { return null; }
  if (/merror/.test(mathml)) return null;

  const probe = document.body.createDiv();
  probe.setCssStyles({ position: "fixed", left: "-10000px", top: "0", fontSize: "17px", color, fontFamily: MATH_FONT, lineHeight: "1.2" });
  probe.innerHTML = mathml;
  const math = probe.querySelector("math");
  if (!math) { probe.remove(); return null; }
  math.setAttribute("xmlns", "http://www.w3.org/1998/Math/MathML");
  const rect = math.getBoundingClientRect();
  const width = Math.ceil(rect.width) + 4;
  const height = Math.ceil(rect.height) + 4;
  const markup = new XMLSerializer().serializeToString(math);
  probe.remove();
  if (width <= 4 || height <= 4) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:17px;line-height:1.2;color:${color};font-family:${MATH_FONT.replace(/"/g, "'")};padding:2px">${markup}</div></foreignObject></svg>`;
  return svgToPng(svg, width, height, "");
}

/** Renders Mermaid with the host copy in a light theme and returns a PNG. */
export async function mermaidToPng(source: string): Promise<RasterImage> {
  const sized = sizeSvg(await renderMermaidSvg(source, "neutral"));
  return svgToPng(sized.svg, sized.width, sized.height);
}
