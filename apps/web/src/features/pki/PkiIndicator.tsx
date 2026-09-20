import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import type { Boss } from "@askboss/shared";

export function PkiIndicator({ boss }: { boss: Boss }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const pki = boss.pki;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  if (boss.scope === "GLOBAL") return <div className="pki-indicator pki-indicator-placeholder" aria-hidden="true">
    <div className="pki-row"><span className="pki-label">상사 파악도</span><span>0</span></div>
    <div className="pki-track"><div className="pki-fill" style={{ width: 0 }}/></div>
    <div className="pki-note">정보가 더 쌓이면 반응을 더 안정적으로 추정할 수 있어요.</div>
  </div>;

  return <div ref={rootRef} data-tutorial="pki" className="pki-indicator">
    <div className="pki-row"><span className="pki-label">상사 파악도 <button className="pki-info-button" type="button" aria-label="상사 파악도 산정 방식 보기" aria-expanded={open} aria-controls={popoverId} onClick={() => setOpen((value) => !value)}><Info size={15}/></button></span><span>{pki?.score ?? 0}</span></div>
    <div className="pki-track" aria-hidden="true"><div className="pki-fill" style={{ width: `${pki?.score ?? 0}%` }}/></div>
    <div className="pki-note">정보가 더 쌓이면 반응을 더 안정적으로 추정할 수 있어요.</div>
    <AnimatePresence>{open && <motion.div id={popoverId} className="pki-popover" role="dialog" aria-label="상사 파악도 산정 방식" initial={{ opacity: 0, x: "-50%", y: 8, scale: .97 }} animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }} exit={{ opacity: 0, x: "-50%", y: 8, scale: .97 }} transition={{ duration: .2, ease: [0.22, 1, 0.36, 1] }}>
      <div className="pki-breakdown">
        <div><span><b>정보 충족도</b><small>5개 업무 상황별 관찰이 충분히 쌓였는지 반영합니다.</small></span><b>{pki?.completeness ?? 0}점</b></div>
        <div><span><b>근거 신뢰도</b><small>페르소나 특성과 연결된 근거 수와 맥락 품질을 반영합니다.</small></span><b>{pki?.evidenceReliability ?? 0}점</b></div>
        <div><span><b>상황 다양성</b><small>서로 다른 시기와 업무 상황에서 관찰됐는지 반영합니다.</small></span><b>{pki?.diversity ?? 0}점</b></div>
        <div><span><b>최신성</b><small>최근 관찰일수록 높게 반영하며 시간이 지나면 점차 낮아집니다.</small></span><b>{pki?.freshness ?? 0}점</b></div>
      </div>
    </motion.div>}</AnimatePresence>
  </div>;
}
