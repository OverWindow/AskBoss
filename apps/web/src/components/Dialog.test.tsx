import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog keyboard behavior", () => {
  afterEach(() => cleanup());

  it("moves and traps focus, closes with Escape, and restores focus", async () => {
    const onClose = vi.fn();
    const content = <><button type="button">취소</button><button type="button">확인</button></>;
    const { rerender } = render(<><button type="button">열기</button><Dialog open={false} title="확인" onClose={onClose}>{content}</Dialog></>);
    const opener = screen.getByRole("button", { name: "열기" });
    opener.focus();
    rerender(<><button type="button">열기</button><Dialog open title="확인" onClose={onClose}>{content}</Dialog></>);

    await waitFor(() => expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "확인" }).closest(".dialog-backdrop")?.parentElement).toBe(document.body);
    screen.getByRole("button", { name: "확인" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<><button type="button">열기</button><Dialog open={false} title="확인" onClose={onClose}>{content}</Dialog></>);
    await waitFor(() => expect(screen.getByRole("button", { name: "열기" })).toHaveFocus());
  });
});
