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
    let editableFocused = false;
    let reapplyTimer = 0;
    const KEYBOARD_MIN_SHRINK = 100;
    const apply = () => {
      const clientHeight = document.documentElement.clientHeight;
      baselineClientHeight = Math.max(baselineClientHeight, clientHeight);
      const rawOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const layoutShrank = baselineClientHeight - clientHeight > KEYBOARD_MIN_SHRINK;
      // Belt and braces: iOS often delivers focusin before the keyboard animates
      // and then coalesces the final viewport events, leaving a mid-animation
      // (near-zero) offset stuck. While an editable element is focused and the
      // visual viewport is provably shorter than the layout viewport, apply the
      // raw diff regardless of the gate. This stays correct on Android resize
      // mode because the layout shrinks along with the visual viewport there,
      // making rawOffset ~0 on its own.
      const keyboardVisible = editableFocused && rawOffset > 50;
      const offset = layoutShrank && !keyboardVisible ? 0 : Math.round(rawOffset);
      document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
      // The mobile workspace body is scroll-locked, but momentum scrolling and
      // Chrome's scroll restoration around keyboard show/hide can still leave a
      // stale document offset that drags the fixed nav and panel titles away.
      if (window.scrollY && window.matchMedia("(max-width:767px)").matches) window.scrollTo(0, 0);
    };
    // Re-apply for ~540ms after focus transitions: the keyboard animation
    // outlives the single focusin/focusout event, and iOS may fire no further
    // viewport events after a coalesced scroll/resize, so a one-shot apply can
    // otherwise freeze on a stale value.
    const scheduleReapply = () => {
      window.clearTimeout(reapplyTimer);
      let remaining = 6;
      const tick = () => {
        apply();
        remaining -= 1;
        if (remaining > 0) reapplyTimer = window.setTimeout(tick, 90);
      };
      tick();
    };
    const onFocusIn = (event: FocusEvent) => {
      editableFocused = event.target instanceof HTMLElement && Boolean(event.target.closest("input, textarea, select, [contenteditable]"));
      scheduleReapply();
    };
    const onFocusOut = () => {
      editableFocused = false;
      scheduleReapply();
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      window.clearTimeout(reapplyTimer);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);
}
