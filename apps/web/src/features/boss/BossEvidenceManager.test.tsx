import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BossEvidenceSummary } from "@askboss/shared";
import { api } from "../../services/api-client";
import { BossEvidenceManager } from "./BossEvidenceManager";

vi.mock("../../services/api-client", () => ({ api: vi.fn() }));

const mockedApi = vi.mocked(api);
const createdAt = "2026-09-20T03:00:00.000Z";
const summary = (overrides: Partial<BossEvidenceSummary> = {}): BossEvidenceSummary => ({
  id: "00000000-0000-4000-8000-000000000001",
  type: "TEXT",
  status: "READY",
  sourceName: "붙여넣기",
  errorMessage: null,
  createdAt,
  ...overrides,
});

function renderManager(props: Partial<React.ComponentProps<typeof BossEvidenceManager>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const callbacks = {
    onProcessingChange: vi.fn(),
    onPersonaJob: vi.fn(async () => undefined),
    onPersonaUpdated: vi.fn(async () => undefined),
  };
  render(<QueryClientProvider client={client}><BossEvidenceManager bossId="boss-1" {...callbacks} {...props}/></QueryClientProvider>);
  return { client, ...callbacks };
}

beforeEach(() => mockedApi.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BossEvidenceManager", () => {
  it("lists only safe metadata, adds pasted text, and reports processing state", async () => {
    const evidence = [summary({ status: "PROCESSING", sourceName: "기존 대화" })];
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/bosses/boss-1/evidence" && !options?.method) return { evidence: [...evidence] } as any;
      if (path === "/bosses/boss-1/evidence" && options?.method === "POST") {
        const body = JSON.parse(String(options.body));
        expect(body).toEqual({ type: "TEXT", rawText: "일정과 결론을 먼저 확인해 주세요." });
        evidence[0] = summary({ id: "00000000-0000-4000-8000-000000000002", status: "READY", sourceName: "붙여넣기" });
        return { evidence: evidence[0], jobId: "extract-1" } as any;
      }
      throw new Error(`Unexpected API call: ${path}`);
    });
    const { onProcessingChange } = renderManager();

    expect(await screen.findByText("기존 대화")).toBeInTheDocument();
    await waitFor(() => expect(onProcessingChange).toHaveBeenCalledWith(true));
    expect(screen.queryByText("대화 원문은 보이지 않습니다.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("대화 내용 붙여넣기"), { target: { value: "일정과 결론을 먼저 확인해 주세요." } });
    fireEvent.click(screen.getByRole("button", { name: "텍스트 추가" }));
    expect(await screen.findByText("붙여넣은 대화를 분석 목록에 추가했습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("대화 내용 붙여넣기")).toHaveValue("");
  });

  it("uploads TXT and keeps successful images when another image fails", async () => {
    const evidence: BossEvidenceSummary[] = [];
    const intentNames = new Map<string, string>();
    let intentSequence = 0;
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/bosses/boss-1/evidence" && !options?.method) return { evidence: [...evidence] } as any;
      if (path === "/uploads/sign" && options?.method === "POST") {
        const body = JSON.parse(String(options.body));
        if (body.fileName === "bad.png") throw new Error("이미지 저장 실패");
        const intentId = `intent-${++intentSequence}`;
        intentNames.set(intentId, body.fileName);
        return { upload: { intentId, signedUrl: null, token: null } } as any;
      }
      if (path === "/bosses/boss-1/evidence" && options?.method === "POST") {
        const body = JSON.parse(String(options.body));
        const sourceName = intentNames.get(body.uploadIntentId)!;
        const item = summary({
          id: `00000000-0000-4000-8000-${String(evidence.length + 1).padStart(12, "0")}`,
          type: body.type,
          sourceName,
        });
        evidence.push(item);
        return { evidence: item, jobId: `job-${evidence.length}` } as any;
      }
      throw new Error(`Unexpected API call: ${path}`);
    });
    renderManager();
    await screen.findByText("등록된 대화 자료가 없습니다.");

    const txtInput = screen.getByText("TXT 업로드").closest("label")!.querySelector("input")!;
    fireEvent.change(txtInput, { target: { files: [new File(["대화"], "conversation.txt", { type: "text/plain" })] } });
    expect(await screen.findByText("conversation.txt을 분석 목록에 추가했습니다.")).toBeInTheDocument();

    const imageInput = screen.getByText(/이미지 업로드/).closest("label")!.querySelector("input")!;
    fireEvent.change(imageInput, { target: { files: [
      new File(["good"], "good.png", { type: "image/png" }),
      new File(["bad"], "bad.png", { type: "image/png" }),
    ] } });
    expect(await screen.findByText("1장 등록 완료 · 1장 실패")).toBeInTheDocument();
    expect(screen.getByText("bad.png").closest("li")).toHaveTextContent("이미지 저장 실패");
    expect(evidence.map((item) => item.sourceName)).toEqual(["conversation.txt", "good.png"]);
  });

  it("switches evidence by boss and never renders stored conversation content", async () => {
    const evidenceByBoss: Record<string, BossEvidenceSummary[]> = {
      "boss-1": [summary({ sourceName: "첫 상사.txt", type: "TXT" })],
      "boss-2": [summary({ id: "00000000-0000-4000-8000-000000000002", sourceName: "둘째 상사.png", type: "IMAGE" })],
    };
    mockedApi.mockImplementation(async (path) => {
      const bossId = String(path).split("/")[2]!;
      return { evidence: evidenceByBoss[bossId] ?? [] } as any;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const callbacks = { onProcessingChange: vi.fn(), onPersonaJob: vi.fn(async () => undefined), onPersonaUpdated: vi.fn(async () => undefined) };
    const view = render(<QueryClientProvider client={client}><BossEvidenceManager bossId="boss-1" {...callbacks}/></QueryClientProvider>);
    expect(await screen.findByText("첫 상사.txt")).toBeInTheDocument();

    view.rerender(<QueryClientProvider client={client}><BossEvidenceManager bossId="boss-2" {...callbacks}/></QueryClientProvider>);
    expect(await screen.findByText("둘째 상사.png")).toBeInTheDocument();
    expect(screen.queryByText("첫 상사.txt")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("실제 대화 원문");
  });

  it("deletes every evidence type and waits for automatic persona rebuilding", async () => {
    const evidence = [summary({ type: "TXT", sourceName: "remove.txt" })];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/bosses/boss-1/evidence" && !options?.method) return { evidence: [...evidence] } as any;
      if (String(path).endsWith(evidence[0]?.id ?? "missing") && options?.method === "DELETE") {
        const deletedEvidenceId = evidence[0]!.id;
        evidence.splice(0, 1);
        return { deletedEvidenceId, deletedJobIds: ["extract-1"], personaJobId: "persona-1", personaRebuildError: null } as any;
      }
      throw new Error(`Unexpected API call: ${path}`);
    });
    const { onPersonaJob, onPersonaUpdated } = renderManager();
    fireEvent.click(await screen.findByRole("button", { name: "remove.txt 삭제" }));

    await waitFor(() => expect(onPersonaJob).toHaveBeenCalledWith("persona-1"));
    expect(onPersonaUpdated).toHaveBeenCalledOnce();
    expect(await screen.findByText("자료를 삭제하고 페르소나에 반영했습니다.")).toBeInTheDocument();
    expect(screen.getByText("등록된 대화 자료가 없습니다.")).toBeInTheDocument();
  });

  it("shows a manual retry error when deletion succeeds but rebuild scheduling fails", async () => {
    const evidence = [summary({ sourceName: "remove-me" })];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/bosses/boss-1/evidence" && !options?.method) return { evidence: [...evidence] } as any;
      if (options?.method === "DELETE") {
        evidence.splice(0, 1);
        return { deletedEvidenceId: "evidence-1", deletedJobIds: [], personaJobId: null, personaRebuildError: "자료는 삭제됐지만 수동으로 다시 분석해 주세요." } as any;
      }
      throw new Error(`Unexpected API call: ${path}`);
    });
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: "remove-me 삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("수동으로 다시 분석");
    expect(screen.getByText("등록된 대화 자료가 없습니다.")).toBeInTheDocument();
  });

  it("refreshes boss state and offers manual retry when the scheduled rebuild fails", async () => {
    const evidence = [summary({ sourceName: "failed-rebuild" })];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedApi.mockImplementation(async (_path, options) => {
      if (!options?.method) return { evidence: [...evidence] } as any;
      evidence.splice(0, 1);
      return { deletedEvidenceId: "evidence-1", deletedJobIds: [], personaJobId: "persona-failed", personaRebuildError: null } as any;
    });
    const onPersonaJob = vi.fn(async () => { throw new Error("재분석 실패"); });
    const onPersonaUpdated = vi.fn(async () => undefined);
    renderManager({ onPersonaJob, onPersonaUpdated });
    fireEvent.click(await screen.findByRole("button", { name: "failed-rebuild 삭제" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("자료는 삭제됐지만 페르소나 재분석에 실패했습니다");
    expect(onPersonaUpdated).toHaveBeenCalledOnce();
    expect(screen.getByText("등록된 대화 자료가 없습니다.")).toBeInTheDocument();
  });
});
