// Host adaptation of AI Elements' inline attachment composition. Apache-2.0; see THIRD_PARTY_NOTICES.md.
import { FileText, X } from "lucide-react";
import type { ChatAttachment } from "../../types";
export function Attachments({ files, onRemove }: { files: ChatAttachment[]; onRemove?: (id: string) => void }) {
  if (!files.length) return null;
  return <div className="qa-attachments">{files.map((file) => <div className="qa-attachment" key={file.id}>
    {file.mediaType.startsWith("image/") && file.url ? <img src={file.url} alt={file.name} width={36} height={36} /> : <FileText size={16} aria-hidden="true" />}
    <span>{file.vaultPath || file.name}</span>
    {onRemove && <button type="button" onClick={() => onRemove(file.id)} aria-label={`移除 ${file.name}`}><X size={13} /></button>}
  </div>)}</div>;
}
