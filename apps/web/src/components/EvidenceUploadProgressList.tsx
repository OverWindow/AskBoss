import type { EvidenceUploadProgress } from "../services/upload-client";
import { X } from "lucide-react";

const STATUS_LABEL: Record<EvidenceUploadProgress["status"], string> = {
  VALIDATING: "검증 대기",
  UPLOADING: "업로드 중",
  REGISTERING: "분석 등록 중",
  ANALYZING: "분석 중",
  SUCCEEDED: "등록 완료",
  FAILED: "등록 실패",
};

export function EvidenceUploadProgressList({ items, onRemove, removingId }: { items: EvidenceUploadProgress[]; onRemove?: (item: EvidenceUploadProgress) => void; removingId?: string | null }) {
  if (!items.length) return null;
  return <ul className="evidence-upload-progress" aria-live="polite">
    {items.map((item) => <li key={item.id} className={`status-${item.status.toLowerCase()}`}>
      <div><strong>{item.name}</strong><span>{STATUS_LABEL[item.status]}</span>{onRemove && <button className="evidence-upload-remove" type="button" aria-label={`${item.name} 삭제`} disabled={removingId === item.id || removingId === item.evidenceId || ["VALIDATING","UPLOADING","REGISTERING"].includes(item.status)} onClick={() => onRemove(item)}><X size={15}/></button>}</div>
      {item.error && <p>{item.error}</p>}
    </li>)}
  </ul>;
}
