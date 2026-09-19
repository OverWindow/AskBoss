import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";
import { api } from "../services/api-client";

vi.mock("../services/api-client", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

function renderAdmin(client: QueryClient, entry = "/admin") {
  return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><AdminPage/></QueryClientProvider></MemoryRouter>);
}

describe("AdminPage", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    let authenticated = false;
    mockedApi.mockImplementation(async (path: string) => {
      if (path === "/admin/auth") return { authenticated, expiresAt: authenticated ? "2026-09-19T10:00:00Z" : null } as any;
      if (path === "/admin/login") { authenticated = true; return { authenticated: true } as any; }
      if (path === "/admin/dashboard") return { generatedAt: new Date().toISOString(), sessions: { total: 2, active15m: 1, new24h: 2, expiring1h: 0 }, usage: { personalBosses: 1, chatMessages24h: 3, translations24h: 1 }, jobs: { pending: 0, running: 0, failed: 0, oldestPendingMinutes: null, failureReasons: [] }, uploads: { expiredIncomplete: 0 }, featureUsage: [], recentOperations: [] } as any;
      if (path === "/admin/credits") return { available: true, checkedAt: new Date().toISOString(), latencyMs: 20, models: { ok: true, available: ["gpt-5.6-luna"], missing: [], mode: "live" }, monthly: { quota: 100, used: 20, remaining: 80 }, purchased: { quota: 0, used: 0, remaining: 0 }, total: { quota: 100, used: 20, remaining: 80 } } as any;
      if (path === "/admin/sessions" || path === "/admin/jobs") return { items: [] } as any;
      return {} as any;
    });
  });

  it("moves from the password screen to the operations dashboard", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAdmin(client);
    expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("관리자 비밀번호"), { target: { value: "correct-horse-battery-staple" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "운영 관리자" })).toBeInTheDocument());
    expect(screen.getByText("AI 상태와 크레딧")).toBeInTheDocument();
  });

  it("shows a recoverable connection error instead of an endless auth spinner", async () => {
    mockedApi.mockRejectedValueOnce(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAdmin(client);
    expect(await screen.findByRole("heading", { name: "API 연결에 실패했습니다." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeInTheDocument();
  });

  it("edits the prompt dedicated to the global boss on its management page", async () => {
    let prompt = "";
    mockedApi.mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/admin/auth") return { authenticated: true, expiresAt: "2026-09-19T10:00:00Z" } as any;
      if (path === "/admin/global-boss") return { boss: { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", jobFunction: null, yearsOfServiceBand: null, rank: "팀장", companyName: null, ageBand: 40, hierarchyScore: 55, companyResearch: null, persona: null, pki: null, personaVersion: 1 }, evidence: [], surveyAnswers: [] } as any;
      if (path === "/admin/global-boss-defaults" && options.method === "PUT") { prompt = JSON.parse(String(options.body)).prompt; return { prompt, updatedAt: "2026-09-19T11:00:00Z" } as any; }
      if (path === "/admin/global-boss-defaults") return { prompt, updatedAt: null } as any;
      return {} as any;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAdmin(client, "/admin/global-boss");
    const input = await screen.findByLabelText("시스템 프롬프트형 기본 성격");
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "결론과 책임을 먼저 확인한다." } });
    expect(screen.getByText("16 / 5,000자")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전용 프롬프트 저장" }));
    expect(await screen.findByText("모두의 상사 전용 프롬프트를 저장했습니다.")).toBeInTheDocument();
    expect(prompt).toBe("결론과 책임을 먼저 확인한다.");
  });

  it("shows a recoverable error when the global boss detail cannot be loaded", async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === "/admin/auth") return { authenticated: true, expiresAt: "2026-09-19T10:00:00Z" } as any;
      if (path === "/admin/global-boss") throw new Error("offline");
      return {} as any;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAdmin(client, "/admin/global-boss");
    expect(await screen.findByText("모두의 상사 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});
