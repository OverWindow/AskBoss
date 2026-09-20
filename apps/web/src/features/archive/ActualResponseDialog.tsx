import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog";

interface ActualResponseDialogProps {
  open: boolean;
  initialValue?: string;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (content: string) => void;
}

export function ActualResponseDialog({ open, initialValue = "", saving = false, error, onClose, onSubmit }: ActualResponseDialogProps) {
  const [content, setContent] = useState(initialValue);
  useEffect(() => { if (open) setContent(initialValue); }, [open, initialValue]);
  return <Dialog compact open={open} title={initialValue ? "실제 답변 수정" : "실제 상사 답변"} className="actual-response-dialog" onClose={() => { if (!saving) onClose(); }}>
    <div className="actual-response-modal">
      <label htmlFor="actual-response-content">실제로 상사는 뭐라고 답했나요?</label>
      <textarea id="actual-response-content" className="textarea" maxLength={2_000} value={content} onChange={(event) => setContent(event.target.value)} autoFocus/>
      <small>{content.length.toLocaleString()}/2,000</small>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="button" disabled={saving || !content.trim()} onClick={() => onSubmit(content.trim())}>{saving ? "반영 중…" : "실제 답변 반영"}</button>
      </div>
    </div>
  </Dialog>;
}
