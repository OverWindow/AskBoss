import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUiStore } from "../../stores/ui-store";

export const TUTORIAL_STORAGE_KEY = "askboss:tutorial-seen:v1";

type Side = "left" | "right" | "top" | "bottom";

interface TutorialStep {
  target: string;
  message: string;
  preferredSide: Side;
}

interface BubblePosition {
  left: number;
  top: number;
  side: Side;
}

interface ViewportSize {
  width: number;
  height: number;
}

const desktopSteps: TutorialStep[] = [
  {
    target: "global-boss",
    message: "처음 왔나? 나는 ‘모두의 상사’야. 여기서 대화할 상사를 선택할 수 있지.",
    preferredSide: "right",
  },
  {
    target: "add-boss",
    message: "실제 상사를 등록하면 그 사람의 스타일을 더 구체적으로 분석해 줄 수 있어.",
    preferredSide: "right",
  },
  {
    target: "archive",
    message: "번역 결과와 이어서 연습한 대화, 실제 상사 답변은 아카이브에서 다시 확인할 수 있어.",
    preferredSide: "right",
  },
  {
    target: "hr-demo",
    message: "HR Demo에서는 실제 익명 집계와 가상 데이터를 통해 조직 커뮤니케이션 인사이트를 확인할 수 있어.",
    preferredSide: "right",
  },
  {
    target: "translate",
    message: "상사가 무슨 뜻으로 말한 건지 모르겠다면 먼저 번역 탭을 써봐.",
    preferredSide: "left",
  },
  {
    target: "chat",
    message: "옆의 대화 탭에서는 나랑 업무 상황을 미리 연습해 볼 수 있고.",
    preferredSide: "right",
  },
  {
    target: "workspace",
    message: "그럼, 일해 볼까? 아바타를 누르면 내 한마디도 바꿀 수 있어.",
    preferredSide: "top",
  },
];

const mobileSteps: TutorialStep[] = [
  {
    target: "global-boss",
    message: "메뉴에서 대화할 상사를 선택할 수 있어. 처음에는 ‘모두의 상사’로 시작해 봐.",
    preferredSide: "right",
  },
  {
    target: "add-boss",
    message: "상사 추가를 누르면 실제 상사의 말투와 업무 스타일을 등록할 수 있어.",
    preferredSide: "right",
  },
  {
    target: "archive",
    message: "번역 결과와 이어서 연습한 대화, 실제 상사 답변은 아카이브에서 다시 확인할 수 있어.",
    preferredSide: "right",
  },
  {
    target: "hr-demo",
    message: "HR Demo에서는 실제 익명 집계와 가상 데이터를 통해 조직 커뮤니케이션 인사이트를 확인할 수 있어.",
    preferredSide: "right",
  },
  {
    target: "mobile-translate",
    message: "하단의 번역을 누르거나 화면을 왼쪽으로 밀면 상사의 말을 쉽게 풀어볼 수 있어.",
    preferredSide: "top",
  },
  {
    target: "mobile-chat",
    message: "한 번 더 왼쪽으로 밀면 대화 화면이야. 여기서 업무 상황을 미리 연습해 봐.",
    preferredSide: "top",
  },
  {
    target: "mobile-home",
    message: "홈·번역·대화는 하단 메뉴를 누르거나 좌우로 스와이프해서 자연스럽게 이동할 수 있어.",
    preferredSide: "top",
  },
];

const EDGE_GAP = 12;
const TARGET_GAP = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function positionTutorialBubble(
  target: DOMRect,
  bubble: { width: number; height: number },
  preferredSide: Side,
  viewport: ViewportSize = { width: window.innerWidth, height: window.innerHeight },
): BubblePosition {
  const available: Record<Side, number> = {
    left: target.left,
    right: viewport.width - target.right,
    top: target.top,
    bottom: viewport.height - target.bottom,
  };
  const required: Record<Side, number> = {
    left: bubble.width + TARGET_GAP,
    right: bubble.width + TARGET_GAP,
    top: bubble.height + TARGET_GAP,
    bottom: bubble.height + TARGET_GAP,
  };
  const sides: Side[] = [preferredSide, "right", "left", "bottom", "top"];
  const uniqueSides = sides.filter((side, index) => sides.indexOf(side) === index);
  const side = uniqueSides.find((candidate) => available[candidate] >= required[candidate])
    ?? uniqueSides.reduce((best, candidate) => available[candidate] > available[best] ? candidate : best);

  let left = target.left + target.width / 2 - bubble.width / 2;
  let top = target.top + target.height / 2 - bubble.height / 2;
  if (side === "left") left = target.left - bubble.width - TARGET_GAP;
  if (side === "right") left = target.right + TARGET_GAP;
  if (side === "top") top = target.top - bubble.height - TARGET_GAP;
  if (side === "bottom") top = target.bottom + TARGET_GAP;

  return {
    left: clamp(left, EDGE_GAP, viewport.width - bubble.width - EDGE_GAP),
    top: clamp(top, EDGE_GAP, viewport.height - bubble.height - EDGE_GAP),
    side,
  };
}

function tutorialWasSeen() {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberTutorial() {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  } catch {
    // Private browsing or a restrictive storage policy should not block the UI.
  }
}

export function Tutorial() {
  const tutorialOpen = useUiStore((state) => state.tutorialOpen);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setUi = useUiStore((state) => state.set);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 1024px)").matches);
  const [step, setStep] = useState(0);
  const activeSteps = isMobile ? mobileSteps : desktopSteps;
  const activeStep = activeSteps[step] ?? activeSteps[0]!;
  const [targetRect, setTargetRect] = useState<DOMRect>();
  const [position, setPosition] = useState<BubblePosition>({ left: EDGE_GAP, top: EDGE_GAP, side: "bottom" });
  const bubbleRef = useRef<HTMLElement>(null);
  const previousLayout = useRef<{ sidebarCollapsed: boolean; mobileNavOpen: boolean; activeWorkspaceTab: "chat" | "translator"; mobilePanelExpanded: boolean } | undefined>(undefined);
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!tutorialWasSeen()) setUi({ tutorialOpen: true });
  }, [setUi]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (tutorialOpen && !wasOpen.current) {
      const state = useUiStore.getState();
      previousLayout.current = { sidebarCollapsed, mobileNavOpen, activeWorkspaceTab: state.activeWorkspaceTab, mobilePanelExpanded: state.mobilePanelExpanded };
      setStep(0);
      setUi({
        activeWorkspaceTab: "translator",
        mobilePanelExpanded: !isMobile,
        sidebarCollapsed: false,
      });
    }
    wasOpen.current = tutorialOpen;
  }, [isMobile, mobileNavOpen, setUi, sidebarCollapsed, tutorialOpen]);

  useEffect(() => {
    if (!tutorialOpen || !isMobile) return;
    const target = activeStep.target;
    if (["global-boss", "add-boss", "archive", "hr-demo"].includes(target)) setUi({ mobileNavOpen: true, mobilePanelExpanded: false });
    else if (target === "mobile-translate") setUi({ mobileNavOpen: false, activeWorkspaceTab: "translator", mobilePanelExpanded: true });
    else if (target === "mobile-chat") setUi({ mobileNavOpen: false, activeWorkspaceTab: "chat", mobilePanelExpanded: true });
    else setUi({ mobileNavOpen: false, mobilePanelExpanded: false });
  }, [activeStep.target, isMobile, setUi, tutorialOpen]);

  useLayoutEffect(() => {
    if (!tutorialOpen) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bubbleRef.current?.querySelector<HTMLButtonElement>(".tutorial-next")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = [...(bubbleRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      if (!buttons.length) return;
      const first = buttons[0]!;
      const last = buttons.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus, true);
    return () => document.removeEventListener("keydown", trapFocus, true);
  }, [tutorialOpen]);

  const measure = useCallback(() => {
    if (!tutorialOpen) return;
    const target = document.querySelector<HTMLElement>(`[data-tutorial="${activeStep.target}"]`);
    if (!target) {
      setTargetRect(undefined);
      const bubble = bubbleRef.current?.getBoundingClientRect();
      setPosition({
        left: Math.max(EDGE_GAP, (window.innerWidth - (bubble?.width ?? 360)) / 2),
        top: Math.max(EDGE_GAP, (window.innerHeight - (bubble?.height ?? 180)) / 2),
        side: "bottom",
      });
      return;
    }
    const nextTargetRect = target.getBoundingClientRect();
    const bubbleRect = bubbleRef.current?.getBoundingClientRect();
    setTargetRect(nextTargetRect);
    setPosition(positionTutorialBubble(
      nextTargetRect,
      { width: bubbleRect?.width ?? 360, height: bubbleRect?.height ?? 180 },
      activeStep.preferredSide,
    ));
  }, [activeStep, tutorialOpen]);

  useLayoutEffect(() => {
    if (!tutorialOpen) return;
    const frame = requestAnimationFrame(measure);
    // The mobile view track transitions over .38s — re-measure until it settles so
    // the highlight ring lands on the target's final position, not mid-slide.
    const settleTimers = [320, 420, 540].map((delay) => window.setTimeout(measure, delay));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, tutorialOpen]);

  if (!tutorialOpen) return null;

  const close = () => {
    rememberTutorial();
    const restore = previousLayout.current;
    setUi({
      tutorialOpen: false,
      ...(restore ? {
        sidebarCollapsed: restore.sidebarCollapsed,
        mobileNavOpen: restore.mobileNavOpen,
        activeWorkspaceTab: restore.activeWorkspaceTab,
        mobilePanelExpanded: restore.mobilePanelExpanded,
      } : {}),
    });
    previousLayout.current = undefined;
    setStep(0);
    window.requestAnimationFrame(() => previousFocus.current?.focus());
  };

  const next = () => {
    if (step === activeSteps.length - 1) close();
    else setStep((current) => current + 1);
  };

  const spotlight = targetRect ? {
    left: Math.max(0, targetRect.left - 8),
    top: Math.max(0, targetRect.top - 8),
    width: targetRect.width + 16,
    height: targetRect.height + 16,
  } : undefined;

  return createPortal(
    <div className="tutorial-layer" aria-live="polite">
      <div className="tutorial-interaction-blocker" aria-hidden="true" />
      <div className={`tutorial-spotlight${spotlight ? "" : " tutorial-spotlight-full"}`} style={spotlight} aria-hidden="true" />
      <aside
        ref={bubbleRef}
        className="tutorial-bubble"
        data-side={position.side}
        style={{ left: position.left, top: position.top }}
        role="dialog"
        aria-modal="true"
        aria-label="서비스 사용 안내"
      >
        <div className="tutorial-count">{step + 1} / {activeSteps.length}</div>
        <p>{activeStep.message}</p>
        <div className="tutorial-actions">
          <button className="tutorial-skip" type="button" onClick={close}>건너뛰기</button>
          <button className="tutorial-next" type="button" onClick={next}>{step === activeSteps.length - 1 ? "시작하기" : "다음"}</button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
