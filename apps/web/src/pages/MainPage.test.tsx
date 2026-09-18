import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainPage } from "./MainPage";
import { useUiStore } from "../stores/ui-store";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("../features/tutorial/Tutorial", () => ({ Tutorial: () => null }));
vi.mock("../features/session/useSession", () => ({ useSession: () => ({ isSuccess: true, isLoading: false, isError: false }) }));
vi.mock("../features/boss/useBosses", () => ({ useBosses: () => ({ isLoading: false, isError: false, data: [{ id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", jobFunction: null, yearsOfServiceBand: null, rank: "팀장", companyName: null, ageBand: 40, hierarchyScore: 55, genderBalanceScore: 0, companyResearch: null, persona: null, pki: null }] }) }));
vi.mock("../features/chat/ChatPanel", () => ({ ChatPanel: ({ open }: { open: boolean }) => <section aria-label="모두의 상사와 대화" data-open={open}>대화 패널</section> }));
vi.mock("../features/translator/TranslatorPanel", () => ({ TranslatorPanel: ({ open }: { open: boolean }) => <section aria-label="상사의 말 번역" data-open={open}>번역 패널</section> }));

function mockViewport(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: wide && query === "(min-width: 1200px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("MainPage workspace", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    mockViewport(false);
    useUiStore.setState({ selectedBossId: null, chatPanelOpen: false, translatorPanelOpen: false, lastOpenedPanel: "chat" });
  });

  it("starts with both side panels closed around the centered avatar", () => {
    render(<MainPage/>);
    expect(screen.getByAltText("모두의 상사 픽셀 아바타")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 패널 열기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "대화 패널 열기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("상사의 말 번역")).toHaveAttribute("data-open", "false");
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveAttribute("data-open", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps only one panel open below desktop width and closes the last panel with Escape", () => {
    render(<MainPage/>);
    fireEvent.click(screen.getByRole("button", { name: "번역 패널 열기" }));
    expect(screen.getByLabelText("상사의 말 번역")).toHaveAttribute("data-open", "true");
    fireEvent.click(screen.getByRole("button", { name: "대화 패널 열기" }));
    expect(screen.getByLabelText("상사의 말 번역")).toHaveAttribute("data-open", "false");
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveAttribute("data-open", "false");
  });

  it("allows both panels to open independently on desktop", () => {
    mockViewport(true);
    render(<MainPage/>);
    fireEvent.click(screen.getByRole("button", { name: "번역 패널 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "대화 패널 열기" }));
    expect(screen.getByLabelText("상사의 말 번역")).toHaveAttribute("data-open", "true");
    expect(screen.getByLabelText("모두의 상사와 대화")).toHaveAttribute("data-open", "true");
  });
});
