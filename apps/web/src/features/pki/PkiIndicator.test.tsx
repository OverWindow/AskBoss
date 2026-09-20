import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api-client";
import { PkiIndicator } from "./PkiIndicator";

vi.mock("../../services/api-client", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const globalBoss: any = { id: "g", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };
const personalBoss: any = { ...globalBoss, id: "p", scope: "SESSION", alias: "김팀장", pki: { score: 62, completeness: 55, evidenceReliability: 70, diversity: 60, freshness: 68 } };

function renderIndicator(boss = personalBoss) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><PkiIndicator boss={boss}/></QueryClientProvider>) };
}

describe("PkiIndicator", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue({ availableAt: null, retryAfterSeconds: 0, inProgress: false, jobId: null } as any);
  });
  afterEach(() => cleanup());

  it("renders a hidden placeholder for the global boss to keep layout aligned", () => {
    const { container } = renderIndicator(globalBoss);
    const placeholder = container.querySelector(".pki-indicator-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: /상사 페르소나 다시 분석/ })).not.toBeInTheDocument();
  });

  it("explains the weighted score and closes with Escape", async () => {
    renderIndicator();
    const info = screen.getByRole("button", { name: "상사 파악도 산정 방식 보기" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("정보 충족도")).toBeInTheDocument();
    expect(screen.getByText("55점")).toBeInTheDocument();
    expect(screen.getByText("최신성")).toBeInTheDocument();
    expect(screen.getByText(/약 2년에 걸쳐 완만하게/)).toBeInTheDocument();
    expect(screen.getByText("68점")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "상사 파악도 산정 방식" })).not.toBeInTheDocument());
  });

  it("restores the server cooldown and exposes the remaining time accessibly", async () => {
    mockedApi.mockResolvedValue({ availableAt: "2099-01-01T00:03:00.000Z", retryAfterSeconds: 179, inProgress: false, jobId: null } as any);
    renderIndicator();
    const refresh = await screen.findByRole("button", { name: "상사 페르소나 다시 분석, 2:59 후 가능" });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveTextContent("2:59");
  });

  it("starts one refresh, keeps the cooldown, and invalidates bosses after completion", async () => {
    const availableAt = new Date(Date.now() + 180_000).toISOString();
    let started = false;
    let completed = false;
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/bosses/p/persona/refresh" && options?.method === "POST") { started = true; return { jobId: "job-1", availableAt, retryAfterSeconds: 180, inProgress: true } as any; }
      if (path === "/bosses/p/persona/refresh" && started) return { availableAt, retryAfterSeconds: 180, inProgress: !completed, jobId: completed ? null : "job-1" } as any;
      if (path === "/jobs/job-1") { completed = true; return { job: { status: "SUCCEEDED" } } as any; }
      return { availableAt: null, retryAfterSeconds: 0, inProgress: false, jobId: null } as any;
    });
    const { client } = renderIndicator();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const refresh = await screen.findByRole("button", { name: "상사 페르소나 다시 분석" });
    fireEvent.click(refresh);
    await screen.findByText("새 분석 결과를 반영했어요.");
    expect(mockedApi.mock.calls.filter(([path, options]) => path === "/bosses/p/persona/refresh" && options?.method === "POST")).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bosses"] });
    expect(screen.getByRole("button", { name: /후 가능/ })).toBeDisabled();
  });

  it("shows a failed resumed job while preserving its cooldown", async () => {
    let failed = false;
    mockedApi.mockImplementation(async (path) => {
      if (path === "/jobs/job-failed") { failed = true; return { job: { status: "FAILED", errorMessage: "분석 서비스 오류" } } as any; }
      return { availableAt: "2099-01-01T00:03:00.000Z", retryAfterSeconds: 90, inProgress: !failed, jobId: failed ? null : "job-failed" } as any;
    });
    renderIndicator();
    expect(await screen.findByText("분석 서비스 오류")).toHaveClass("is-error");
    expect(screen.getByRole("button", { name: "상사 페르소나 다시 분석, 1:30 후 가능" })).toBeDisabled();
  });
});
