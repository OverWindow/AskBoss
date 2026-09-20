import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, BarChart3, ChevronLeft, ChevronRight, Plus, UserRound, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Boss } from "@askboss/shared";
import { useBosses } from "../features/boss/useBosses";
import { TUTORIAL_STORAGE_KEY } from "../features/tutorial/Tutorial";
import { api } from "../services/api-client";
import { useUiStore } from "../stores/ui-store";
import { Dialog } from "./Dialog";
import { SERVICE_NAME } from "../config/brand";
import { waGwa } from "../lib/korean";
import { useProfile } from "../features/profile/useProfile";

export function Sidebar() {
  const ui = useUiStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: bosses = [] } = useBosses();
  const { data: profile } = useProfile();
  const [deleteTarget, setDeleteTarget] = useState<Boss | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const reset = async () => {
    if (!confirm("이 세션의 개인 상사와 대화 자료를 초기화할까요? 번역 아카이브는 이 기기에 계속 보관됩니다.")) return;
    await api("/session", { method: "DELETE" });
    sessionStorage.clear();
    try { localStorage.removeItem(TUTORIAL_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    queryClient.clear();
    location.href = "/";
  };

  const removeBoss = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/bosses/${deleteTarget.id}`, { method: "DELETE" });
      queryClient.removeQueries({ queryKey: ["chat", deleteTarget.id] });
      await queryClient.invalidateQueries({ queryKey: ["bosses"] });
      if (ui.selectedBossId === deleteTarget.id) {
        const globalBoss = bosses.find((boss) => boss.scope === "GLOBAL");
        ui.set({ selectedBossId: globalBoss?.id ?? null, activeWorkspaceTab: "translator", mobilePanelExpanded: true });
        navigate("/");
      }
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "상사 데이터를 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return <>
    <aside className={`sidebar ${ui.mobileNavOpen ? "is-mobile-open" : ""}`} aria-label="주요 메뉴">
      <div className="brand"><span className="hide-collapsed"><img className="brand-logo" src="/image.svg?v=2" alt={SERVICE_NAME} /></span></div>
      <button className="sidebar-toggle" onClick={() => ui.set({ sidebarCollapsed: !ui.sidebarCollapsed })} aria-label={ui.sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}>{ui.sidebarCollapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}</button>
      {ui.mobileNavOpen && <button className="sidebar-close-button" type="button" onClick={() => ui.set({ mobileNavOpen: false })} aria-label="메뉴 닫기"><X size={18}/></button>}
      <nav className="boss-nav">
        <div className="nav-section-label hide-collapsed">상사</div>
        {bosses.map((boss, index) => {
          const active = ui.selectedBossId === boss.id || (!ui.selectedBossId && index === 0);
          return <div key={boss.id} className={`boss-nav-row ${active ? "is-active" : ""}`}>
            <button data-tutorial={boss.scope === "GLOBAL" ? "global-boss" : undefined} className="boss-nav-item" onClick={() => { ui.set({ selectedBossId: boss.id, mobileNavOpen: false }); navigate("/"); }} title={boss.alias}>
              <img className="mini-avatar" src={`/avatars/${boss.avatarKey}.png`} alt=""/><span className="hide-collapsed">{boss.alias}</span>
            </button>
            {boss.scope === "SESSION" && <button className="boss-delete-button" type="button" aria-label={`${boss.alias} 삭제`} title={`${boss.alias} 삭제`} onClick={(event) => { event.stopPropagation(); setDeleteError(""); setDeleteTarget(boss); }}><X size={15}/></button>}
          </div>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <Link to="/boss/new" data-tutorial="add-boss" className="boss-nav-item add-boss" onClick={() => ui.set({ mobileNavOpen: false })} title="상사 추가"><Plus size={18}/><span className="hide-collapsed">상사 추가</span></Link>
        <div className="nav-divider"/>
        <button data-tutorial="archive" className="nav-link" type="button" title="아카이브" onClick={() => ui.set({ archiveOpen: true, mobileNavOpen: false, settingsOpen: false })}><Archive size={19}/><span className="hide-collapsed">아카이브</span></button>
        <Link data-tutorial="hr-demo" className="nav-link" to="/hr-demo" title="HR 데모" onClick={() => ui.set({ mobileNavOpen: false })}><BarChart3 size={19}/><span className="hide-collapsed">HR 데모</span></Link>
        <button className="sidebar-user" onClick={() => ui.set({ settingsOpen: !ui.settingsOpen })} title={profile ? profile.handle : "사용자 설정"}><UserRound size={19}/><span className="hide-collapsed">{profile ? profile.handle : "사용자 설정"}</span></button>
        <AnimatePresence>{ui.settingsOpen && <motion.div className="profile-menu" initial={{ opacity: 0, y: 8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .97 }} transition={{ duration: .2, ease: [0.22, 1, 0.36, 1] }}><Link to="/settings" onClick={() => ui.set({ settingsOpen: false, mobileNavOpen: false })}>내 정보 · 상사 관리</Link><button onClick={() => { try { localStorage.removeItem(TUTORIAL_STORAGE_KEY); } catch { /* Storage may be unavailable. */ } ui.set({ tutorialOpen: true, settingsOpen: false, mobileNavOpen: false }); navigate("/"); }}>튜토리얼 다시 보기</button><button className="danger-button" onClick={reset}>세션 데이터 초기화</button></motion.div>}</AnimatePresence>
      </div>
    </aside>
    <Dialog compact open={Boolean(deleteTarget)} title="상사 데이터 삭제" onClose={() => { if (!deleting) setDeleteTarget(null); }}>
      <p><strong>{deleteTarget?.alias}</strong>{deleteTarget ? waGwa(deleteTarget.alias) : "와"} 연결된 모든 데이터를 삭제합니다.</p>
      <p className="hint">상사 프로필, 관찰 자료와 업로드 파일, 설문, 페르소나, 대화, 번역 아카이브, 혼잣말, 관련 AI 작업이 모두 삭제되며 복구할 수 없습니다.</p>
      {deleteError && <p className="error-text" role="alert">{deleteError}</p>}
      <div className="dialog-actions"><button className="secondary-button" type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>취소</button><button className="primary-button danger-confirm-button" type="button" disabled={deleting} onClick={() => void removeBoss()}>{deleting ? "삭제 중…" : "모두 삭제"}</button></div>
    </Dialog>
  </>;
}
