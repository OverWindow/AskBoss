import { useEffect } from "react";

/**
 * Tracks the soft keyboard through window.visualViewport and exposes its height
 * as the `--keyboard-offset` CSS custom property on <html>. The mobile chat
 * layout uses it to reserve either the bottom-nav clearance or the keyboard
 * height, so the composer sits directly above the keyboard while the title
 * remains fixed. No-ops when visualViewport is unavailable (desktop/jsdom).
 */
export function useKeyboardOffset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--keyboard-offset", `${Math.round(offset)}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);
}
