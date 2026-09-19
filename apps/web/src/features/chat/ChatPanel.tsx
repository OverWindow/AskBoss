import { useEffect, useRef, useState } from "react";
import { Check, Copy, MessageCircle, RefreshCw, Send } from "lucide-react";
import type { Boss } from "@askboss/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api-client";
import { streamBossChat, streamBossSimulation } from "../../services/sse-client";
import type { ChatSimulationRequest } from "./simulation-types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatPanelProps {
  boss: Boss;
  active: boolean;
  simulationRequest: ChatSimulationRequest | null;
  onActivity: (state: { thinking: boolean; speech?: string }) => void;
}

interface SimulationPreview {
  request: ChatSimulationRequest;
  inputText: string;
  reply: string;
  reaction: string;
  loading: boolean;
  error?: string;
}

export function ChatPanel({ boss, active, simulationRequest, onActivity }: ChatPanelProps) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationPreview, setSimulationPreview] = useState<SimulationPreview | null>(null);
  const [error, setError] = useState<string>();
  const [failedMessage, setFailedMessage] = useState<string>();
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const chatListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | undefined>(undefined);
  const simulationController = useRef<AbortController | undefined>(undefined);
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
    if (active) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.requestAnimationFrame(() => {
      const chatList = chatListRef.current;
      if (chatList) chatList.scrollTop = chatList.scrollHeight;
    });
  }, [messages, active, simulationPreview?.reaction, simulationPreview?.loading]);

  useEffect(() => {
    setSimulationPreview(null);
    return () => { requestController.current?.abort(); simulationController.current?.abort(); };
  }, [boss.id]);

  const runSimulation = async (request: ChatSimulationRequest) => {
    simulationController.current?.abort();
    const controller = new AbortController();
    simulationController.current = controller;
    setSimulationLoading(true);
    setSimulationPreview({ request, inputText: request.inputText, reply: request.reply, reaction: "", loading: true });
    onActivity({ thinking: true, speech: "상사의 반응을 시뮬레이션하고 있습니다…" });
    try {
      let reaction = "";
      await streamBossSimulation(boss.id, { translationId: request.translationId, replyIndex: request.replyIndex }, (event, data) => {
        if (event === "meta") setSimulationPreview((current) => current?.request.id === request.id ? { ...current, inputText: data.inputText, reply: data.reply } : current);
        if (event === "delta") {
          reaction += data.text;
          setSimulationPreview((current) => current?.request.id === request.id ? { ...current, reaction } : current);
          onActivity({ thinking: true, speech: reaction });
        }
        if (event === "done") {
          reaction = data.content;
          setSimulationPreview((current) => current?.request.id === request.id ? { ...current, reaction, loading: false, error: undefined } : current);
          onActivity({ thinking: false, speech: reaction });
        }
      }, { signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "상사의 반응을 만들지 못했습니다.";
      setSimulationPreview((current) => current?.request.id === request.id ? { ...current, loading: false, error: message } : current);
      onActivity({ thinking: false, speech: message });
    } finally {
      if (simulationController.current === controller) {
        simulationController.current = undefined;
        setSimulationLoading(false);
      }
    }
  };

  useEffect(() => {
    if (simulationRequest) void runSimulation(simulationRequest);
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

  const renderMessage = (id: string, role: Message["role"], content: string) => <div key={id} className={`chat-message-row ${role}`}>
    <div className={`chat-message ${role}`}>{content || "…"}</div>
    {content && <button className="message-copy-button" type="button" aria-label={copiedMessageId === id ? "복사됨" : "메시지 복사"} onClick={() => void copyMessage(id, content)}>{copiedMessageId === id ? <Check size={14}/> : <Copy size={14}/>}</button>}
  </div>;

  const send = async (retryMessage?: string) => {
    const message = (retryMessage ?? text).trim();
    if (!message || streaming || simulationLoading) return;
    setText("");
    window.requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.style.height = "auto";
    });
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

  return <section id="chat-panel" className="workspace-tab-panel" role="tabpanel" aria-labelledby="workspace-tab-chat" aria-label={`${boss.alias}와 대화`} hidden={!active} aria-busy={streaming || simulationLoading}>
    <div className="workspace-panel-title"><h2><MessageCircle size={18}/>{boss.alias}와 대화</h2></div>
    <p className="panel-hint">가상 시뮬레이션이며 실제 인물의 생각을 단정하지 않습니다.</p>
    <div ref={chatListRef} className="chat-list" aria-live="polite">
      {history.isLoading && <p className="hint">이전 대화를 불러오는 중입니다.</p>}
      {history.isError && <p className="error-text" role="alert">이전 대화를 불러오지 못했습니다.</p>}
      {!history.isLoading && messages.length === 0 && !simulationPreview && <div className="panel-empty"><MessageCircle size={22}/><p>하고 싶은 말을 적어보세요.</p></div>}
      {messages.map((message) => renderMessage(message.id, message.role, message.content))}
      {simulationPreview && <section className="simulation-preview" aria-label="임시 답변 시뮬레이션"><div className="simulation-preview-label"><strong>임시 시뮬레이션</strong><span>기록되지 않음</span></div>{renderMessage(`${simulationPreview.request.id}-input`, "assistant", simulationPreview.inputText)}{renderMessage(`${simulationPreview.request.id}-reply`, "user", simulationPreview.reply)}{renderMessage(`${simulationPreview.request.id}-reaction`, "assistant", simulationPreview.reaction)}{simulationPreview.error && <div className="chat-stream-error" role="alert"><span>{simulationPreview.error}</span><button className="small-button" type="button" disabled={simulationLoading} onClick={() => void runSimulation(simulationPreview.request)}><RefreshCw size={14}/>다시 시도</button></div>}</section>}
      {error && <div className="chat-stream-error" role="alert"><span>{error}</span>{failedMessage && <button className="small-button" type="button" disabled={streaming} onClick={() => void send(failedMessage)}><RefreshCw size={14}/>다시 시도</button>}</div>}
    </div>
    <div className="chat-composer">
      <textarea ref={inputRef} className="input chat-input" rows={1} value={text} onChange={(event) => { setText(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="할 말을 입력하세요" aria-label="대화 입력"/>
      <button className="primary-button" type="button" disabled={!text.trim() || streaming || simulationLoading} onClick={() => void send()} aria-label="보내기"><Send size={18}/></button>
    </div>
  </section>;
}
