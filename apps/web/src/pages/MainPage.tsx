import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_TRANSLATION_EXAMPLES, type ChatMessage } from "@askboss/shared";
import { AppShell } from "../components/AppShell";
import { useSession } from "../features/session/useSession";
import { useBosses } from "../features/boss/useBosses";
import { PkiIndicator } from "../features/pki/PkiIndicator";
import { ChatPanel } from "../features/chat/ChatPanel";
import type { ChatSimulationRequest } from "../features/chat/simulation-types";
import { TranslatorPanel } from "../features/translator/TranslatorPanel";
import { useTranslationExamples } from "../features/translator/useTranslationExamples";
import { Tutorial } from "../features/tutorial/Tutorial";
import { useUiStore } from "../stores/ui-store";
import { useProfile } from "../features/profile/useProfile";

type PanelName = "chat" | "translator";
const AVATAR_SPEECHES = [
  "결론부터 얘기해 보지.",
  "진행 상황은 어떤가?",
  "일정에 문제 생기면 미리 알려줘.",
  "좋아, 그럼 다음 할 일은 뭐지?",
  "자료는 핵심만 정리해줘.",
] as const;

export function MainPage() {
  const session = useSession();
  const bosses = useBosses(session.isSuccess);
  const profile = useProfile(session.isSuccess);
  const translationExamples = useTranslationExamples(session.isSuccess);
  const ui = useUiStore();
  const boss = useMemo(() => bosses.data?.find((item) => item.id === ui.selectedBossId) ?? bosses.data?.[0], [bosses.data, ui.selectedBossId]);
  const [speech, setSpeech] = useState("밥은 먹었나?");
  const [thinking, setThinking] = useState(false);
  const [simulationRequest, setSimulationRequest] = useState<ChatSimulationRequest | null>(null);
  const [avatarSpeechIndex, setAvatarSpeechIndex] = useState(-1);
  const [chatState, setChatState] = useState({ hasContent: false, hasUnsavedActualResponse: false, busy: false });
  const [externalChatUpdate, setExternalChatUpdate] = useState<{ threadId: string; archiveId: string; messages: ChatMessage[] } | null>(null);

  useEffect(() => {
    if (boss && !ui.selectedBossId) ui.set({ selectedBossId: boss.id });
  }, [boss, ui.selectedBossId]);

  useEffect(() => {
    setSimulationRequest(null);
    setSpeech(profile.data?.handle ? `${profile.data.handle}씨, 밥은 먹었나?` : "밥은 먹었나?");
    setThinking(false);
    setAvatarSpeechIndex(-1);
    setChatState({ hasContent: false, hasUnsavedActualResponse: false, busy: false });
    setExternalChatUpdate(null);
  }, [boss?.id, profile.data?.handle]);

  const updateChatState = useCallback((next: { hasContent: boolean; hasUnsavedActualResponse: boolean; busy: boolean }) => {
    setChatState((current) => current.hasContent === next.hasContent && current.hasUnsavedActualResponse === next.hasUnsavedActualResponse && current.busy === next.busy ? current : next);
  }, []);

  const resetBossSpeech = useCallback(() => {
    setSpeech(profile.data?.handle ? `${profile.data.handle}씨, 밥은 먹었나?` : "밥은 먹었나?");
    setThinking(false);
  }, [profile.data?.handle]);

  const selectTab = (tab: PanelName) => ui.set({ activeWorkspaceTab: tab, mobilePanelExpanded: true });

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: PanelName) => {
    if (!(["ArrowLeft", "ArrowRight"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const next = tab === "chat" ? "translator" : "chat";
    selectTab(next);
    window.requestAnimationFrame(() => document.getElementById(`workspace-tab-${next}`)?.focus());
  };

  const changeAvatarSpeech = () => {
    const next = (avatarSpeechIndex + 1) % AVATAR_SPEECHES.length;
    setAvatarSpeechIndex(next);
    setThinking(false);
    setSpeech(AVATAR_SPEECHES[next]!);
  };

  if (session.isLoading || bosses.isLoading) return <div className="loading-state"><div className="boss-loading"><img className="loading-boss-avatar" src="/avatars/boss-male-01-loading.png" alt="모두의 상사 픽셀 아바타" width="150" height="150" fetchPriority="high"/><div className="spinner"/><p>모두의 상사를 부르는 중입니다.</p></div></div>;
  if (session.isError || bosses.isError || !boss) return <div className="empty-state"><div><h1>서비스를 시작하지 못했습니다.</h1><p>API 서버 연결을 확인한 뒤 다시 시도해 주세요.</p></div></div>;

  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .25, ease: "easeOut" }}>
    <AppShell>
    <div className={`interaction-workspace ${ui.mobilePanelExpanded ? "" : "is-mobile-panel-collapsed"}`}>
      <section data-tutorial="workspace" className={`boss-stage ${thinking ? "is-thinking" : ""}`} aria-labelledby="boss-alias">
        <div aria-live="polite"><AnimatePresence mode="popLayout" initial={false}><motion.div key={`${boss.id}:${speech}`} className="speech-bubble" initial={{ opacity: 0, scale: .97, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: -4 }} transition={{ duration: .5, ease: [0.22, 1, 0.36, 1] }}>{speech}</motion.div></AnimatePresence></div>
        <button className="avatar-frame avatar-button" type="button" onClick={changeAvatarSpeech} aria-label={`${boss.alias}의 한마디 바꾸기`}>
          <AnimatePresence mode="wait" initial={false}><motion.span key={boss.id} className="avatar-transition" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.01 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}><img className="boss-avatar" src={`/avatars/${boss.avatarKey}.png`} alt={`${boss.alias} 픽셀 아바타`}/><img className="boss-avatar boss-avatar--closed" src={`/avatars/${boss.avatarKey}-closed.png`} alt="" aria-hidden="true"/></motion.span></AnimatePresence>
          <span className="thinking-indicator" aria-hidden="true"><i/><i/><i/></span>
        </button>
        <h1 id="boss-alias" className="boss-alias">{boss.alias}</h1>
        {boss.scope === "GLOBAL" ? <p className="boss-subtitle">모두가 사용할 수 있는 가상의 공통 상사</p> : <p className="boss-subtitle boss-subtitle-placeholder" aria-hidden="true">&#160;</p>}
        <PkiIndicator boss={boss}/>
        {boss.status === "FAILED" && <p className="error-text">페르소나 생성에 실패했습니다. 입력 정보는 저장되어 있습니다.</p>}
      </section>
      <aside className="workspace-dock" aria-label="대화와 번역">
        <header className="workspace-tabs-header">
          <div className="workspace-tabs" role="tablist" aria-label="작업 선택">
            <button id="workspace-tab-translator" data-tutorial="translate" type="button" role="tab" aria-selected={ui.activeWorkspaceTab === "translator"} aria-controls="translator-panel" tabIndex={ui.activeWorkspaceTab === "translator" ? 0 : -1} onKeyDown={(event) => onTabKeyDown(event, "translator")} onClick={() => selectTab("translator")}>번역</button>
            <button id="workspace-tab-chat" data-tutorial="chat" type="button" role="tab" aria-selected={ui.activeWorkspaceTab === "chat"} aria-controls="chat-panel" tabIndex={ui.activeWorkspaceTab === "chat" ? 0 : -1} onKeyDown={(event) => onTabKeyDown(event, "chat")} onClick={() => selectTab("chat")}>대화</button>
            <span className={`workspace-tab-indicator ${ui.activeWorkspaceTab === "chat" ? "is-chat" : ""}`} aria-hidden="true"/>
          </div>
          <button className="mobile-panel-toggle" type="button" aria-expanded={ui.mobilePanelExpanded} aria-controls="workspace-dock-body" onClick={() => ui.set({ mobilePanelExpanded: !ui.mobilePanelExpanded })}>
            {ui.mobilePanelExpanded ? <ChevronDown size={18}/> : <ChevronUp size={18}/>}
            <span>{ui.mobilePanelExpanded ? "패널 접기" : "패널 펼치기"}</span>
          </button>
        </header>
        <div id="workspace-dock-body" className="workspace-dock-body">
          <TranslatorPanel boss={boss} active={ui.activeWorkspaceTab === "translator"} examples={translationExamples.data?.examples ?? DEFAULT_TRANSLATION_EXAMPLES} simulationDisabled={chatState.busy} onSourceMessage={(message) => { setThinking(false); setSpeech(message); }} onActualResponseApplied={(chat) => { if (chat) setExternalChatUpdate(chat); }} onSimulate={(request) => { if (chatState.busy) return false; if ((chatState.hasContent || chatState.hasUnsavedActualResponse) && !window.confirm("현재 대화를 삭제하고 새 시뮬레이션을 시작할까요? 기존 대화는 아카이브에 유지됩니다.")) return false; setSimulationRequest(request); setSpeech(request.inputText); setThinking(true); selectTab("chat"); return true; }}/>
          <ChatPanel boss={boss} active={ui.activeWorkspaceTab === "chat"} simulationRequest={simulationRequest} externalChatUpdate={externalChatUpdate} onActivity={({ thinking: nextThinking, speech: nextSpeech }) => { setThinking(nextThinking); if (nextSpeech) setSpeech(nextSpeech); }} onConversationStateChange={updateChatState} onReset={resetBossSpeech}/>
        </div>
      </aside>
    </div>
    <Tutorial/>
  </AppShell>
  </motion.div>;
}
