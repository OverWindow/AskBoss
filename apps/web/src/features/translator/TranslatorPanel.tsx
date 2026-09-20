import { useEffect, useRef, useState } from "react";
import { Check, Copy, Languages, MessageCircle, RefreshCw, X } from "lucide-react";
import type { Boss, ChatMessage, TranslationArchiveDetail, TranslationExamples, TranslationResult } from "@askboss/shared";
import { CHANNELS } from "@askboss/shared";
import { api } from "../../services/api-client";
import type { ChatSimulationRequest } from "../chat/simulation-types";
import { ActualResponseDialog } from "../archive/ActualResponseDialog";

interface TranslatorPanelProps {
  boss: Boss;
  active: boolean;
  examples: readonly [string, string, string] | TranslationExamples;
  simulationDisabled?: boolean;
  onSourceMessage: (message: string) => void;
  onSimulate: (request: ChatSimulationRequest) => boolean | void;
  onActualResponseApplied?: (chat: { threadId: string; archiveId: string; messages: ChatMessage[] } | null) => void;
}

export function TranslatorPanel({ boss, active, examples, simulationDisabled = false, onSourceMessage, onSimulate, onActualResponseApplied }: TranslatorPanelProps) {
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [translationId, setTranslationId] = useState<string>();
  const [archiveId, setArchiveId] = useState<string>();
  const [translatedInputText, setTranslatedInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedReplyIndex, setSelectedReplyIndex] = useState<number>();
  const [error, setError] = useState<string>();
  const [lastRequestedInput, setLastRequestedInput] = useState("");
  const [copiedReplyIndex, setCopiedReplyIndex] = useState<number>();
  const [copyingReplyIndex, setCopyingReplyIndex] = useState<number>();
  const [actualPromptVisible, setActualPromptVisible] = useState(false);
  const [actualResponse, setActualResponse] = useState<string>();
  const [actualOpen, setActualOpen] = useState(false);
  const [actualSaving, setActualSaving] = useState(false);
  const [actualError, setActualError] = useState<string>();
  const [copyError, setCopyError] = useState<string>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (active && !window.matchMedia("(max-width:1024px), (pointer:coarse)").matches) window.requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, [active]);

  useEffect(() => {
    setText(""); setResult(null); setTranslationId(undefined); setArchiveId(undefined); setTranslatedInputText(""); setSelectedReplyIndex(undefined); setError(undefined); setLastRequestedInput(""); setCopiedReplyIndex(undefined); setCopyingReplyIndex(undefined); setActualPromptVisible(false); setActualResponse(undefined); setActualOpen(false); setCopyError(undefined);
    return () => requestController.current?.abort();
  }, [boss.id]);

  const translate = async (requestedText = text) => {
    const inputText = requestedText.trim();
    if (!inputText || loading) return;
    setLoading(true);
    setError(undefined);
    setLastRequestedInput(inputText);
    setSelectedReplyIndex(undefined);
    onSourceMessage(inputText);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const data = await api<{ translationId: string; archiveId: string; result: TranslationResult }>(`/bosses/${boss.id}/translate`, {
        method: "POST",
        body: JSON.stringify({ inputText, channel }),
        signal: controller.signal,
        timeoutMs: 60_000,
      });
      setResult(data.result);
      setTranslationId(data.translationId);
      setArchiveId(data.archiveId);
      setTranslatedInputText(inputText);
      setCopiedReplyIndex(undefined);
      setCopyingReplyIndex(undefined);
      setActualPromptVisible(false);
      setActualResponse(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "번역하지 못했습니다.");
    } finally {
      if (requestController.current === controller) requestController.current = undefined;
      setLoading(false);
    }
  };

  const simulate = (replyIndex: number) => {
    if (!translationId || !result) return;
    const reply = result.replies[replyIndex];
    if (!reply) return;
    const accepted = onSimulate({ id: crypto.randomUUID(), translationId, replyIndex, inputText: translatedInputText, reply: reply.text });
    if (accepted !== false) setSelectedReplyIndex(replyIndex);
  };

  const copyReply = async (replyIndex: number) => {
    const reply = result?.replies[replyIndex];
    if (!reply || !archiveId || copyingReplyIndex !== undefined) return;
    setCopyingReplyIndex(replyIndex);
    setCopyError(undefined);
    try {
      await navigator.clipboard.writeText(reply.text);
      const response = await api<{ archive: TranslationArchiveDetail }>(`/archives/${archiveId}/selected-reply`, { method: "PUT", body: JSON.stringify({ replyIndex }) });
      setCopiedReplyIndex(replyIndex);
      setActualPromptVisible(true);
      setActualResponse(response.archive.actualResponse?.content);
    } catch (cause) {
      setCopyError(cause instanceof Error ? cause.message : "답변을 복사하고 기록하지 못했습니다.");
    } finally {
      setCopyingReplyIndex(undefined);
    }
  };

  const saveActualResponse = async (content: string) => {
    if (!archiveId || actualSaving) return;
    setActualSaving(true);
    setActualError(undefined);
    try {
      const response = await api<{ archive: TranslationArchiveDetail; activeChat: { threadId: string; archiveId: string; messages: ChatMessage[] } | null }>(`/archives/${archiveId}/actual-response`, { method: "PUT", body: JSON.stringify({ content }) });
      setActualResponse(response.archive.actualResponse?.content);
      setActualOpen(false);
      setActualPromptVisible(true);
      onActualResponseApplied?.(response.activeChat);
    } catch (cause) {
      setActualError(cause instanceof Error ? cause.message : "실제 답변을 저장하지 못했습니다.");
    } finally {
      setActualSaving(false);
    }
  };

  return <section id="translator-panel" className="workspace-tab-panel" role="tabpanel" aria-labelledby="workspace-tab-translator" aria-label="상사의 말 번역" hidden={!active} aria-busy={loading || copyingReplyIndex !== undefined || actualSaving}>
    <div className="workspace-panel-title"><h2><Languages size={18}/>상사의 말 번역</h2></div>
    <div className="translator-scroll">
      <div className="field"><label htmlFor="boss-message">상사가 뭐라고 했나요?</label><textarea ref={textareaRef} id="boss-message" className="textarea" value={text} enterKeyHint="done" onChange={(event) => setText(event.target.value)}/>{boss.scope === "GLOBAL" && <div className="translation-examples" aria-label="예시 문장">{examples.map((example, index) => <button key={index} type="button" disabled={loading} onClick={() => setText(example)}>{example}</button>)}</div>}</div>
      <div className="field"><label htmlFor="channel">어떤 상황인가요?</label><select id="channel" className="select" value={channel} onChange={(event) => setChannel(event.target.value)}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></div>
      <button className="primary-button panel-submit" type="button" disabled={!text.trim() || loading} onClick={() => void translate()}>{loading ? "해석하는 중…" : "해석하기"}</button>
      {error && <div className="translation-error" role="alert"><span>{error}</span><button className="small-button" type="button" disabled={loading || !lastRequestedInput} onClick={() => void translate(lastRequestedInput)}><RefreshCw size={14}/>다시 시도</button></div>}
      {result && <div className="translation-result">
        <section className="result-section"><h3>쉽게 말하면</h3><p>{result.plainMeaning}</p></section>
        <section className="result-section"><h3>가능성이 높은 의도</h3><ul>{result.likelyIntent.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="result-section"><h3>답변 추천</h3>{result.replies.map((reply, index) => <div className={`reply-option${copiedReplyIndex === index ? " is-copied" : ""}`} key={reply.style}><div className="reply-style">{reply.style}</div><p>{reply.text}</p><div className="reply-actions"><button className="reply-copy-button" type="button" disabled={!archiveId || loading || copyingReplyIndex !== undefined} onClick={() => void copyReply(index)} aria-label={copyingReplyIndex === index ? "복사 중…" : copiedReplyIndex === index ? "복사됨" : "복사"}>{copiedReplyIndex === index ? <Check size={15}/> : <Copy size={15}/>}</button><button className={`reply-simulation-button${selectedReplyIndex === index ? " is-selected" : ""}`} type="button" disabled={!translationId || simulationDisabled || copyingReplyIndex !== undefined} onClick={() => simulate(index)}><MessageCircle size={15}/>이 답변으로 대화를 시뮬레이션해 볼게요.</button></div>{copiedReplyIndex === index && actualPromptVisible && <div className="reply-actual-prompt"><span>{actualResponse ? "실제 답변이 저장되었습니다." : "답변을 받았나요?"}</span><button className="text-button" type="button" onClick={() => setActualOpen(true)}>{actualResponse ? "실제 답변 수정" : "실제 답변 입력"}</button><button className="reply-prompt-close" type="button" aria-label="답변 확인 닫기" onClick={() => setActualPromptVisible(false)}><X size={14}/></button></div>}</div>)}{copyError && <p className="error-text" role="alert">{copyError}</p>}</section>
      </div>}
    </div><ActualResponseDialog open={actualOpen} initialValue={actualResponse} saving={actualSaving} error={actualError} onClose={() => { setActualOpen(false); setActualError(undefined); }} onSubmit={(content) => void saveActualResponse(content)}/>
  </section>;
}
