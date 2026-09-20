import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api-client";
import { BossOnboarding, EvidencePrivacyNotice } from "./BossOnboarding";

vi.mock("../../services/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api-client")>();
  return { ...actual, api: vi.fn() };
});

const mockedApi = vi.mocked(api);
const profile = { handle: "수민", ageBand: 30, yearsOfServiceBand: "3~5년", jobFunction: "개발", rank: "대리", entryPath: "신입", weaknesses: [] };
const draft = {
  profile,
  boss: { alias: "김팀장", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트 회사", ageBand: 40, hierarchyScore: 60, companyResearch: null },
  bossId: "old-boss",
  textEvidence: "",
  evidenceJobIds: ["stale-evidence"],
  personaJobId: "stale-persona",
};

function renderOnboarding() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><BossOnboarding/></QueryClientProvider></MemoryRouter>);
}

async function advanceToEvidenceStep() {
  const headings = [
    "상사의 모습을 골라주세요.",
    "이 상사를 뭐라고 부를까요?",
    "상사는 어떤 일을 하나요?",
    "상사의 연차는 어느 정도인가요?",
    "상사의 직급은 무엇인가요?",
    "어떤 회사에서 함께 일하고 있나요?",
    "상사의 나이대는 어떻게 되나요?",
    "조직 분위기는 얼마나 수직적인가요?",
    "상사를 이해하는 데 도움이 될 대화가 있나요?",
  ];
  expect(await screen.findByRole("heading", { name: headings[0] })).toBeInTheDocument();
  for (const heading of headings.slice(1)) {
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  }
}

beforeEach(() => {
  mockedApi.mockReset();
  sessionStorage.setItem("askboss:onboarding", JSON.stringify(draft));
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("EvidencePrivacyNotice", () => {
  it("warns before users upload conversations, text files, or images", () => {
    render(<EvidencePrivacyNotice/>);
    const notice = screen.getByRole("note", { name: "자료 업로드 개인정보 안내" });
    expect(notice).toHaveTextContent("기밀 정보나 개인 정보 노출이 없도록 주의해주세요!");
    expect(notice).toHaveTextContent("이름, 연락처, 계정 정보, 고객정보와 회사 기밀은 업로드 전에 가리거나 삭제해 주세요.");
  });
});

describe("BossOnboarding job recovery", () => {
  it("saves a new profile after session reset without calling an unavailable handle endpoint", async () => {
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/profile" && options?.method === "PUT") return { profile: JSON.parse(String(options.body)) } as any;
      if (path === "/profile") return { profile: null } as any;
      throw new Error(`Unexpected API call: ${path}`);
    });
    renderOnboarding();

    const userHeadings = [
      "어떻게 불러드리면 될까요?",
      "나이대가 어떻게 되시나요?",
      "회사 생활은 몇 년째인가요?",
      "어떤 직무를 하고 계신가요?",
      "현재 직급은 무엇인가요?",
      "어떤 경로로 입사했나요?",
      "업무 대화에서 어려운 점이 있나요?",
    ];
    expect(await screen.findByRole("heading", { name: userHeadings[0] })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "새사용자" } });
    for (const heading of userHeadings.slice(1)) {
      fireEvent.click(screen.getByRole("button", { name: "다음" }));
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(await screen.findByRole("heading", { name: "상사의 모습을 골라주세요." })).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledWith("/profile", { method: "PUT", body: JSON.stringify({ ...profile, handle: "새사용자" }) });
    expect(mockedApi.mock.calls.some(([path]) => String(path).includes("handle-availability"))).toBe(false);
  });

  it("clears job ids left by a previous boss when it creates a new boss", async () => {
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/profile") return { profile } as any;
      if (path === "/company/research") return { research: null } as any;
      if (path === "/bosses" && options?.method === "POST") return { boss: { id: "new-boss" } } as any;
      throw new Error(`Unexpected API call: ${path}`);
    });
    renderOnboarding();

    await advanceToEvidenceStep();

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem("askboss:onboarding")!).bossId).toBe("new-boss"));
    const saved = JSON.parse(sessionStorage.getItem("askboss:onboarding")!);
    expect(saved.evidenceJobIds).toEqual([]);
    expect(saved.personaJobId).toBeNull();
  });

  it("drops missing evidence jobs and recreates a missing persona job once", async () => {
    let personaBuilds = 0;
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/profile") return { profile } as any;
      if (path === "/company/research") return { research: null } as any;
      if (path === "/bosses" && options?.method === "POST") return { boss: { id: "new-boss" } } as any;
      if (path === "/bosses/new-boss/evidence" && options?.method === "POST") return { jobId: "missing-evidence" } as any;
      if (path === "/bosses/new-boss/survey/generate") return { questions: [{ id: "q1", category: "업무 지시", situation: "어떻게 반응하나요?", options: [{ id: "A", label: "바로 확인" }, { id: "B", label: "나중에 확인" }], allowFreeText: false }] } as any;
      if (path === "/bosses/new-boss/survey/answers") return {} as any;
      if (path === "/bosses/new-boss/persona/rebuild") {
        personaBuilds += 1;
        return { jobId: personaBuilds === 1 ? "missing-persona" : "completed-persona" } as any;
      }
      if (path === "/jobs/missing-evidence" || path === "/jobs/missing-persona") throw new ApiError(404, "REQUEST_ERROR", "작업을 찾을 수 없습니다.");
      if (path === "/jobs/completed-persona") return { job: { status: "SUCCEEDED", attempts: 1 } } as any;
      throw new Error(`Unexpected API call: ${path}`);
    });
    renderOnboarding();
    await advanceToEvidenceStep();

    fireEvent.change(screen.getByPlaceholderText("대화 내용을 붙여넣으세요. 다음을 누르면 자동으로 추가됩니다. 선택 사항입니다."), { target: { value: "결론과 일정을 먼저 확인한다." } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(await screen.findByRole("heading", { name: "어떻게 반응하나요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "A. 바로 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "페르소나 만들기" }));

    await waitFor(() => expect(personaBuilds).toBe(2));
    await waitFor(() => expect(sessionStorage.getItem("askboss:onboarding")).toBeNull());
    expect(mockedApi).toHaveBeenCalledWith("/jobs/missing-evidence");
    expect(mockedApi).toHaveBeenCalledWith("/jobs/missing-persona");
    expect(mockedApi).toHaveBeenCalledWith("/jobs/completed-persona");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
