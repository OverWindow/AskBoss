import { useEffect, useMemo, useRef, useState } from "react";
import { Languages, MessageCircle } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { useSession } from "../features/session/useSession";
import { useBosses } from "../features/boss/useBosses";
import { PkiIndicator } from "../features/pki/PkiIndicator";
import { ChatPanel } from "../features/chat/ChatPanel";
import type { ChatSimulationRequest } from "../features/chat/simulation-types";
import { TranslatorPanel } from "../features/translator/TranslatorPanel";
import { Tutorial } from "../features/tutorial/Tutorial";
import { api } from "../services/api-client";
import { useUiStore } from "../stores/ui-store";

type PanelName = "chat" | "translator";

export function MainPage() {
  const session = useSession();
  const bosses = useBosses(session.isSuccess);
  const ui = useUiStore();
  const boss = useMemo(() => bosses.data?.find((item) => item.id === ui.selectedBossId) ?? bosses.data?.[0], [bosses.data, ui.selectedBossId]);
  const [speech, setSpeech] = useState("○○씨, 밥은 먹었나?");
  const [thinking, setThinking] = useState(false);
  const [simulationRequest, setSimulationRequest] = useState<ChatSimulationRequest | null>(null);
  const translatorTrigger = useRef<HTMLButtonElement>(null);
  const chatTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (boss && !ui.selectedBossId) ui.set({ selectedBossId: boss.id });
  }, [boss, ui.selectedBossId]);

  useEffect(() => { setSimulationRequest(null); }, [boss?.id]);

  useEffect(() => {
    if (!boss || thinking || ui.chatPanelOpen || ui.translatorPanelOpen) return;
    const delay = (3 + Math.random() * 4) * 60_000;
    const id = window.setTimeout(async () => {
      try {
        const result = await api<{ content: string }>(`/bosses/${boss.id}/monologue`, { method: "POST" });
        setSpeech(result.content);
      } catch {
        // Ambient monologues should never interrupt the primary workspace.
      }
    }, delay);
    return () => clearTimeout(id);
  }, [boss?.id, thinking, speech, ui.chatPanelOpen, ui.translatorPanelOpen]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1200px)");
    const enforceSinglePanel = () => {
      const state = useUiStore.getState();
      if (!media.matches && state.chatPanelOpen && state.translatorPanelOpen) {
        state.set(state.lastOpenedPanel === "chat" ? { translatorPanelOpen: false } : { chatPanelOpen: false });
      }
    };
    enforceSinglePanel();
    media.addEventListener("change", enforceSinglePanel);
    return () => media.removeEventListener("change", enforceSinglePanel);
  }, []);

  const closePanel = (panel: PanelName, restoreFocus = true) => {
    if (panel === "chat") ui.set({ chatPanelOpen: false });
    else ui.set({ translatorPanelOpen: false });
    if (restoreFocus) window.requestAnimationFrame(() => (panel === "chat" ? chatTrigger : translatorTrigger).current?.focus());
  };

  const togglePanel = (panel: PanelName) => {
    const wide = window.matchMedia("(min-width: 1200px)").matches;
    if (panel === "chat") {
      ui.set({
        chatPanelOpen: !ui.chatPanelOpen,
        translatorPanelOpen: wide ? ui.translatorPanelOpen : false,
        lastOpenedPanel: "chat",
      });
    } else {
      ui.set({
        translatorPanelOpen: !ui.translatorPanelOpen,
        chatPanelOpen: wide ? ui.chatPanelOpen : false,
        lastOpenedPanel: "translator",
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const state = useUiStore.getState();
      const last = state.lastOpenedPanel;
      if ((last === "chat" && state.chatPanelOpen) || (last === "translator" && state.translatorPanelOpen)) closePanel(last);
      else if (state.chatPanelOpen) closePanel("chat");
      else if (state.translatorPanelOpen) closePanel("translator");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (session.isLoading || bosses.isLoading) return <div className="loading-state"><div><div className="spinner"/><p>상사를 부르는 중입니다.</p></div></div>;
  if (session.isError || bosses.isError || !boss) return <div className="empty-state"><div><h1>서비스를 시작하지 못했습니다.</h1><p>API 서버 연결을 확인한 뒤 다시 시도해 주세요.</p></div></div>;

  return <AppShell>
    <div className={`interaction-workspace ${ui.translatorPanelOpen ? "has-translator-panel" : ""} ${ui.chatPanelOpen ? "has-chat-panel" : ""}`}>
      {!ui.translatorPanelOpen && <button ref={translatorTrigger} data-tutorial="translate" className="workspace-tool-trigger translator-trigger" type="button" title="번역" aria-label="번역 패널 열기" aria-controls="translator-panel" aria-expanded="false" onClick={() => togglePanel("translator")}><Languages size={21}/><span>번역</span></button>}
      {!ui.chatPanelOpen && <button ref={chatTrigger} data-tutorial="chat" className="workspace-tool-trigger chat-trigger" type="button" title="대화" aria-label="대화 패널 열기" aria-controls="chat-panel" aria-expanded="false" onClick={() => togglePanel("chat")}><MessageCircle size={21}/><span>대화</span></button>}

      <TranslatorPanel boss={boss} open={ui.translatorPanelOpen} onClose={() => closePanel("translator")} onSourceMessage={(message) => { setThinking(false); setSpeech(message); }} onSimulate={(request) => { setSimulationRequest(request); setSpeech(request.inputText); setThinking(true); ui.set({ translatorPanelOpen: false, chatPanelOpen: true, lastOpenedPanel: "chat" }); }}/>
      <section data-tutorial="workspace" className={`boss-stage ${thinking ? "is-thinking" : ""}`} aria-labelledby="boss-alias">
        <div className="speech-bubble" aria-live="polite">“{speech}”</div>
        <div className="avatar-frame">
          <img className="boss-avatar" src={`/avatars/${boss.avatarKey}.png`} alt={`${boss.alias} 픽셀 아바타`}/>
          <img className="boss-avatar boss-avatar--closed" src={`/avatars/${boss.avatarKey}-closed.png`} alt="" aria-hidden="true"/>
          <span className="thinking-indicator" aria-hidden="true"><i/><i/><i/></span>
        </div>
        <h1 id="boss-alias" className="boss-alias">{boss.alias}</h1>
        <p className="boss-subtitle">{boss.scope === "GLOBAL" ? "모두가 사용할 수 있는 가상의 공통 상사" : "관찰을 바탕으로 만든 가상 행동 모델"}</p>
        <PkiIndicator boss={boss}/>
        {boss.status === "FAILED" && <p className="error-text">Persona 생성에 실패했습니다. 입력 정보는 저장되어 있습니다.</p>}
      </section>
      <ChatPanel boss={boss} open={ui.chatPanelOpen} simulationRequest={simulationRequest} onClose={() => closePanel("chat")} onActivity={({ thinking: nextThinking, speech: nextSpeech }) => { setThinking(nextThinking); if (nextSpeech) setSpeech(nextSpeech); }}/>
    </div>
    <Tutorial/>
  </AppShell>;
}
