import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Image, Trash2, Upload } from "lucide-react";
import { MAX_IMAGE_EVIDENCE_PER_BOSS, type BossEvidenceSummary } from "@askboss/shared";
import { EvidencePrivacyNotice } from "../../components/EvidencePrivacyNotice";
import { EvidenceUploadProgressList } from "../../components/EvidenceUploadProgressList";
import { api } from "../../services/api-client";
import {
  getClipboardImageFiles,
  IMAGE_UPLOAD_CONCURRENCY,
  mapWithConcurrency,
  prepareEvidenceFile,
  prepareEvidenceImageBatch,
  type EvidenceUploadProgress,
  uploadToSignedUrl,
} from "../../services/upload-client";

const typeLabel = (type: BossEvidenceSummary["type"]) => ({ TEXT: "붙여넣기", TXT: "TXT", IMAGE: "이미지" })[type];
const statusLabel = (status: BossEvidenceSummary["status"]) => ({ PENDING: "분석 대기", PROCESSING: "분석 중", READY: "분석 완료", FAILED: "분석 실패" })[status];

interface BossEvidenceManagerProps {
  bossId: string;
  onProcessingChange: (processing: boolean) => void;
  onPersonaJob: (jobId: string) => Promise<void>;
  onPersonaUpdated: () => Promise<void> | void;
}

export function BossEvidenceManager({ bossId, onProcessingChange, onPersonaJob, onPersonaUpdated }: BossEvidenceManagerProps) {
  const [textEvidence, setTextEvidence] = useState("");
  const [uploadItems, setUploadItems] = useState<EvidenceUploadProgress[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const evidenceQuery = useQuery({
    queryKey: ["boss-evidence", bossId],
    queryFn: () => api<{ evidence: BossEvidenceSummary[] }>(`/bosses/${bossId}/evidence`).then((result) => result.evidence),
    enabled: Boolean(bossId),
    retry: false,
    refetchInterval: (query) => query.state.data?.some((item) => item.status === "PENDING" || item.status === "PROCESSING") ? 1_200 : false,
  });
  const evidence = evidenceQuery.data ?? [];
  const analyzing = evidence.some((item) => item.status === "PENDING" || item.status === "PROCESSING");
  const processing = Boolean(busy) || analyzing;
  const imageCount = evidence.filter((item) => item.type === "IMAGE").length;

  useEffect(() => onProcessingChange(processing), [onProcessingChange, processing]);
  useEffect(() => {
    setTextEvidence("");
    setUploadItems([]);
    setBusy(null);
    setStatus("");
    setError("");
  }, [bossId]);

  const updateUploadItem = (id: string, patch: Partial<EvidenceUploadProgress>) => setUploadItems((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const clearMessages = () => { setStatus(""); setError(""); };

  const addTextEvidence = async () => {
    const rawText = textEvidence.trim();
    if (!rawText || busy) return;
    clearMessages();
    setBusy("text");
    try {
      await api(`/bosses/${bossId}/evidence`, { method: "POST", body: JSON.stringify({ type: "TEXT", rawText }) });
      setTextEvidence("");
      setStatus("붙여넣은 대화를 분석 목록에 추가했습니다.");
      await evidenceQuery.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "텍스트 자료를 추가하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const uploadTxt = async (file: File) => {
    const id = crypto.randomUUID();
    setUploadItems((items) => [...items, { id, name: file.name, status: "VALIDATING", error: null }]);
    clearMessages();
    setBusy(id);
    try {
      const prepared = prepareEvidenceFile(file);
      if (prepared.contentType !== "text/plain") throw new Error("TXT 파일만 선택해 주세요.");
      updateUploadItem(id, { status: "UPLOADING" });
      const { upload } = await api<{ upload: { intentId: string; signedUrl: string | null; token: string | null } }>("/uploads/sign", { method: "POST", body: JSON.stringify({ bossId, fileName: prepared.file.name, contentType: prepared.contentType, size: prepared.file.size }) });
      if (upload.signedUrl) await uploadToSignedUrl(upload.signedUrl, prepared.file, upload.token);
      updateUploadItem(id, { status: "REGISTERING" });
      await api(`/bosses/${bossId}/evidence`, { method: "POST", body: JSON.stringify({ type: "TXT", uploadIntentId: upload.intentId }) });
      setUploadItems((items) => items.filter((item) => item.id !== id));
      setStatus(`${file.name}을 분석 목록에 추가했습니다.`);
      await evidenceQuery.refetch();
    } catch (reason) {
      updateUploadItem(id, { status: "FAILED", error: reason instanceof Error ? reason.message : "TXT 파일을 추가하지 못했습니다." });
      setError("TXT 파일을 추가하지 못했습니다. 파일 오류를 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const uploadImages = async (files: File[]) => {
    if (!files.length || busy) return;
    clearMessages();
    const batch = prepareEvidenceImageBatch(files, Math.max(0, MAX_IMAGE_EVIDENCE_PER_BOSS - imageCount));
    setUploadItems((items) => [...items, ...batch.map((item) => ({ id: item.id, name: item.source.name, status: item.error ? "FAILED" : "VALIDATING", error: item.error } satisfies EvidenceUploadProgress))]);
    const valid = batch.filter((item): item is typeof item & { prepared: NonNullable<typeof item.prepared> } => Boolean(item.prepared));
    if (!valid.length) {
      setError("업로드할 수 있는 이미지가 없습니다. 파일별 오류를 확인해 주세요.");
      return;
    }
    setBusy("images");
    try {
      const results = await mapWithConcurrency(valid, IMAGE_UPLOAD_CONCURRENCY, async (item) => {
        updateUploadItem(item.id, { status: "UPLOADING", error: null });
        const { upload } = await api<{ upload: { intentId: string; signedUrl: string | null; token: string | null } }>("/uploads/sign", { method: "POST", body: JSON.stringify({ bossId, fileName: item.prepared.file.name, contentType: item.prepared.contentType, size: item.prepared.file.size }) });
        if (upload.signedUrl) await uploadToSignedUrl(upload.signedUrl, item.prepared.file, upload.token);
        updateUploadItem(item.id, { status: "REGISTERING" });
        await api(`/bosses/${bossId}/evidence`, { method: "POST", body: JSON.stringify({ type: "IMAGE", uploadIntentId: upload.intentId }) });
        return item.id;
      });
      const succeeded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      results.forEach((result, index) => {
        if (result.status === "rejected") updateUploadItem(valid[index]!.id, { status: "FAILED", error: result.reason instanceof Error ? result.reason.message : "이미지를 추가하지 못했습니다." });
      });
      setUploadItems((items) => items.filter((item) => !succeeded.includes(item.id)));
      const failed = batch.length - succeeded.length;
      setStatus(failed ? `${succeeded.length}장 등록 완료 · ${failed}장 실패` : `이미지 ${succeeded.length}장을 분석 목록에 추가했습니다.`);
      if (failed) setError("일부 이미지를 등록하지 못했습니다. 파일별 오류를 확인해 주세요.");
      if (succeeded.length) await evidenceQuery.refetch();
    } finally {
      setBusy(null);
    }
  };

  const deleteEvidence = async (item: BossEvidenceSummary) => {
    if (busy || !window.confirm("이 자료를 삭제할까요? 삭제된 자료의 영향을 제거하기 위해 페르소나가 다시 분석됩니다.")) return;
    clearMessages();
    setBusy(item.id);
    let deleted = false;
    try {
      const result = await api<{ deletedEvidenceId: string; deletedJobIds: string[]; personaJobId: string | null; personaRebuildError: string | null }>(`/bosses/${bossId}/evidence/${item.id}`, { method: "DELETE" });
      deleted = true;
      await evidenceQuery.refetch();
      if (result.personaRebuildError) {
        setError(result.personaRebuildError);
      } else if (result.personaJobId) {
        setStatus("자료를 삭제하고 페르소나를 다시 분석하고 있습니다…");
        try {
          await onPersonaJob(result.personaJobId);
        } finally {
          await onPersonaUpdated();
        }
        setStatus("자료를 삭제하고 페르소나에 반영했습니다.");
      } else {
        setStatus("자료를 삭제했습니다.");
      }
    } catch (reason) {
      setError(deleted ? "자료는 삭제됐지만 페르소나 재분석에 실패했습니다. 아래 버튼으로 다시 분석해 주세요." : reason instanceof Error ? reason.message : "자료를 삭제하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return <section className="settings-evidence-manager">
    <div className="settings-evidence-heading">
      <div><h3>상사 대화 자료</h3><p>추가한 자료는 분석 완료 후 아래 저장·재분석 버튼을 눌러야 페르소나에 반영됩니다.</p></div>
    </div>
    <EvidencePrivacyNotice/>
    <div className="evidence-paste-zone" tabIndex={0} aria-label="상사 대화 이미지 붙여넣기 영역" onPaste={(event) => {
      const files = getClipboardImageFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      void uploadImages(files);
    }}>
      <p className="evidence-paste-hint">이미지는 이 영역을 선택하고 Ctrl/Cmd+V로도 추가할 수 있습니다.</p>
      <label className="settings-evidence-text-label" htmlFor={`settings-evidence-text-${bossId}`}>대화 내용 붙여넣기</label>
      <div className="settings-evidence-input">
        <textarea id={`settings-evidence-text-${bossId}`} className="textarea" maxLength={100_000} value={textEvidence} disabled={Boolean(busy)} onChange={(event) => setTextEvidence(event.target.value)} placeholder="상사와 나눈 대화 내용을 붙여넣으세요."/>
      </div>
      <div className="admin-upload-actions">
        <button className="primary-button" type="button" disabled={!textEvidence.trim() || Boolean(busy)} onClick={() => void addTextEvidence()}><Upload size={16}/>텍스트 추가</button>
        <label className="secondary-button"><FileText size={16}/>TXT 업로드<input hidden type="file" accept=".txt,text/plain" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadTxt(file); }}/></label>
        <label className={`secondary-button ${imageCount >= MAX_IMAGE_EVIDENCE_PER_BOSS ? "is-disabled" : ""}`}><Image size={16}/>이미지 업로드 ({imageCount}/{MAX_IMAGE_EVIDENCE_PER_BOSS}장)<input hidden multiple type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={Boolean(busy) || evidenceQuery.isLoading || imageCount >= MAX_IMAGE_EVIDENCE_PER_BOSS} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ""; if (files.length) void uploadImages(files); }}/></label>
      </div>
      <EvidenceUploadProgressList items={uploadItems} onRemove={(item) => setUploadItems((items) => items.filter((current) => current.id !== item.id))} removingId={busy}/>
    </div>
    {status && <p className="hint" role="status">{status}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="admin-evidence-list settings-evidence-list">
      {evidence.map((item) => <article key={item.id}>
        <div>
          <strong>{item.sourceName ?? typeLabel(item.type)}</strong>
          <span className={`job-status status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
          <small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small>
          {item.errorMessage && <p className="error-text">{item.errorMessage}</p>}
        </div>
        <button className="icon-button" type="button" aria-label={`${item.sourceName ?? typeLabel(item.type)} 삭제`} disabled={Boolean(busy)} onClick={() => void deleteEvidence(item)}><Trash2 size={16}/></button>
      </article>)}
      {!evidenceQuery.isLoading && !evidence.length && <p className="hint">등록된 대화 자료가 없습니다.</p>}
    </div>
  </section>;
}
