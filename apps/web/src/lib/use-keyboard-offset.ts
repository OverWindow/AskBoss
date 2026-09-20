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
    // Resize-mode keyboards (Android Chrome) shrink the layout viewport along with
    // the visual one, so the panel flexes by itself and padding would double the
    // gap. Detect that against the tallest layout height seen (always captured
    // with the keyboard closed) instead of comparing against the visual viewport
    // instantaneously — iOS fires viewport resize/scroll while its dynamic toolbar
    // is also moving, which made the old gate report "shrunk" and zero the offset
    // exactly when the keyboard was overlaid.
    let baselineClientHeight = document.documentElement.clientHeight;
    const KEYBOARD_MIN_SHRINK = 100;
    const apply = () => {
      const clientHeight = document.documentElement.clientHeight;
      baselineClientHeight = Math.max(baselineClientHeight, clientHeight);
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const layoutShrank = baselineClientHeight - clientHeight > KEYBOARD_MIN_SHRINK;
      document.documentElement.style.setProperty("--keyboard-offset", layoutShrank ? "0px" : `${Math.round(offset)}px`);
      // The mobile workspace body is scroll-locked, but momentum scrolling and
      // Chrome's scroll restoration around keyboard show/hide can still leave a
      // stale document offset that drags the fixed nav and panel titles away.
      if (window.scrollY && window.matchMedia("(max-width:767px)").matches) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    window.addEventListener("focusin", apply);
    window.addEventListener("focusout", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      window.removeEventListener("focusin", apply);
      window.removeEventListener("focusout", apply);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);
}
