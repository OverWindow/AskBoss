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
      // In resize mode (Android Chrome) the layout viewport shrinks along with the
      // visual viewport, so the panel flexes by itself and padding would double the
      // gap. Only overlay keyboards (iOS Safari) keep clientHeight tall and need the
      // manual offset.
      const layoutShrank = document.documentElement.clientHeight <= viewport.height + 8;
      document.documentElement.style.setProperty("--keyboard-offset", layoutShrank ? "0px" : `${Math.round(offset)}px`);
      // The mobile workspace body is scroll-locked, but momentum scrolling and
      // Chrome's scroll restoration around keyboard show/hide can still leave a
      // stale document offset that drags the fixed nav and panel titles away.
      if (window.scrollY && window.matchMedia("(max-width:767px)").matches) window.scrollTo(0, 0);
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
