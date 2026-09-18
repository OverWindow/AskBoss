import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";
import { api } from "../services/api-client";

vi.mock("../services/api-client", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

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
    render(<QueryClientProvider client={client}><AdminPage/></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("관리자 비밀번호"), { target: { value: "correct-horse-battery-staple" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "운영 관리자" })).toBeInTheDocument());
    expect(screen.getByText("AI 상태와 크레딧")).toBeInTheDocument();
  });

  it("shows a recoverable connection error instead of an endless auth spinner", async () => {
    mockedApi.mockRejectedValueOnce(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminPage/></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "API 연결에 실패했습니다." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeInTheDocument();
  });
});
