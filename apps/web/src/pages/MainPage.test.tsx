import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainPage } from "./MainPage";
import { useUiStore } from "../stores/ui-store";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("../features/tutorial/Tutorial", () => ({ Tutorial: () => null }));
vi.mock("../features/session/useSession", () => ({ useSession: () => ({ isSuccess: true, isLoading: false, isError: false }) }));
vi.mock("../features/boss/useBosses", () => ({ useBosses: () => ({ isLoading: false, isError: false, data: [{ id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", jobFunction: null, yearsOfServiceBand: null, rank: "팀장", companyName: null, ageBand: 40, hierarchyScore: 55, companyResearch: null, persona: null, pki: null }] }) }));
vi.mock("../features/profile/useProfile", () => ({ useProfile: () => ({ data: { handle: "수민" } }) }));
vi.mock("../features/translator/useTranslationExamples", () => ({ useTranslationExamples: () => ({ data: { examples: ["예시 1", "예시 2", "예시 3"] } }) }));
vi.mock("../features/chat/ChatPanel", () => ({ ChatPanel: ({ active, simulationRequest, onConversationStateChange }: { active: boolean; simulationRequest?: { inputText: string }; onConversationStateChange: (state: { hasContent: boolean; hasUnsavedActualResponse: boolean; busy: boolean }) => void }) => <section aria-label="모두의 상사와 대화" hidden={!active}>대화 패널{simulationRequest?.inputText}<button onClick={() => onConversationStateChange({ hasContent: true, hasUnsavedActualResponse: false, busy: false })}>대화 있음</button></section> }));
vi.mock("../features/translator/TranslatorPanel", () => ({ TranslatorPanel: ({ active, onSimulate }: { active: boolean; onSimulate: (request: any) => void }) => <section aria-label="상사의 말 번역" hidden={!active}>번역 패널<button onClick={() => onSimulate({ id: "simulation-1", translationId: "translation-1", replyIndex: 0, inputText: "이거 언제 되나?", reply: "곧 공유하겠습니다." })}>추천 답변 시뮬레이션</button></section> }));

describe("MainPage workspace", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  beforeEach(() => useUiStore.setState({ selectedBossId: null, activeWorkspaceTab: "translator", mobilePanelExpanded: true }));

  it("번역 탭이 왼쪽에서 선택된 우측 통합 패널을 기본으로 표시한다", () => {
    render(<MainPage/>);
    expect(screen.getByAltText("모두의 상사 픽셀 아바타")).toBeInTheDocument();
    expect(screen.getByText("수민씨, 밥은 먹었나?")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "대화와 번역" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["번역", "대화"]);
    expect(screen.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "번역" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveAttribute("hidden");
    expect(screen.getByLabelText("상사의 말 번역")).not.toHaveAttribute("hidden");
  });

  it("대화와 번역 탭을 전환하고 화살표 키를 지원한다", () => {
    render(<MainPage/>);
    fireEvent.keyDown(screen.getByRole("tab", { name: "번역" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "번역" }));
    expect(screen.getByLabelText("상사의 말 번역")).not.toHaveAttribute("hidden");
  });

  it("모바일 스와이프 방향에 맞춰 번역과 대화 화면 및 하단 표시를 함께 이동한다", () => {
    const { container } = render(<MainPage/>);
    const workspace = container.querySelector(".interaction-workspace")!;
    const indicator = container.querySelector(".mobile-bottom-nav-indicator")!;

    fireEvent.touchStart(workspace, { touches: [{ clientX: 280, clientY: 200 }] });
    fireEvent.touchEnd(workspace, { changedTouches: [{ clientX: 120, clientY: 205 }] });
    expect(screen.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    expect(indicator).toHaveClass("is-chat");

    fireEvent.touchStart(workspace, { touches: [{ clientX: 120, clientY: 200 }] });
    fireEvent.touchEnd(workspace, { changedTouches: [{ clientX: 280, clientY: 198 }] });
    expect(screen.getByRole("tab", { name: "번역" })).toHaveAttribute("aria-selected", "true");
    expect(indicator).toHaveClass("is-translator");
  });

  it("모바일 패널을 기본으로 펼친 후 접고 다시 펼 수 있다", () => {
    render(<MainPage/>);
    const toggle = screen.getByRole("button", { name: "패널 접기" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "패널 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "패널 펼치기" }).closest(".interaction-workspace")).toHaveClass("is-mobile-panel-collapsed");
  });

  it("번역 추천 시뮬레이션을 대화 탭으로 이동시킨다", () => {
    render(<MainPage/>);
    fireEvent.click(screen.getByRole("tab", { name: "번역" }));
    fireEvent.click(screen.getByRole("button", { name: "추천 답변 시뮬레이션" }));
    expect(screen.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveTextContent("이거 언제 되나?");
  });

  it("기존 대화가 있으면 새 시뮬레이션 교체를 확인하고 취소 시 유지한다", () => {
    render(<MainPage/>);
    fireEvent.click(screen.getByRole("tab", { name: "대화" }));
    fireEvent.click(screen.getByRole("button", { name: "대화 있음" }));
    fireEvent.click(screen.getByRole("tab", { name: "번역" }));
    fireEvent.click(screen.getByRole("button", { name: "추천 답변 시뮬레이션" }));
    expect(screen.getByRole("dialog", { name: "새 시뮬레이션 시작" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("tab", { name: "번역" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("모두의 상사와 대화")).not.toHaveTextContent("이거 언제 되나?");

    fireEvent.click(screen.getByRole("button", { name: "추천 답변 시뮬레이션" }));
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(screen.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveTextContent("이거 언제 되나?");
  });

  it("아바타를 누르면 로컬 문구로 말풍선을 바꾼다", () => {
    render(<MainPage/>);
    fireEvent.click(screen.getByRole("button", { name: "모두의 상사의 한마디 바꾸기" }));
    expect(screen.getByText(/결론부터 얘기해 보지/)).toBeInTheDocument();
  });
});
