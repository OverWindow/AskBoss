import { useEffect, useRef, useState } from "react";
import { Languages, RefreshCw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { Boss, TranslationResult } from "@askboss/shared";
import { CHANNELS } from "@askboss/shared";
import { api } from "../../services/api-client";

interface TranslatorPanelProps {
  boss: Boss;
  open: boolean;
  onClose: () => void;
  onSourceMessage: (message: string) => void;
}

export function TranslatorPanel({ boss, open, onClose, onSourceMessage }: TranslatorPanelProps) {
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [translationId, setTranslationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [error, setError] = useState<string>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, [open]);

  useEffect(() => () => requestController.current?.abort(), [boss.id]);

  const translate = async () => {
    const inputText = text.trim();
    if (!inputText || loading) return;
    setLoading(true);
    setError(undefined);
    setFeedback(undefined);
    onSourceMessage(inputText);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const data = await api<{ translationId: string; result: TranslationResult }>(`/bosses/${boss.id}/translate`, {
        method: "POST",
        body: JSON.stringify({ inputText, channel }),
        signal: controller.signal,
        timeoutMs: 60_000,
      });
      setResult(data.result);
      setTranslationId(data.translationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "번역하지 못했습니다.");
    } finally {
      if (requestController.current === controller) requestController.current = undefined;
      setLoading(false);
    }
  };

  const rate = async (value: "GOOD" | "BAD") => {
    if (!translationId) return;
    try {
      await api(`/translations/${translationId}/feedback`, { method: "POST", body: JSON.stringify({ feedback: value }) });
      setFeedback(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "의견을 저장하지 못했습니다.");
    }
  };

  return <section id="translator-panel" className={`workspace-panel translator-panel ${open ? "is-open" : ""}`} aria-label="상사의 말 번역" aria-hidden={!open} aria-busy={loading}>
    <header className="workspace-panel-header">
      <div><span className="panel-kicker">TRANSLATOR</span><h2><Languages size={18}/>상사의 말 번역</h2></div>
      <button className="panel-close-button" type="button" onClick={onClose} aria-label="번역 패널 닫기"><X size={18}/></button>
    </header>
    <div className="translator-scroll">
      <div className="field"><label htmlFor="boss-message">상사가 뭐라고 했나요?</label><textarea ref={textareaRef} id="boss-message" className="textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder="받은 메시지나 들은 말을 그대로 적어주세요."/></div>
      <div className="field"><label htmlFor="channel">어떤 상황인가요?</label><select id="channel" className="select" value={channel} onChange={(event) => setChannel(event.target.value)}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></div>
      <button className="primary-button panel-submit" type="button" disabled={!text.trim() || loading} onClick={() => void translate()}>{loading ? "해석하는 중…" : "해석하기"}</button>
      {error && <div className="translation-error" role="alert"><span>{error}</span><button className="small-button" type="button" disabled={loading || !text.trim()} onClick={() => void translate()}><RefreshCw size={14}/>다시 시도</button></div>}
      {result && <div className="translation-result">
        <section className="result-section"><h3>쉽게 말하면</h3><p>{result.plainMeaning}</p><div className="hint">신뢰도 {Math.round(result.confidence * 100)}% · {result.tone}</div>{result.caution && <p className="hint">{result.caution}</p>}</section>
        <section className="result-section"><h3>가능성이 높은 의도</h3><ul>{result.likelyIntent.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="result-section"><h3>답변 추천</h3>{result.replies.map((reply, index) => <div className="reply-option" key={reply.style}><div className="reply-style">{index + 1}안 · {reply.style}</div><p>{reply.text}</p><div className="hint">{reply.reason}</div>{index === 0 && <div className="feedback"><span>이 답변 괜찮나요?</span><button className="icon-button" type="button" aria-label="좋아요" disabled={Boolean(feedback)} onClick={() => void rate("GOOD")}><ThumbsUp size={17}/></button><button className="icon-button" type="button" aria-label="별로예요" disabled={Boolean(feedback)} onClick={() => void rate("BAD")}><ThumbsDown size={17}/></button>{feedback && <span>의견을 반영했어요.</span>}</div>}</div>)}</section>
      </div>}
    </div>
  </section>;
}
