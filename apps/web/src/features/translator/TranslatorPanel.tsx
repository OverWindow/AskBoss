import { useState } from "react";
import { ChevronLeft, ChevronRight, Languages, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Boss, TranslationResult } from "@askboss/shared";
import { CHANNELS } from "@askboss/shared";
import { api } from "../../services/api-client";

interface TranslatorPanelProps {
  boss: Boss;
  collapsed: boolean;
  active: boolean;
  onToggle: () => void;
  onSourceMessage: (message: string) => void;
}

export function TranslatorPanel({ boss, collapsed, active, onToggle, onSourceMessage }: TranslatorPanelProps) {
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [translationId, setTranslationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [error, setError] = useState<string>();

  const translate = async () => {
    const inputText = text.trim();
    if (!inputText || loading) return;
    setLoading(true);
    setError(undefined);
    setFeedback(undefined);
    onSourceMessage(inputText);
    try {
      const data = await api<{ translationId: string; result: TranslationResult }>(`/bosses/${boss.id}/translate`, {
        method: "POST",
        body: JSON.stringify({ inputText, channel }),
      });
      setResult(data.result);
      setTranslationId(data.translationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "번역하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const rate = async (value: "GOOD" | "BAD") => {
    if (!translationId) return;
    await api(`/translations/${translationId}/feedback`, { method: "POST", body: JSON.stringify({ feedback: value }) });
    setFeedback(value);
  };

  return <section className={`workspace-panel translator-panel ${collapsed ? "is-collapsed" : ""} ${active ? "is-active" : ""}`} aria-label="상사의 말 번역">
    <header className="workspace-panel-header">
      <div><span className="panel-kicker">TRANSLATOR</span><h2><Languages size={18}/>상사의 말 번역</h2></div>
      <button className="panel-collapse-button" type="button" onClick={onToggle} aria-label={collapsed ? "번역 패널 펼치기" : "번역 패널 접기"}>{collapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}</button>
    </header>
    {!collapsed && <div className="translator-scroll">
      <div className="field"><label htmlFor="boss-message">상사가 뭐라고 했나요?</label><textarea id="boss-message" className="textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder="받은 메시지나 들은 말을 그대로 적어주세요."/></div>
      <div className="field"><label htmlFor="channel">어떤 상황인가요?</label><select id="channel" className="select" value={channel} onChange={(event) => setChannel(event.target.value)}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></div>
      <button className="primary-button panel-submit" disabled={!text.trim() || loading} onClick={() => void translate()}>{loading ? "해석하는 중…" : "해석하기"}</button>
      {error && <p className="error-text" role="alert">{error}</p>}
      {result && <div className="translation-result">
        <section className="result-section"><h3>쉽게 말하면</h3><p>{result.plainMeaning}</p><div className="hint">신뢰도 {Math.round(result.confidence * 100)}% · {result.tone}</div>{result.caution && <p className="hint">{result.caution}</p>}</section>
        <section className="result-section"><h3>가능성이 높은 의도</h3><ul>{result.likelyIntent.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="result-section"><h3>답변 추천</h3>{result.replies.map((reply, index) => <div className="reply-option" key={reply.style}><div className="reply-style">{index + 1}안 · {reply.style}</div><p>{reply.text}</p><div className="hint">{reply.reason}</div>{index === 0 && <div className="feedback"><span>이 답변 괜찮나요?</span><button className="icon-button" aria-label="좋아요" disabled={Boolean(feedback)} onClick={() => void rate("GOOD")}><ThumbsUp size={17}/></button><button className="icon-button" aria-label="별로예요" disabled={Boolean(feedback)} onClick={() => void rate("BAD")}><ThumbsDown size={17}/></button>{feedback && <span>의견을 반영했어요.</span>}</div>}</div>)}</section>
      </div>}
    </div>}
  </section>;
}
