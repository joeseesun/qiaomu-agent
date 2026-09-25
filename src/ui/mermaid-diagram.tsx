import { useEffect, useState } from "react";
import { MAX_MERMAID_SOURCE, renderMermaidSvg, sizeSvg, svgDataUrl } from "../services/host-mermaid";

/** Host Mermaid renders to SVG, shown as an inert image: no scripts, links or vault access. */
export function MermaidDiagram({ source }: { source: string }) {
  const [image, setImage] = useState<{ url: string; width: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const tooLarge = source.length > MAX_MERMAID_SOURCE;
  useEffect(() => {
    if (tooLarge) return;
    let live = true;
    setFailed(false);
    const dark = document.body.classList.contains("theme-dark");
    renderMermaidSvg(source, dark ? "dark" : "default")
      .then((svg) => { if (!live) return; const sized = sizeSvg(svg); setImage({ url: svgDataUrl(sized.svg), width: sized.width }); })
      .catch(() => { if (live) { setImage(null); setFailed(true); } });
    return () => { live = false; };
  }, [source, tooLarge]);
  return <div className="qa-mermaid">
    {image && <img src={image.url} alt="Mermaid 图表" style={{ width: image.width, maxWidth: "100%" }} />}
    {(failed || tooLarge) && <p role="status">图表未能显示，请检查源码或缩小图表。</p>}
    <details open={failed || tooLarge}><summary>图表源码</summary><pre>{source}</pre></details>
  </div>;
}
