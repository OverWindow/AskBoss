import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

const steps: TutorialStep[] = [
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
    target: "chat",
    message: "대화 버튼을 열면 나랑 업무 상황을 미리 연습해 볼 수 있고.",
    preferredSide: "left",
  },
  {
    target: "translate",
    message: "상사가 무슨 뜻으로 말한 건지 모르겠다면 번역을 써봐.",
    preferredSide: "right",
  },
  {
    target: "pki",
    message: "개인 상사의 정보가 쌓일수록 상사 파악도도 올라간다.",
    preferredSide: "bottom",
  },
  {
    target: "workspace",
    message: "그럼, 일해 볼까? 필요할 때 양옆 기능을 바로 열면 돼.",
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
  const [step, setStep] = useState(0);
  const activeStep = steps[step] ?? steps[0]!;
  const [targetRect, setTargetRect] = useState<DOMRect>();
  const [position, setPosition] = useState<BubblePosition>({ left: EDGE_GAP, top: EDGE_GAP, side: "bottom" });
  const bubbleRef = useRef<HTMLElement>(null);
  const previousLayout = useRef<{ sidebarCollapsed: boolean; mobileNavOpen: boolean } | undefined>(undefined);
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!tutorialWasSeen()) setUi({ tutorialOpen: true });
  }, [setUi]);

  useEffect(() => {
    if (tutorialOpen && !wasOpen.current) {
      previousLayout.current = { sidebarCollapsed, mobileNavOpen };
      setStep(0);
      setUi({
        chatPanelOpen: false,
        translatorPanelOpen: false,
        sidebarCollapsed: false,
      });
    }
    wasOpen.current = tutorialOpen;
  }, [mobileNavOpen, setUi, sidebarCollapsed, tutorialOpen]);

  useEffect(() => {
    if (!tutorialOpen || !window.matchMedia("(max-width: 850px)").matches) return;
    setUi({ mobileNavOpen: step < 2 });
  }, [setUi, step, tutorialOpen]);

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
    const afterLayout = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(afterLayout);
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
      } : {}),
    });
    previousLayout.current = undefined;
    setStep(0);
    window.requestAnimationFrame(() => previousFocus.current?.focus());
  };

  const next = () => {
    if (step === steps.length - 1) close();
    else setStep((current) => current + 1);
  };

  const spotlight = targetRect ? {
    left: Math.max(0, targetRect.left - 8),
    top: Math.max(0, targetRect.top - 8),
    width: targetRect.width + 16,
    height: targetRect.height + 16,
  } : undefined;

  return (
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
        <div className="tutorial-count">{step + 1} / {steps.length}</div>
        <p>{activeStep.message}</p>
        <div className="tutorial-actions">
          <button className="tutorial-skip" type="button" onClick={close}>건너뛰기</button>
          <button className="tutorial-next" type="button" onClick={next}>{step === steps.length - 1 ? "시작하기" : "다음"}</button>
        </div>
      </aside>
    </div>
  );
}
