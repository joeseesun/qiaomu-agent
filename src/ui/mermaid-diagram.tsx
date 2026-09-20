import { useEffect, useRef, useState } from "react";
import library from "mermaid/dist/mermaid.min.js";
import { mermaidFrameDocument } from "../services/mermaid-content";

/** Opaque-origin iframe: no same-origin access, network, popups or navigation permission. */
export function MermaidDiagram({ source }: { source: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const frame = ref.current;
    const win = frame?.ownerDocument.defaultView;
    if (!frame || !win || source.length > 20000) return;
    const id = crypto.randomUUID();
    setFailed(false);
    const timer = win.setTimeout(() => { setFailed(true); frame.srcdoc = ""; }, 15000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.qiaomuMermaid !== id) return;
      win.clearTimeout(timer);
      if (event.data.error) setFailed(true);
      if (Number.isFinite(event.data.height)) frame.style.height = `${Math.max(80, Math.min(1200, event.data.height))}px`;
    };
    win.addEventListener("message", receive);
    frame.srcdoc = mermaidFrameDocument(library, source, id, frame.ownerDocument.body.classList.contains("theme-dark"));
    return () => { win.clearTimeout(timer); win.removeEventListener("message", receive); frame.srcdoc = ""; };
  }, [source]);
  return <div className="qa-mermaid">
    {source.length <= 20000 && <iframe ref={ref} sandbox="allow-scripts" title="Mermaid 图表" />}
    {(failed || source.length > 20000) && <p role="status">图表未能显示，请检查源码或缩小图表。</p>}
    <details open={failed || source.length > 20000}><summary>图表源码</summary><pre>{source}</pre></details>
  </div>;
}
