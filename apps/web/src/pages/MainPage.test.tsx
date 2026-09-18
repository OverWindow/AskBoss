import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainPage } from "./MainPage";
import { useUiStore } from "../stores/ui-store";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("../features/tutorial/Tutorial", () => ({ Tutorial: () => null }));
vi.mock("../features/session/useSession", () => ({ useSession: () => ({ isSuccess: true, isLoading: false, isError: false }) }));
vi.mock("../features/boss/useBosses", () => ({ useBosses: () => ({ isLoading: false, isError: false, data: [{ id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", jobFunction: null, yearsOfServiceBand: null, rank: "팀장", companyName: null, ageBand: 40, hierarchyScore: 55, genderBalanceScore: 0, companyResearch: null, persona: null, pki: null }] }) }));
vi.mock("../features/chat/ChatPanel", () => ({ ChatPanel: () => <section aria-label="모두의 상사와 대화">대화 패널</section> }));
vi.mock("../features/translator/TranslatorPanel", () => ({ TranslatorPanel: () => <section aria-label="상사의 말 번역">번역 패널</section> }));

describe("MainPage workspace", () => {
  beforeEach(() => useUiStore.setState({ selectedBossId: null, chatPanelCollapsed: false, translatorPanelCollapsed: false, activeTool: "chat" }));
  it("keeps the avatar between the inline translator and chat panels", () => {
    render(<MainPage/>);
    const translator = screen.getByLabelText("상사의 말 번역");
    const avatar = screen.getByAltText("모두의 상사 픽셀 아바타");
    const chat = screen.getByLabelText("모두의 상사와 대화");
    expect(translator.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(avatar.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
