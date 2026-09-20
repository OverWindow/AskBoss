import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Info, RefreshCw } from "lucide-react";
import type { Boss } from "@askboss/shared";
import { api } from "../../services/api-client";

interface PersonaRefreshState {
  availableAt: string | null;
  retryAfterSeconds: number;
  inProgress: boolean;
  jobId: string | null;
}

interface PersonaRefreshResponse extends PersonaRefreshState {
  jobId: string;
}

const formatRemaining = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function PkiIndicator({ boss }: { boss: Boss }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: "pending" | "success" | "error"; text: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const pki = boss.pki;
  const cache = useQueryClient();
  const refreshKey = ["persona-refresh", boss.id] as const;
  const refresh = useQuery({
    queryKey: refreshKey,
    queryFn: () => api<PersonaRefreshState>(`/bosses/${boss.id}/persona/refresh`),
    enabled: boss.scope === "SESSION",
    retry: false,
  });

  useEffect(() => {
    setFeedback(null);
    setSubmitting(false);
  }, [boss.id]);

  useEffect(() => {
    const retryAfterSeconds = refresh.data?.retryAfterSeconds ?? 0;
    if (retryAfterSeconds <= 0) {
      setRemainingSeconds(0);
      return;
    }
    const deadline = Date.now() + retryAfterSeconds * 1_000;
    setRemainingSeconds(retryAfterSeconds);
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
      setRemainingSeconds(next);
      if (next === 0) {
        window.clearInterval(timer);
        void refresh.refetch();
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [boss.id, refresh.data?.availableAt, refresh.data?.retryAfterSeconds, refresh.refetch]);

  useEffect(() => {
    const jobId = refresh.data?.inProgress ? refresh.data.jobId : null;
    if (!jobId) return;
    let cancelled = false;
    let timer: number | undefined;
    setFeedback((current) => current?.kind === "error" ? current : { kind: "pending", text: "상사 정보를 다시 분석하고 있어요." });
    const poll = async () => {
      try {
        const { job } = await api<{ job: { status: string; errorMessage?: string | null } }>(`/jobs/${jobId}`);
        if (cancelled) return;
        if (job.status === "SUCCEEDED") {
          cache.setQueryData<PersonaRefreshState>(refreshKey, (current) => current ? { ...current, inProgress: false, jobId: null } : current);
          setFeedback({ kind: "success", text: "새 분석 결과를 반영했어요." });
          await Promise.all([cache.invalidateQueries({ queryKey: ["bosses"] }), refresh.refetch()]);
          return;
        }
        if (job.status === "FAILED") {
          cache.setQueryData<PersonaRefreshState>(refreshKey, (current) => current ? { ...current, inProgress: false, jobId: null } : current);
          setFeedback({ kind: "error", text: job.errorMessage ?? "페르소나 재분석에 실패했습니다." });
          await refresh.refetch();
          return;
        }
      } catch {
        if (cancelled) return;
        setFeedback({ kind: "pending", text: "분석 상태를 다시 확인하고 있어요." });
      }
      timer = window.setTimeout(() => void poll(), 1_000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [boss.id, cache, refresh.data?.inProgress, refresh.data?.jobId, refresh.refetch]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  const analyze = async () => {
    if (submitting || refresh.data?.inProgress || remainingSeconds > 0) return;
    setSubmitting(true);
    setFeedback({ kind: "pending", text: "상사 정보를 다시 분석하고 있어요." });
    try {
      const result = await api<PersonaRefreshResponse>(`/bosses/${boss.id}/persona/refresh`, { method: "POST" });
      cache.setQueryData<PersonaRefreshState>(refreshKey, result);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "페르소나 재분석을 시작하지 못했습니다." });
      await refresh.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  if (boss.scope === "GLOBAL") return <div className="pki-indicator pki-indicator-placeholder" aria-hidden="true">
    <div className="pki-row"><span className="pki-label">상사 파악도</span><span>0</span></div>
    <div className="pki-track"><div className="pki-fill" style={{ width: 0 }}/></div>
    <div className="pki-note">정보가 더 쌓이면 반응을 더 안정적으로 추정할 수 있어요.</div>
  </div>;

  const busy = submitting || Boolean(refresh.data?.inProgress);
  const checking = refresh.isLoading;
  const disabled = checking || busy || remainingSeconds > 0;
  const refreshLabel = checking ? "상사 페르소나 재분석 가능 시각 확인 중" : busy ? "상사 페르소나 재분석 중" : remainingSeconds > 0 ? `상사 페르소나 다시 분석, ${formatRemaining(remainingSeconds)} 후 가능` : "상사 페르소나 다시 분석";

  return <div ref={rootRef} data-tutorial="pki" className="pki-indicator">
    <div className="pki-row"><span className="pki-label">상사 파악도 <button className="pki-info-button" type="button" aria-label="상사 파악도 산정 방식 보기" aria-expanded={open} aria-controls={popoverId} onClick={() => setOpen((value) => !value)}><Info size={15}/></button><button className="pki-refresh-button" type="button" aria-label={refreshLabel} title={refreshLabel} disabled={disabled} onClick={() => void analyze()}><RefreshCw className={busy ? "is-spinning" : undefined} size={14}/>{remainingSeconds > 0 && <span className="pki-refresh-countdown" aria-hidden="true">{formatRemaining(remainingSeconds)}</span>}</button></span><span>{pki?.score ?? 0}</span></div>
    <div className="pki-track" aria-hidden="true"><div className="pki-fill" style={{ width: `${pki?.score ?? 0}%` }}/></div>
    <div className={`pki-note ${feedback?.kind === "error" ? "is-error" : ""}`} role="status" aria-live="polite">{feedback?.text ?? "정보가 더 쌓이면 반응을 더 안정적으로 추정할 수 있어요."}</div>
    <AnimatePresence>{open && <motion.div id={popoverId} className="pki-popover" role="dialog" aria-label="상사 파악도 산정 방식" initial={{ opacity: 0, x: "-50%", y: 8, scale: .97 }} animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }} exit={{ opacity: 0, x: "-50%", y: 8, scale: .97 }} transition={{ duration: .2, ease: [0.22, 1, 0.36, 1] }}>
      <div className="pki-breakdown">
        <div><span><b>정보 충족도</b><small>5개 업무 상황별 관찰이 충분히 쌓였는지 반영합니다.</small></span><b>{pki?.completeness ?? 0}점</b></div>
        <div><span><b>근거 신뢰도</b><small>페르소나 특성과 연결된 근거 수와 맥락 품질을 반영합니다.</small></span><b>{pki?.evidenceReliability ?? 0}점</b></div>
        <div><span><b>상황 다양성</b><small>서로 다른 시기와 업무 상황에서 관찰됐는지 반영합니다.</small></span><b>{pki?.diversity ?? 0}점</b></div>
        <div><span><b>최신성</b><small>최근 관찰일수록 높게 반영하며 약 2년에 걸쳐 완만하게 낮아집니다.</small></span><b>{pki?.freshness ?? 0}점</b></div>
      </div>
    </motion.div>}</AnimatePresence>
  </div>;
}
