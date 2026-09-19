import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveModal } from "./ArchivePage";
import { api } from "../services/api-client";

vi.mock("../features/session/useSession", () => ({ useSession: () => ({ isSuccess: true, isLoading: false, isError: false }) }));
vi.mock("../services/api-client", () => ({ api: vi.fn() }));

const mockedApi = vi.mocked(api);
const summary: any = {
  id: "00000000-0000-4000-8000-000000000020",
  boss: { id: "00000000-0000-4000-8000-000000000001", alias: "모두의 상사", avatarKey: "boss-male-01", scope: "GLOBAL" },
  inputText: "이거 언제 되나?",
  channel: "사내 메신저",
  lastCopiedReplyIndex: 0,
  actualResponse: { content: "내일 오전에 다시 보자.", replyIndex: 0, replyText: "오늘 오후까지 공유드리겠습니다.", updatedAt: "2026-01-01T00:00:04.000Z" },
  branchCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:04.000Z",
};
const detail: any = {
  ...summary,
  result: {
    plainMeaning: "완료 일정을 묻는 말입니다.", likelyIntent: ["일정 확인"], tone: "간결함", confidence: 0.8, surfaceActualGapScore: 20,
    replies: [
      { style: "무난하게", text: "오늘 오후까지 공유드리겠습니다.", reason: "일정 안내" },
      { style: "간결하게", text: "오후에 드리겠습니다.", reason: "시점 안내" },
      { style: "부드럽게", text: "정리해서 공유드리겠습니다.", reason: "예의 유지" },
    ],
  },
  branches: [
    { id: "branch-actual", kind: "ACTUAL", status: "ACTIVE", replyIndex: 0, createdAt: "2026-01-01T00:00:04.000Z", updatedAt: "2026-01-01T00:00:04.000Z", messages: [{ id: "message-actual", role: "assistant", kind: "ACTUAL_RESPONSE", content: "내일 오전에 다시 보자.", createdAt: "2026-01-01T00:00:04.000Z" }] },
    { id: "branch-predicted", kind: "PREDICTED", status: "SUPERSEDED", replyIndex: 0, createdAt: "2026-01-01T00:00:01.000Z", updatedAt: "2026-01-01T00:00:03.000Z", messages: [{ id: "message-followup", role: "user", kind: "CHAT", content: "네, 확인했습니다.", createdAt: "2026-01-01T00:00:03.000Z" }] },
  ],
};

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { onClose, ...render(<QueryClientProvider client={client}><ArchiveModal open onClose={onClose}/></QueryClientProvider>) };
}

describe("ArchiveModal", () => {
  let items: any[];
  beforeEach(() => {
    items = [summary];
    mockedApi.mockReset();
    mockedApi.mockImplementation(async (path, options) => {
      if (path === `/archives/${summary.id}` && options?.method === "DELETE") {
        items = [];
        return undefined as any;
      }
      if (String(path).endsWith("/actual-response") && options?.method === "PUT") {
        const content = JSON.parse(String(options.body)).content;
        return { archive: { ...detail, actualResponse: { ...detail.actualResponse, content } }, activeChat: null, application: "SESSION_CALIBRATION" } as any;
      }
      if (path === `/archives/${summary.id}`) return { archive: detail } as any;
      return { items, nextCursor: null } as any;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("expands a translation into its copied reply and both preserved conversation branches", async () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "번역 아카이브" })).toBeInTheDocument();
    expect(await screen.findByText(summary.inputText)).toBeInTheDocument();
    expect(screen.getByText("실제 답변 있음")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(summary.inputText) }));
    expect(await screen.findByText("완료 일정을 묻는 말입니다.")).toBeInTheDocument();
    expect(screen.getByText("마지막으로 복사한 답변")).toBeInTheDocument();
    expect(screen.getByText(/예상 답변 기반 대화/)).toBeInTheDocument();
    expect(screen.getByText(/실제 답변 기반 대화/)).toBeInTheDocument();
    expect(screen.getByText("네, 확인했습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("내일 오전에 다시 보자.").length).toBeGreaterThan(0);
  });

  it("edits an actual response from an archive card", async () => {
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(summary.inputText) }));
    fireEvent.click(await screen.findByRole("button", { name: "수정" }));
    const input = screen.getByLabelText("실제로 상사는 뭐라고 답했나요?");
    expect(input).toHaveValue("내일 오전에 다시 보자.");
    fireEvent.change(input, { target: { value: "실제로는 오후 네 시에 다시 보자고 했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "실제 답변 반영" }));
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith(`/archives/${summary.id}/actual-response`, expect.objectContaining({ method: "PUT" })));
    expect(await screen.findByText("실제로는 오후 네 시에 다시 보자고 했습니다.")).toBeInTheDocument();
  });

  it("closes from the modal close button", () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole("button", { name: "아카이브 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation and removes the deleted item immediately", async () => {
    renderModal();
    await screen.findByText(summary.inputText);
    fireEvent.click(screen.getByRole("button", { name: "번역 아카이브 삭제" }));
    expect(screen.getByRole("dialog", { name: "번역 아카이브 삭제" })).toHaveTextContent("복구할 수 없습니다");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByText(summary.inputText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "번역 아카이브 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith(`/archives/${summary.id}`, { method: "DELETE" }));
    expect(await screen.findByText("아직 저장된 번역이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(summary.inputText)).not.toBeInTheDocument();
  });
});
