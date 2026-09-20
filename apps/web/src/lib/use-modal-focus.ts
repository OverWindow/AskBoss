import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const modalStack: HTMLElement[] = [];
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Keeps keyboard focus inside the top-most modal and restores it on close. */
export function useModalFocus<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T | null> {
  const rootRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push(root);

    const focusFirst = () => {
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== root) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.tabIndex >= 0);
      if (!focusable.length) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      const index = modalStack.lastIndexOf(root);
      if (index >= 0) modalStack.splice(index, 1);
      window.requestAnimationFrame(() => previousFocus?.focus({ preventScroll: true }));
    };
  }, [open]);

  useEffect(() => () => {
    const root = rootRef.current;
    if (!root) return;
    const index = modalStack.lastIndexOf(root);
    if (index >= 0) modalStack.splice(index, 1);
  }, []);

  return rootRef;
}
