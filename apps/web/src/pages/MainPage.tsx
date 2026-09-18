import { useEffect, useMemo, useState } from "react";
import { Languages, MessageCircle } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { useSession } from "../features/session/useSession";
import { useBosses } from "../features/boss/useBosses";
import { PkiIndicator } from "../features/pki/PkiIndicator";
import { ChatPanel } from "../features/chat/ChatPanel";
import { TranslatorPanel } from "../features/translator/TranslatorPanel";
import { Tutorial } from "../features/tutorial/Tutorial";
import { api } from "../services/api-client";
import { useUiStore } from "../stores/ui-store";

export function MainPage() {
  const session = useSession();
  const bosses = useBosses(session.isSuccess);
  const ui = useUiStore();
  const boss = useMemo(() => bosses.data?.find((item) => item.id === ui.selectedBossId) ?? bosses.data?.[0], [bosses.data, ui.selectedBossId]);
  const [speech, setSpeech] = useState("○○씨, 밥은 먹었나?");
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (boss && !ui.selectedBossId) ui.set({ selectedBossId: boss.id });
  }, [boss, ui.selectedBossId]);

  useEffect(() => {
    if (!boss || thinking) return;
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
  }, [boss?.id, thinking, speech]);

  if (session.isLoading || bosses.isLoading) return <div className="loading-state"><div><div className="spinner"/><p>상사를 부르는 중입니다.</p></div></div>;
  if (session.isError || bosses.isError || !boss) return <div className="empty-state"><div><h1>서비스를 시작하지 못했습니다.</h1><p>API 서버 연결을 확인한 뒤 다시 시도해 주세요.</p></div></div>;

  return <AppShell>
    <div className={`interaction-workspace ${ui.translatorPanelCollapsed ? "translator-collapsed" : ""} ${ui.chatPanelCollapsed ? "chat-collapsed" : ""}`}>
      <div className="workspace-tabs" role="tablist" aria-label="상호작용 도구">
        <button role="tab" aria-selected={ui.activeTool === "translator"} className={ui.activeTool === "translator" ? "is-active" : ""} onClick={() => ui.set({ activeTool: "translator" })}><Languages size={17}/>번역</button>
        <button role="tab" aria-selected={ui.activeTool === "chat"} className={ui.activeTool === "chat" ? "is-active" : ""} onClick={() => ui.set({ activeTool: "chat" })}><MessageCircle size={17}/>대화</button>
      </div>
      <TranslatorPanel boss={boss} collapsed={ui.translatorPanelCollapsed} active={ui.activeTool === "translator"} onToggle={() => ui.set({ translatorPanelCollapsed: !ui.translatorPanelCollapsed })} onSourceMessage={(message) => { setThinking(false); setSpeech(message); }}/>
      <section className={`boss-stage ${thinking ? "is-thinking" : ""}`} aria-labelledby="boss-alias">
        <div className="speech-bubble" aria-live="polite">“{speech}”</div>
        <div className="avatar-frame"><img className="boss-avatar" src={`/avatars/${boss.avatarKey}.png`} alt={`${boss.alias} 픽셀 아바타`}/><span className="thinking-indicator" aria-hidden="true"><i/><i/><i/></span></div>
        <h1 id="boss-alias" className="boss-alias">{boss.alias}</h1>
        <p className="boss-subtitle">{boss.scope === "GLOBAL" ? "모두가 사용할 수 있는 가상의 공통 상사" : "관찰을 바탕으로 만든 가상 행동 모델"}</p>
        <PkiIndicator boss={boss}/>
        {boss.status === "FAILED" && <p className="error-text">Persona 생성에 실패했습니다. 입력 정보는 저장되어 있습니다.</p>}
      </section>
      <ChatPanel boss={boss} collapsed={ui.chatPanelCollapsed} active={ui.activeTool === "chat"} onToggle={() => ui.set({ chatPanelCollapsed: !ui.chatPanelCollapsed })} onActivity={({ thinking: nextThinking, speech: nextSpeech }) => { setThinking(nextThinking); if (nextSpeech) setSpeech(nextSpeech); }}/>
    </div>
    <Tutorial/>
  </AppShell>;
}
