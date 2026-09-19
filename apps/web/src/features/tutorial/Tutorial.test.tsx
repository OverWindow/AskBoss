import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { positionTutorialBubble, Tutorial, TUTORIAL_STORAGE_KEY } from "./Tutorial";
import { useUiStore } from "../../stores/ui-store";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function TutorialTargets() {
  return <>
    <button data-tutorial="global-boss">모두의 상사</button>
    <button data-tutorial="add-boss">상사 추가</button>
    <button data-tutorial="chat">대화</button>
    <button data-tutorial="translate">번역</button>
    <button data-tutorial="pki">상사 파악도</button>
    <main data-tutorial="workspace">메인 상사 화면</main>
  </>;
}

describe("Tutorial", () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    useUiStore.setState({
      sidebarCollapsed: true,
      mobileNavOpen: false,
      activeWorkspaceTab: "translator",
      mobilePanelExpanded: false,
      tutorialOpen: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("runs automatically once, exposes the default panel, and treats skip as completed", async () => {
    render(<><TutorialTargets/><Tutorial/></>);
    expect(await screen.findByRole("dialog", { name: "서비스 사용 안내" })).toHaveTextContent("모두의 상사");
    expect(useUiStore.getState()).toMatchObject({
      sidebarCollapsed: false,
      activeWorkspaceTab: "translator",
      mobilePanelExpanded: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBe("true");
    expect(screen.queryByRole("dialog", { name: "서비스 사용 안내" })).not.toBeInTheDocument();
    expect(useUiStore.getState()).toMatchObject({ sidebarCollapsed: true, mobileNavOpen: false, activeWorkspaceTab: "translator", mobilePanelExpanded: false });

    cleanup();
    useUiStore.setState({ tutorialOpen: false });
    render(<><TutorialTargets/><Tutorial/></>);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "서비스 사용 안내" })).not.toBeInTheDocument());
  });

  it("supports immediate manual replay and advances through the real feature targets", async () => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    useUiStore.setState({ tutorialOpen: true });
    render(<><TutorialTargets/><Tutorial/></>);
    expect(await screen.findByText(/여기서 대화할 상사를 선택/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText(/실제 상사를 등록/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBe("true");
  });

  it("opens and restores the mobile sidebar only for sidebar steps", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 850px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<><TutorialTargets/><Tutorial/></>);
    await screen.findByRole("dialog", { name: "서비스 사용 안내" });
    await waitFor(() => expect(useUiStore.getState().mobileNavOpen).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(useUiStore.getState().mobileNavOpen).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await waitFor(() => expect(useUiStore.getState().mobileNavOpen).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });
});

describe("positionTutorialBubble", () => {
  it("uses the preferred side when it fits and clamps the bubble inside the viewport", () => {
    const position = positionTutorialBubble(rect(20, 80, 40, 40), { width: 160, height: 90 }, "right", { width: 400, height: 240 });
    expect(position.side).toBe("right");
    expect(position.left).toBe(76);
    expect(position.top).toBeGreaterThanOrEqual(12);
  });

  it("chooses a side that fits when the preferred side would overflow", () => {
    const position = positionTutorialBubble(rect(330, 80, 50, 40), { width: 180, height: 90 }, "right", { width: 400, height: 240 });
    expect(position.side).toBe("left");
    expect(position.left).toBeGreaterThanOrEqual(12);
    expect(position.left + 180).toBeLessThanOrEqual(388);
  });
});
