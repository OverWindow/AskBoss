import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { api } from "../../services/api-client";
import { streamBossSimulation } from "../../services/sse-client";

vi.mock("../../services/api-client", () => ({ api: vi.fn() }));
vi.mock("../../services/sse-client", () => ({ streamBossChat: vi.fn(), streamBossSimulation: vi.fn() }));

const boss: any = { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };

describe("ChatPanel simulations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the simulation separately from persisted chat history", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(api).mockResolvedValue({ threadId: null, messages: [] } as any);
    vi.mocked(streamBossSimulation).mockImplementation(async (_bossId, _body, onEvent) => {
      onEvent("meta", { inputText: "이거 언제 되나?", reply: "오늘 오후까지 공유드리겠습니다." });
      onEvent("delta", { text: "오후에는 " });
      onEvent("done", { content: "오후에는 꼭 결과로 공유해." });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><ChatPanel boss={boss} open simulationRequest={{ id: "simulation-1", translationId: "00000000-0000-4000-8000-000000000010", replyIndex: 0, inputText: "이거 언제 되나?", reply: "오늘 오후까지 공유드리겠습니다." }} onClose={() => undefined} onActivity={() => undefined}/></QueryClientProvider>);

    expect(await screen.findByText("임시 시뮬레이션")).toBeInTheDocument();
    expect(screen.getByText("기록되지 않음")).toBeInTheDocument();
    expect(screen.getByText("이거 언제 되나?")).toHaveClass("assistant");
    expect(screen.getByText("오늘 오후까지 공유드리겠습니다.")).toHaveClass("user");
    await waitFor(() => expect(screen.getByText("오후에는 꼭 결과로 공유해.")).toHaveClass("assistant"));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(`/bosses/${boss.id}/chat`);
  });
});
