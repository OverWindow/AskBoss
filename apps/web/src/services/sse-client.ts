const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const FIRST_DELTA_TIMEOUT_MS = 30_000;
const DELTA_IDLE_TIMEOUT_MS = 25_000;
const TOTAL_TIMEOUT_MS = 90_000;

interface ChatStreamOptions {
  signal?: AbortSignal;
  firstDeltaTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
}

export class ChatStreamError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}

export async function streamBossChat(
  bossId: string,
  body: unknown,
  onEvent: (event: string, data: any) => void,
  options: ChatStreamOptions = {},
) {
  const controller = new AbortController();
  let timeoutError: ChatStreamError | null = null;
  let completed = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const abortWith = (code: string, message: string) => {
    if (controller.signal.aborted) return;
    timeoutError = new ChatStreamError(code, message);
    controller.abort(timeoutError);
  };
  const onExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) onExternalAbort();
  else options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  const firstDeltaTimer = setTimeout(
    () => abortWith("AI_FIRST_DELTA_TIMEOUT", "첫 답변이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."),
    options.firstDeltaTimeoutMs ?? FIRST_DELTA_TIMEOUT_MS,
  );
  const totalTimer = setTimeout(
    () => abortWith("AI_TIMEOUT", "답변 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."),
    options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS,
  );

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${base}/bosses/${bossId}/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ChatStreamError(data?.error?.code ?? "CHAT_START_FAILED", data?.error?.message ?? "대화를 시작하지 못했습니다.");
    }
    reader = response.body?.getReader();
    if (!reader) throw new ChatStreamError("STREAM_UNSUPPORTED", "스트리밍을 지원하지 않는 환경입니다.");

    const decoder = new TextDecoder();
    let buffer = "";
    const consume = (block: string) => {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) return;
      const parsed = JSON.parse(dataLines.join("\n"));
      onEvent(event, parsed);
      if (event === "delta") {
        clearTimeout(firstDeltaTimer);
        clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => abortWith("AI_IDLE_TIMEOUT", "답변이 중간에 지연되고 있습니다. 잠시 후 다시 시도해 주세요."),
          options.idleTimeoutMs ?? DELTA_IDLE_TIMEOUT_MS,
        );
      }
      if (event === "done") completed = true;
      if (event === "error") throw new ChatStreamError(parsed.code ?? "AI_RESPONSE_ERROR", parsed.message ?? "답변을 만들지 못했습니다.");
    };

    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (completed) break;
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (!completed) {
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
    }
    if (!completed) throw new ChatStreamError("STREAM_INCOMPLETE", "대화 연결이 완료되기 전에 종료되었습니다. 다시 시도해 주세요.");
  } catch (error) {
    if (timeoutError) throw timeoutError;
    if (error instanceof ChatStreamError) throw error;
    if (options.signal?.aborted) throw new ChatStreamError("REQUEST_ABORTED", "대화 요청이 취소되었습니다.");
    throw new ChatStreamError("API_UNAVAILABLE", "대화 API에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    clearTimeout(firstDeltaTimer);
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
    options.signal?.removeEventListener("abort", onExternalAbort);
    if (reader && !completed) await reader.cancel().catch(() => undefined);
  }
}
