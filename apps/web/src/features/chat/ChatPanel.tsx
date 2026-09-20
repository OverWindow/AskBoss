import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, MessageCircle, RefreshCw, RotateCcw, Send } from "lucide-react";
import type { Boss, ChatMessage, ChatMessageCoaching, TranslationArchiveDetail } from "@askboss/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api-client";
import { streamBossChat, streamBossSimulation } from "../../services/sse-client";
import type { ChatSimulationRequest } from "./simulation-types";
import { ActualResponseDialog } from "../archive/ActualResponseDialog";
import { waGwa } from "../../lib/korean";

interface ChatPanelProps {
  boss: Boss;
  active: boolean;
  simulationRequest: ChatSimulationRequest | null;
  onActivity: (state: { thinking: boolean; speech?: string }) => void;
  onConversationStateChange?: (state: { hasContent: boolean; hasUnsavedActualResponse: boolean; busy: boolean }) => void;
  onReset?: () => void;
  externalChatUpdate?: { threadId: string; archiveId: string; messages: ChatMessage[] } | null;
}

interface ChatHistoryPage {
  threadId: string | null;
  archiveId: string | null;
  messages: ChatMessage[];
  nextCursor: string | null;
}

export function ChatPanel({ boss, active, simulationRequest, onActivity, onConversationStateChange, onReset, externalChatUpdate }: ChatPanelProps) {
  const cache = useQueryClient();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [archiveId, setArchiveId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string>();
  const [failedMessage, setFailedMessage] = useState<string>();
  const [simulationError, setSimulationError] = useState<string>();
  const [failedSimulation, setFailedSimulation] = useState<ChatSimulationRequest>();
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const [copiedCoachingId, setCopiedCoachingId] = useState<string>();
  const [actualMessage, setActualMessage] = useState<ChatMessage>();
  const [actualSaving, setActualSaving] = useState(false);
  const [actualError, setActualError] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string>();
  const chatListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | undefined>(undefined);
  const simulationController = useRef<AbortController | undefined>(undefined);
  const handledSimulationId = useRef<string | undefined>(undefined);
  const simulationStarted = useRef(false);
  const loadingOlderRef = useRef(false);
  const olderRequestController = useRef<AbortController | undefined>(undefined);
  const preserveScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const stickToBottomRef = useRef(true);
  const activeBossIdRef = useRef(boss.id);
  const activeThreadIdRef = useRef<string | undefined>(undefined);
  activeBossIdRef.current = boss.id;
  activeThreadIdRef.current = threadId;
  const history = useQuery({
    queryKey: ["chat", boss.id],
    queryFn: () => api<ChatHistoryPage>(`/bosses/${boss.id}/chat`),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (history.data && !simulationStarted.current) {
      setMessages(history.data.messages);
      setThreadId(history.data.threadId ?? undefined);
      setArchiveId(history.data.archiveId ?? undefined);
      setNextCursor(history.data.nextCursor ?? null);
      setOlderError(undefined);
    }
  }, [history.data]);

  useEffect(() => {
    if (active && !window.matchMedia("(max-width:767px)").matches) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [active]);

  useLayoutEffect(() => {
    const chatList = chatListRef.current;
    if (!chatList) return;
    const snapshot = preserveScrollRef.current;
    if (snapshot) {
      chatList.scrollTop = snapshot.scrollTop + (chatList.scrollHeight - snapshot.scrollHeight);
      preserveScrollRef.current = null;
      stickToBottomRef.current = false;
      return;
    }
    if (stickToBottomRef.current) chatList.scrollTop = chatList.scrollHeight;
  }, [messages, active, simulationLoading, actualMessage]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const pinToBottom = () => {
      if (document.activeElement !== inputRef.current) return;
      const chatList = chatListRef.current;
      if (chatList) chatList.scrollTop = chatList.scrollHeight;
    };
    viewport.addEventListener("resize", pinToBottom);
    return () => viewport.removeEventListener("resize", pinToBottom);
  }, []);

  useEffect(() => {
    requestController.current?.abort();
    simulationController.current?.abort();
    olderRequestController.current?.abort();
    handledSimulationId.current = undefined;
    simulationStarted.current = false;
    loadingOlderRef.current = false;
    preserveScrollRef.current = null;
    setMessages([]);
    setThreadId(undefined);
    setArchiveId(undefined);
    setNextCursor(null);
    setLoadingOlder(false);
    setOlderError(undefined);
    setText("");
    setError(undefined);
    setSimulationError(undefined);
    setFailedSimulation(undefined);
    setActualMessage(undefined);
    setActualError(undefined);
    return () => { requestController.current?.abort(); simulationController.current?.abort(); olderRequestController.current?.abort(); };
  }, [boss.id]);

  useEffect(() => {
    if (!externalChatUpdate) return;
    olderRequestController.current?.abort();
    loadingOlderRef.current = false;
    simulationStarted.current = true;
    setThreadId(externalChatUpdate.threadId);
    setArchiveId(externalChatUpdate.archiveId);
    setMessages(externalChatUpdate.messages);
    setNextCursor(null);
    setOlderError(undefined);
    setActualMessage(undefined);
    cache.setQueryData(["chat", boss.id], { threadId: externalChatUpdate.threadId, archiveId: externalChatUpdate.archiveId, messages: externalChatUpdate.messages, nextCursor: null });
  }, [externalChatUpdate?.threadId]);

  const loadOlderMessages = async () => {
    if (!nextCursor || !threadId || loadingOlderRef.current) return;
    const chatList = chatListRef.current;
    const snapshot = chatList ? { scrollHeight: chatList.scrollHeight, scrollTop: chatList.scrollTop } : null;
    const requestedBossId = boss.id;
    const requestedThreadId = threadId;
    const controller = new AbortController();
    olderRequestController.current?.abort();
    olderRequestController.current = controller;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setOlderError(undefined);
    try {
      const page = await api<ChatHistoryPage>(`/bosses/${boss.id}/chat?cursor=${encodeURIComponent(nextCursor)}&limit=50`, { signal: controller.signal });
      if (controller.signal.aborted || activeBossIdRef.current !== requestedBossId || activeThreadIdRef.current !== requestedThreadId || page.threadId !== requestedThreadId) return;
      preserveScrollRef.current = snapshot;
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !existingIds.has(message.id)), ...current];
      });
      setNextCursor(page.nextCursor ?? null);
    } catch (cause) {
      if (!controller.signal.aborted) setOlderError(cause instanceof Error ? cause.message : "이전 대화를 불러오지 못했습니다.");
    } finally {
      if (olderRequestController.current === controller) olderRequestController.current = undefined;
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  const hasUnsavedActualResponse = Boolean(actualMessage);
  const busy = history.isLoading || streaming || simulationLoading || actualSaving || resetting;
  useEffect(() => {
    onConversationStateChange?.({ hasContent: messages.length > 0 || Boolean(text.trim()), hasUnsavedActualResponse, busy });
  }, [messages.length, text, hasUnsavedActualResponse, busy, onConversationStateChange]);

  const runSimulation = async (request: ChatSimulationRequest) => {
    simulationController.current?.abort();
    olderRequestController.current?.abort();
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    const controller = new AbortController();
    simulationController.current = controller;
    simulationStarted.current = true;
    setSimulationLoading(true);
    setSimulationError(undefined);
    setFailedSimulation(request);
    setError(undefined);
    setFailedMessage(undefined);
    setMessages([]);
    setThreadId(undefined);
    setNextCursor(null);
    setOlderError(undefined);
    setActualMessage(undefined);
    setActualError(undefined);
    onActivity({ thinking: true });
    try {
      let reaction = "";
      await streamBossSimulation(boss.id, { translationId: request.translationId, replyIndex: request.replyIndex }, (event, data) => {
        if (event === "meta") {
          setThreadId(data.threadId);
          setArchiveId(data.archiveId);
          setMessages([...data.messages, { id: "simulation-stream", role: "assistant", content: "", kind: data.usesActualResponse ? "ACTUAL_RESPONSE" : "SIMULATION_REACTION", createdAt: new Date().toISOString() }]);
        }
        if (event === "delta") {
          reaction += data.text;
          setMessages((old) => old.map((item) => item.id === "simulation-stream" ? { ...item, content: reaction } : item));
          onActivity({ thinking: true, speech: reaction });
        }
        if (event === "done") {
          reaction = data.message.content;
          setMessages((old) => old.map((item) => item.id === "simulation-stream" ? data.message : item));
          setFailedSimulation(undefined);
          onActivity({ thinking: false, speech: reaction });
        }
      }, { signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "상사의 반응을 만들지 못했습니다.";
      setMessages((old) => old.filter((item) => item.id !== "simulation-stream"));
      setSimulationError(message);
      onActivity({ thinking: false, speech: message });
    } finally {
      if (simulationController.current === controller) {
        simulationController.current = undefined;
        setSimulationLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!simulationRequest || handledSimulationId.current === simulationRequest.id) return;
    handledSimulationId.current = simulationRequest.id;
    void runSimulation(simulationRequest);
  }, [simulationRequest?.id]);

  const copyMessage = async (id: string, content: string) => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(id);
      window.setTimeout(() => setCopiedMessageId((current) => current === id ? undefined : current), 1500);
    } catch {
      setError("메시지를 복사하지 못했습니다.");
    }
  };

  const copyCoaching = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedCoachingId(id);
      window.setTimeout(() => setCopiedCoachingId((current) => current === id ? undefined : current), 1500);
    } catch {
      setError("수정본을 복사하지 못했습니다.");
    }
  };

  const reviewMessage = async (messageId: string) => {
    try {
      const result = await api<{ coaching: ChatMessageCoaching }>(`/bosses/${boss.id}/chat/messages/${messageId}/coaching`, { method: "POST", timeoutMs: 30_000 });
      setMessages((old) => old.map((item) => item.id === messageId ? { ...item, coaching: result.coaching } : item));
    } catch {
      // Coaching is an optional aid and must never interrupt the boss response.
    }
  };

  const saveActualResponse = async (content: string) => {
    if (!archiveId || actualSaving) return;
    setActualSaving(true);
    setActualError(undefined);
    try {
      const result = await api<{ archive: TranslationArchiveDetail; activeChat: { threadId: string; archiveId: string; messages: ChatMessage[] } | null }>(`/archives/${archiveId}/actual-response`, { method: "PUT", body: JSON.stringify({ content }) });
      if (result.activeChat) {
        olderRequestController.current?.abort();
        loadingOlderRef.current = false;
        setLoadingOlder(false);
        setThreadId(result.activeChat.threadId);
        setArchiveId(result.activeChat.archiveId);
        setMessages(result.activeChat.messages);
        setNextCursor(null);
        setOlderError(undefined);
        cache.setQueryData(["chat", boss.id], { ...result.activeChat, nextCursor: null });
      }
      setActualMessage(undefined);
      onActivity({ thinking: false, speech: content });
    } catch (cause) {
      setActualError(cause instanceof Error ? cause.message : "실제 상사 답변을 저장하지 못했습니다.");
    } finally {
      setActualSaving(false);
    }
  };

  const send = async (retryMessage?: string) => {
    const message = (retryMessage ?? text).trim();
    if (!message || streaming || simulationLoading || actualSaving || resetting) return;
    setText("");
    window.requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.style.height = "auto";
    });
    setError(undefined);
    setFailedMessage(undefined);
    const optimisticMessageId = crypto.randomUUID();
    setMessages((old) => [
      ...old.filter((item) => item.id !== "stream"),
      { id: optimisticMessageId, role: "user", content: message, kind: "CHAT", createdAt: new Date().toISOString() },
      { id: "stream", role: "assistant", content: "", kind: "CHAT", createdAt: new Date().toISOString() },
    ]);
    setStreaming(true);
    onActivity({ thinking: true });
    const controller = new AbortController();
    requestController.current = controller;

    try {
      let streamed = "";
      await streamBossChat(boss.id, { threadId, message }, (event, data) => {
        if (event === "meta") {
          setThreadId(data.threadId);
          if (data.messageId) {
            setMessages((old) => old.map((item) => item.id === optimisticMessageId ? { ...item, id: data.messageId } : item));
            void reviewMessage(data.messageId);
          }
        }
        if (event === "delta") {
          streamed += data.text;
          setMessages((old) => old.map((item) => item.id === "stream" ? { ...item, content: streamed } : item));
          onActivity({ thinking: true, speech: streamed });
        }
        if (event === "done") {
          setMessages((old) => old.map((item) => item.id === "stream" ? data.message : item));
          onActivity({ thinking: false, speech: data.message.content });
        }
      }, { signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const messageText = cause instanceof Error ? cause.message : "답변을 만들지 못했습니다.";
      setMessages((old) => old.filter((item) => item.id !== "stream"));
      setError(messageText);
      setFailedMessage(message);
      setText(message);
      onActivity({ thinking: false, speech: messageText });
    } finally {
      if (requestController.current === controller) requestController.current = undefined;
      setStreaming(false);
    }
  };

  const resetChat = async () => {
    if (streaming || simulationLoading || actualSaving || resetting) return;
    const hasLocalContent = messages.length > 0 || Boolean(text.trim()) || hasUnsavedActualResponse;
    if (hasLocalContent && !window.confirm("현재 라이브 대화를 초기화할까요? 번역 아카이브와 저장된 실제 상사 답변은 유지됩니다.")) return;
    setResetting(true);
    olderRequestController.current?.abort();
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setError(undefined);
    try {
      await api(`/bosses/${boss.id}/chat`, { method: "DELETE" });
      simulationStarted.current = true;
      setMessages([]);
      setThreadId(undefined);
      setNextCursor(null);
      setOlderError(undefined);
      setText("");
      setSimulationError(undefined);
      setFailedSimulation(undefined);
      setActualMessage(undefined);
      setActualError(undefined);
      cache.setQueryData(["chat", boss.id], { threadId: null, archiveId: null, messages: [] });
      onActivity({ thinking: false });
      onReset?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "대화를 초기화하지 못했습니다.");
    } finally {
      setResetting(false);
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const canCollectActual = (message.kind === "SIMULATION_REACTION" || message.kind === "ACTUAL_RESPONSE") && message.id !== "simulation-stream" && Boolean(message.content) && Boolean(archiveId);
    const coaching = message.role === "user" && message.kind === "CHAT" && message.coaching?.shouldSuggest ? message.coaching : null;
    return <div className={`chat-message-block ${message.role}`} key={message.id}>
      {message.kind === "ACTUAL_RESPONSE" && <span className="actual-response-label">실제 답변</span>}
      <div className={`chat-message-row ${message.role}`}>
        <div className={`chat-message ${message.role}${!message.content ? " is-typing" : ""}`}>{message.content || <span className="chat-typing-indicator" aria-label="상사가 답변을 입력하고 있습니다"><i/><i/><i/></span>}</div>
        {message.role === "user" && message.content && <button className="message-copy-button" type="button" aria-label={copiedMessageId === message.id ? "복사됨" : "메시지 복사"} onClick={() => void copyMessage(message.id, message.content)}>{copiedMessageId === message.id ? <Check size={14}/> : <Copy size={14}/>}</button>}
      </div>
      {coaching?.revisedText && <aside className="chat-coaching-card" aria-label="대화 문장 수정 제안">
        <strong>이렇게 다듬어보는 건 어때요?</strong>
        {coaching.reason && <p>{coaching.reason}</p>}
        <div className="chat-coaching-revision"><span>{coaching.revisedText}</span><button type="button" onClick={() => void copyCoaching(message.id, coaching.revisedText!)} aria-label={copiedCoachingId === message.id ? "수정본 복사됨" : "수정본 복사"}>{copiedCoachingId === message.id ? <Check size={14}/> : <Copy size={14}/>}<span>{copiedCoachingId === message.id ? "복사됨" : "수정본 복사"}</span></button></div>
      </aside>}
      {canCollectActual && <button className="actual-response-trigger" type="button" disabled={actualSaving || simulationLoading} onClick={() => { setActualMessage(message); setActualError(undefined); }}>{message.kind === "ACTUAL_RESPONSE" ? "실제 답변 수정" : "실제 답변은 달랐어요"}</button>}
    </div>;
  };

  return <section id="chat-panel" className="workspace-tab-panel" role="tabpanel" aria-labelledby="workspace-tab-chat" aria-label={`${boss.alias}${waGwa(boss.alias)} 대화`} hidden={!active} aria-busy={busy}>
    <div className="workspace-panel-title chat-panel-title"><h2><MessageCircle size={18}/>{boss.alias}{waGwa(boss.alias)} 대화</h2><button className="chat-reset-button" type="button" disabled={busy} onClick={() => void resetChat()} aria-label="대화 초기화" title="대화 초기화"><RotateCcw size={17}/></button></div>
    <p className="panel-hint">가상 시뮬레이션이며 실제 인물의 생각을 단정하지 않습니다.</p>
    <div ref={chatListRef} className="chat-list" aria-live="polite" onScroll={(event) => { const list = event.currentTarget; stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120; if (list.scrollTop <= 80) void loadOlderMessages(); }}>
      {history.isLoading && !simulationStarted.current && <p className="hint">이전 대화를 불러오는 중입니다.</p>}
      {history.isError && <p className="error-text" role="alert">이전 대화를 불러오지 못했습니다.</p>}
      {loadingOlder && <p className="chat-history-status" role="status">이전 대화를 불러오는 중…</p>}
      {olderError && <div className="chat-history-error" role="alert"><span>{olderError}</span><button className="small-button" type="button" onClick={() => void loadOlderMessages()}><RefreshCw size={14}/>다시 시도</button></div>}
      {simulationLoading && messages.length === 0 && <div className="simulation-loading" role="status" aria-label="대화 시뮬레이션 준비 중">
        <span className="simulation-loading-spinner" aria-hidden="true"/>
        <div><strong>대화를 준비하고 있어요.</strong><p>상사가 어떻게 반응할지 시뮬레이션하는 중입니다.</p></div>
      </div>}
      {!history.isLoading && messages.length === 0 && !simulationLoading && <div className="panel-empty"><MessageCircle size={22}/><p>하고 싶은 말을 적어보세요.</p></div>}
      {messages.map(renderMessage)}
      {simulationError && <div className="chat-stream-error" role="alert"><span>{simulationError}</span>{failedSimulation && <button className="small-button" type="button" disabled={simulationLoading} onClick={() => void runSimulation(failedSimulation)}><RefreshCw size={14}/>다시 시도</button>}</div>}
      {error && <div className="chat-stream-error" role="alert"><span>{error}</span>{failedMessage && <button className="small-button" type="button" disabled={streaming} onClick={() => void send(failedMessage)}><RefreshCw size={14}/>다시 시도</button>}</div>}
    </div>
    <div className="chat-composer">
      <textarea ref={inputRef} className="input chat-input" rows={1} value={text} disabled={busy} inputMode="text" enterKeyHint="done" autoCapitalize="sentences" autoCorrect="on" onFocus={() => window.requestAnimationFrame(() => { const list = chatListRef.current; if (list) list.scrollTop = list.scrollHeight; })} onChange={(event) => { setText(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="할 말을 입력하세요" aria-label="대화 입력"/>
      <button className="primary-button" type="button" disabled={!text.trim() || busy} onClick={() => void send()} aria-label="보내기"><Send size={18}/></button>
    </div><ActualResponseDialog open={Boolean(actualMessage)} initialValue={actualMessage?.kind === "ACTUAL_RESPONSE" ? actualMessage.content : ""} saving={actualSaving} error={actualError} onClose={() => { setActualMessage(undefined); setActualError(undefined); }} onSubmit={(content) => void saveActualResponse(content)}/>
  </section>;
}
