import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Settings2 } from "lucide-react";
import type { ModelChoice } from "../types";

export function ModelList({ models, selected, loading, error, onSelect, onRetry, onBack, onManual, onManage }: {
  models: ModelChoice[]; selected: string; loading: boolean; error: string;
  onSelect: (model: ModelChoice) => void; onRetry: () => void; onBack: () => void; onManual: () => void; onManage: () => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const filtered = models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="qa-model-picker">
    <button type="button" onClick={onBack}><ChevronLeft size={14} />模型</button>
    <input ref={input} aria-label="搜索模型" placeholder="搜索模型…" value={query} onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); e.currentTarget.parentElement?.querySelector<HTMLElement>('[aria-pressed]')?.focus(); }
      }} />
    <div className="qa-model-results" aria-busy={loading} onKeyDown={(e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
      const index = buttons.indexOf(e.target as HTMLButtonElement);
      buttons[(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
      {loading && <p role="status">正在获取模型…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>重新获取</button></div>}
      {!loading && !error && !filtered.length && <p>{query ? "没有匹配的模型" : "暂无模型，可手动输入 ID"}</p>}
      {filtered.map((model) => <button key={model.id} type="button" aria-pressed={selected === model.id} onClick={() => onSelect(model)}>
        <span>{model.name}</span>{selected === model.id && <Check size={14} />}
      </button>)}
    </div>
    <div className="qa-model-picker-footer">
      <button type="button" onClick={onManual}>输入模型 ID…</button>
      <button type="button" onClick={onManage}><Settings2 size={16} />模型管理…</button>
    </div>
  </div>;
}
