import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { api } from "../../services/api-client";
import { streamBossChat, streamBossSimulation } from "../../services/sse-client";

vi.mock("../../services/api-client", () => ({ api: vi.fn() }));
vi.mock("../../services/sse-client", () => ({ streamBossChat: vi.fn(), streamBossSimulation: vi.fn() }));

const boss: any = { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };
const source = { id: "00000000-0000-4000-8000-000000000101", role: "assistant", kind: "SIMULATION_SOURCE", content: "이거 언제 되나?", createdAt: "2026-01-01T00:00:00.000Z" };
const reply = { id: "00000000-0000-4000-8000-000000000102", role: "user", kind: "SIMULATION_REPLY", content: "오늘 오후까지 공유드리겠습니다.", createdAt: "2026-01-01T00:00:01.000Z" };
const reaction = { id: "00000000-0000-4000-8000-000000000103", role: "assistant", kind: "SIMULATION_REACTION", content: "오후에는 꼭 결과로 공유해.", createdAt: "2026-01-01T00:00:02.000Z" };

function renderPanel(props: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ChatPanel boss={boss} active simulationRequest={null} onActivity={() => undefined} {...props}/></QueryClientProvider>);
}

describe("ChatPanel simulations", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(streamBossChat).mockReset();
    vi.mocked(streamBossSimulation).mockReset();
    vi.mocked(api).mockResolvedValue({ threadId: null, archiveId: null, messages: [] } as any);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("turns a simulation into the only persisted conversation and continues on its thread", async () => {
    vi.mocked(streamBossSimulation).mockImplementation(async (_bossId, _body, onEvent) => {
      onEvent("meta", { threadId: "thread-1", messages: [source, reply] });
      onEvent("delta", { text: "오후에는 " });
      onEvent("done", { message: reaction });
    });
    vi.mocked(streamBossChat).mockImplementation(async (_bossId, body: any, onEvent) => {
      expect(body).toEqual({ threadId: "thread-1", message: "그 다음에는요?" });
      onEvent("meta", { threadId: "thread-1" });
      onEvent("delta", { text: "변동이 있으면 " });
      onEvent("done", { message: { id: "message-4", role: "assistant", kind: "CHAT", content: "변동이 있으면 바로 알려줘.", createdAt: "2026-01-01T00:00:03.000Z" } });
    });

    renderPanel({ simulationRequest: { id: "simulation-1", translationId: "00000000-0000-4000-8000-000000000010", replyIndex: 0, inputText: source.content, reply: reply.content } });

    expect(await screen.findByText(source.content)).toHaveClass("assistant");
    expect(screen.getByText(reply.content)).toHaveClass("user");
    expect(await screen.findByText(reaction.content)).toHaveClass("assistant");
    expect(screen.queryByText("임시 시뮬레이션")).not.toBeInTheDocument();
    expect(screen.queryByText("기록되지 않음")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("대화 입력"), { target: { value: "그 다음에는요?" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText("변동이 있으면 바로 알려줘.")).toBeInTheDocument();
  });

  it("replaces the prediction and later messages with an editable actual-response bubble", async () => {
    const followUp = { id: "00000000-0000-4000-8000-000000000104", role: "user", kind: "CHAT", content: "네, 네 시까지 드리겠습니다.", createdAt: "2026-01-01T00:00:03.000Z" };
    const actual = { id: "00000000-0000-4000-8000-000000000105", role: "assistant", kind: "ACTUAL_RESPONSE", content: "좋아, 네 시에 다시 보자.", createdAt: "2026-01-01T01:00:00.000Z" };
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (String(path).endsWith("/actual-response") && options?.method === "PUT") {
        const content = JSON.parse(String(options.body)).content;
        return {
          archive: { actualResponse: { content, replyIndex: 0, replyText: reply.content, updatedAt: "2026-01-01T01:00:00.000Z" } },
          activeChat: { threadId: `thread-${content.includes("다섯") ? "3" : "2"}`, archiveId: "archive-1", messages: [source, reply, { ...actual, content }] },
          application: "SESSION_CALIBRATION",
        } as any;
      }
      return { threadId: "thread-1", archiveId: "archive-1", messages: [source, reply, reaction, followUp] } as any;
    });
    renderPanel();

    expect(await screen.findByText(reaction.content)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "실제로 답변은 달랐어요" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "실제로 답변은 달랐어요" }));
    fireEvent.change(screen.getByLabelText("실제로 상사는 뭐라고 답했나요?"), { target: { value: "좋아, 네 시에 다시 보자." } });
    fireEvent.click(screen.getByRole("button", { name: "실제 답변 반영" }));
    await waitFor(() => expect(screen.queryByLabelText("실제로 상사는 뭐라고 답했나요?")).not.toBeInTheDocument());
    expect(screen.queryByText(reaction.content)).not.toBeInTheDocument();
    expect(screen.queryByText(followUp.content)).not.toBeInTheDocument();
    expect(screen.getByText("좋아, 네 시에 다시 보자.")).toHaveClass("chat-message", "assistant");
    expect(screen.getByText("실제 답변")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "실제 답변 수정" }));
    expect(screen.getByLabelText("실제로 상사는 뭐라고 답했나요?")).toHaveValue("좋아, 네 시에 다시 보자.");
    fireEvent.change(screen.getByLabelText("실제로 상사는 뭐라고 답했나요?"), { target: { value: "좋아, 다섯 시에 보자." } });
    fireEvent.click(screen.getByRole("button", { name: "실제 답변 반영" }));
    await waitFor(() => expect(screen.getByText("좋아, 다섯 시에 보자.")).toBeInTheDocument());
    expect(vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/actual-response"))).toHaveLength(2);
  });

  it("restores an actual-response message and confirms before resetting chat", async () => {
    const restoredReaction = { ...reaction, kind: "ACTUAL_RESPONSE", content: "실제로는 내일 보자고 했습니다." };
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (options?.method === "DELETE") return undefined as any;
      return { threadId: "thread-1", archiveId: "archive-1", messages: [source, reply, restoredReaction] } as any;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onReset = vi.fn();
    renderPanel({ onReset });

    expect(await screen.findByText("실제로는 내일 보자고 했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대화 초기화" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalledWith(`/bosses/${boss.id}/chat`, { method: "DELETE" });
    expect(screen.getByText(restoredReaction.content)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "대화 초기화" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/bosses/${boss.id}/chat`, { method: "DELETE" }));
    expect(await screen.findByText("하고 싶은 말을 적어보세요.")).toBeInTheDocument();
    expect(onReset).toHaveBeenCalled();
  });

  it("uses speech-only copy for user messages", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(api).mockResolvedValue({ threadId: "thread-1", archiveId: "archive-1", messages: [reply] } as any);
    renderPanel();

    expect(await screen.findByText(reply.content)).toBeInTheDocument();
    expect(screen.queryByText("CONVERSATION")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메시지 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(reply.content));
  });
});
