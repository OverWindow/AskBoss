const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export async function streamBossChat(bossId: string, body: unknown, onEvent: (event: string, data: any) => void) {
  const response = await fetch(`${base}/bosses/${bossId}/chat`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("대화를 시작하지 못했습니다.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("스트리밍을 지원하지 않는 환경입니다.");
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const consume = (block: string) => {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    const parsed = JSON.parse(data);
    onEvent(event, parsed);
    if (event === "done") completed = true;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  if (!completed) throw new Error("대화 연결이 완료되기 전에 종료되었습니다.");
}
