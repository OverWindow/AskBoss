import { useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send, X } from "lucide-react";
import type { Boss } from "@askboss/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api-client";
import { streamBossChat } from "../../services/sse-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatPanelProps {
  boss: Boss;
  open: boolean;
  onClose: () => void;
  onActivity: (state: { thinking: boolean; speech?: string }) => void;
}

export function ChatPanel({ boss, open, onClose, onActivity }: ChatPanelProps) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string>();
  const [failedMessage, setFailedMessage] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestController = useRef<AbortController | undefined>(undefined);
  const history = useQuery({
    queryKey: ["chat", boss.id],
    queryFn: () => api<{ threadId: string | null; messages: Message[] }>(`/bosses/${boss.id}/chat`),
  });

  useEffect(() => {
    if (history.data) {
      setMessages(history.data.messages);
      setThreadId(history.data.threadId ?? undefined);
    }
  }, [history.data]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [open]);

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => () => requestController.current?.abort(), [boss.id]);

  const send = async (retryMessage?: string) => {
    const message = (retryMessage ?? text).trim();
    if (!message || streaming) return;
    setText("");
    setError(undefined);
    setFailedMessage(undefined);
    setMessages((old) => [
      ...old.filter((item) => item.id !== "stream"),
      { id: crypto.randomUUID(), role: "user", content: message, createdAt: new Date().toISOString() },
      { id: "stream", role: "assistant", content: "", createdAt: new Date().toISOString() },
    ]);
    setStreaming(true);
    onActivity({ thinking: true, speech: "생각을 정리하고 있습니다…" });
    const controller = new AbortController();
    requestController.current = controller;

    try {
      let streamed = "";
      await streamBossChat(boss.id, { threadId, message }, (event, data) => {
        if (event === "meta") setThreadId(data.threadId);
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

  return <section id="chat-panel" className={`workspace-panel chat-panel ${open ? "is-open" : ""}`} aria-label={`${boss.alias}와 대화`} aria-hidden={!open} aria-busy={streaming}>
    <header className="workspace-panel-header">
      <div><span className="panel-kicker">CONVERSATION</span><h2><MessageCircle size={18}/>{boss.alias}와 대화</h2></div>
      <button className="panel-close-button" type="button" onClick={onClose} aria-label="대화 패널 닫기"><X size={18}/></button>
    </header>
    <p className="panel-hint">가상 시뮬레이션이며 실제 인물의 생각을 단정하지 않습니다.</p>
    <div className="chat-list" aria-live="polite">
      {history.isLoading && <p className="hint">이전 대화를 불러오는 중입니다.</p>}
      {history.isError && <p className="error-text" role="alert">이전 대화를 불러오지 못했습니다.</p>}
      {!history.isLoading && messages.length === 0 && <div className="panel-empty"><MessageCircle size={22}/><p>상황이나 하고 싶은 말을 적어보세요.</p></div>}
      {messages.map((message) => <div key={message.id} className={`chat-message ${message.role}`}>{message.content || "…"}</div>)}
      {error && <div className="chat-stream-error" role="alert"><span>{error}</span>{failedMessage && <button className="small-button" type="button" disabled={streaming} onClick={() => void send(failedMessage)}><RefreshCw size={14}/>다시 시도</button>}</div>}
      <div ref={bottom}/>
    </div>
    <div className="chat-composer">
      <input ref={inputRef} className="input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void send(); }} placeholder="상황이나 할 말을 입력하세요" aria-label="대화 입력"/>
      <button className="primary-button" type="button" disabled={!text.trim() || streaming} onClick={() => void send()} aria-label="보내기"><Send size={18}/></button>
    </div>
  </section>;
}
