import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";
import { api } from "../services/api-client";

vi.mock("../services/api-client", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

function renderAdmin(client: QueryClient, entry = "/admin") {
  return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><AdminPage/></QueryClientProvider></MemoryRouter>);
}

describe("AdminPage", () => {
  afterEach(() => cleanup());
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
      if (path === "/admin/global-boss/prompt-preview") return { messages: [{ role: "system", content: "SYSTEM 원문" }, { role: "user", content: "가상 사용자 질문 원문" }], sources: [{ role: "system", component: "안전·출력 규칙", origin: "서버 고정 규칙", description: "고정된 안전 규칙입니다.", usesMockData: false }, { role: "user", component: "사용자 프로필", origin: "미리보기 전용 가상 데이터", description: "실제 사용자 데이터가 아닙니다.", usesMockData: true }], usesMockUserData: true } as any;
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
    expect(screen.getByText("SYSTEM 원문")).toBeInTheDocument();
    expect(screen.getByText("가상 사용자 질문 원문")).toBeInTheDocument();
    expect(screen.getByText("서버 고정 규칙")).toBeInTheDocument();
    expect(screen.getByText("미리보기 전용 가상 데이터")).toBeInTheDocument();
    expect(screen.getByText(/실제 사용자 데이터는 포함하지 않습니다/)).toBeInTheDocument();
  });

  it("edits the shared translation and onboarding prompt instructions together", async () => {
    let prompts = { translation: "기존 번역 지침", onboarding: { companyResearch: "기존 회사 조사 지침", evidenceExtraction: "기존 자료 추출 지침", surveyGeneration: "기존 질문 생성 지침", personaGeneration: "기존 페르소나 지침" }, updatedAt: null as string | null };
    mockedApi.mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/admin/auth") return { authenticated: true, expiresAt: "2026-09-19T10:00:00Z" } as any;
      if (path === "/admin/dashboard") return { generatedAt: new Date().toISOString(), sessions: { total: 0, active15m: 0, new24h: 0, expiring1h: 0 }, usage: { personalBosses: 0, chatMessages24h: 0, translations24h: 0 }, jobs: { pending: 0, running: 0, failed: 0, oldestPendingMinutes: null, failureReasons: [] }, uploads: { expiredIncomplete: 0 }, featureUsage: [], recentOperations: [] } as any;
      if (path === "/admin/credits") return { available: false, checkedAt: new Date().toISOString(), latencyMs: 0, models: { ok: false, available: [], missing: [], mode: "demo" }, monthly: null, purchased: null, total: null } as any;
      if (path === "/admin/sessions" || path === "/admin/jobs") return { items: [] } as any;
      if (path === "/admin/personal-boss-defaults") return { prompt: "", updatedAt: null } as any;
      if (path === "/admin/translation-examples") return { examples: ["예시 1", "예시 2", "예시 3"], updatedAt: null } as any;
      if (path === "/admin/ai-prompt-settings" && options.method === "PUT") { prompts = { ...JSON.parse(String(options.body)), updatedAt: "2026-09-19T12:30:00Z" }; return prompts as any; }
      if (path === "/admin/ai-prompt-settings") return prompts as any;
      return {} as any;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAdmin(client);
    const translation = await screen.findByLabelText("번역 업무 지침");
    await waitFor(() => expect(translation).toHaveValue("기존 번역 지침"));
    fireEvent.change(translation, { target: { value: "새 공통 번역 지침" } });
    fireEvent.change(screen.getByLabelText("페르소나 생성"), { target: { value: "새 페르소나 지침" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 프롬프트 저장" }));
    expect(await screen.findByText("AI 업무 프롬프트를 저장했습니다.")).toBeInTheDocument();
    expect(prompts.translation).toBe("새 공통 번역 지침");
    expect(prompts.onboarding.personaGeneration).toBe("새 페르소나 지침");
    expect(screen.getByText(/보안 규칙, JSON 필드와 응답 형식/)).toBeInTheDocument();
  });

  it("edits the three translation examples as one shared setting", async () => {
    let examples = ["기존 예시 1", "기존 예시 2", "기존 예시 3"];
    mockedApi.mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === "/admin/auth") return { authenticated: true, expiresAt: "2026-09-19T10:00:00Z" } as any;
      if (path === "/admin/dashboard") return { generatedAt: new Date().toISOString(), sessions: { total: 0, active15m: 0, new24h: 0, expiring1h: 0 }, usage: { personalBosses: 0, chatMessages24h: 0, translations24h: 0 }, jobs: { pending: 0, running: 0, failed: 0, oldestPendingMinutes: null, failureReasons: [] }, uploads: { expiredIncomplete: 0 }, featureUsage: [], recentOperations: [] } as any;
      if (path === "/admin/credits") return { available: false, checkedAt: new Date().toISOString(), latencyMs: 0, models: { ok: false, available: [], missing: [], mode: "demo" }, monthly: null, purchased: null, total: null } as any;
      if (path === "/admin/sessions" || path === "/admin/jobs") return { items: [] } as any;
      if (path === "/admin/personal-boss-defaults") return { prompt: "", updatedAt: null } as any;
      if (path === "/admin/translation-examples" && options.method === "PUT") { examples = JSON.parse(String(options.body)).examples; return { examples, updatedAt: "2026-09-19T12:00:00Z" } as any; }
      if (path === "/admin/translation-examples") return { examples, updatedAt: null } as any;
      return {} as any;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAdmin(client);
    const first = await screen.findByLabelText("예시 문장 1");
    await waitFor(() => expect(first).toHaveValue("기존 예시 1"));
    fireEvent.change(first, { target: { value: "새 예시 문장" } });
    fireEvent.click(screen.getByRole("button", { name: "예시 문장 저장" }));
    expect(await screen.findByText("번역 예시 문장을 저장했습니다.")).toBeInTheDocument();
    expect(examples).toEqual(["새 예시 문장", "기존 예시 2", "기존 예시 3"]);
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
