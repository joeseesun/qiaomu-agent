export type MarkdownSegment = { kind: "markdown" | "mermaid" | "pending"; text: string };

/** Only complete, top-level Mermaid fences are extracted; other code blocks stay intact. */
export function splitMermaid(text: string): MarkdownSegment[] {
  const lines = text.split("\n");
  const result: MarkdownSegment[] = [];
  let plain: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^( {0,3})(`{3,}|~{3,})([^\r]*)\r?$/.exec(lines[i]!);
    if (!open) { plain.push(lines[i]!); continue; }
    const fence = open[2]!;
    const close = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end]!)) end++;
    if (end === lines.length) {
      if (open[3]!.trim().toLowerCase() === "mermaid") {
        if (plain.length) result.push({ kind: "markdown", text: plain.join("\n") });
        plain = [];
        result.push({ kind: "pending", text: lines.slice(i + 1).join("\n") });
      } else plain.push(...lines.slice(i));
      break;
    }
    if (open[3]!.trim().toLowerCase() === "mermaid") {
      if (plain.length) result.push({ kind: "markdown", text: plain.join("\n") });
      plain = [];
      result.push({ kind: "mermaid", text: lines.slice(i + 1, end).join("\n") });
    } else plain.push(...lines.slice(i, end + 1));
    i = end;
  }
  if (plain.length) result.push({ kind: "markdown", text: plain.join("\n") });
  return result;
}

export function mermaidFrameDocument(library: string, source: string, id: string, dark: boolean): string {
  const nonce = id.replace(/[^a-zA-Z0-9]/g, "");
  const data = JSON.stringify({ source, id, dark }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:8px;color:${dark ? "#eee" : "#222"};font:14px/1.6 system-ui,'PingFang SC','Microsoft YaHei',sans-serif}svg{max-width:100%;height:auto;display:block;margin:auto}a{pointer-events:none}</style></head><body><main id="chart"></main><script nonce="${nonce}">${library.replace(/<\/script/gi, "<\\/script")}</script><script nonce="${nonce}">
const data=${data};
const report=()=>parent.postMessage({qiaomuMermaid:data.id,height:Math.ceil(document.body.scrollHeight)},'*');
(async()=>{try{
mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:20000,maxEdges:300,theme:data.dark?'dark':'neutral',fontFamily:"system-ui, PingFang SC, Microsoft YaHei, sans-serif",flowchart:{htmlLabels:false}});
const result=await mermaid.render('diagram',data.source);
document.getElementById('chart').innerHTML=result.svg;
document.querySelectorAll('a').forEach(a=>{a.removeAttribute('href');a.removeAttribute('xlink:href')});
report();new ResizeObserver(report).observe(document.getElementById('chart'));
}catch{document.body.textContent='图表语法无法解析，请展开源码检查。';parent.postMessage({qiaomuMermaid:data.id,error:true},'*');report()}})();
</script></body></html>`;
}
