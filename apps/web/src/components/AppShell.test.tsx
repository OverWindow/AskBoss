import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { useUiStore } from "../stores/ui-store";

vi.mock("./Sidebar", () => ({ Sidebar: () => <aside>메뉴 내용</aside> }));
vi.mock("../pages/ArchivePage", () => ({ ArchiveModal: () => null }));

describe("AppShell mobile navigation", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("max-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    useUiStore.setState({ mobileNavOpen: false });
  });
  afterEach(() => cleanup());

  it("opens the mobile menu and closes it from the backdrop", () => {
    render(<AppShell><div>페이지 내용</div></AppShell>);

    const trigger = screen.getByRole("button", { name: "메뉴 열기" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("페이지 내용").closest("main")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "메뉴 닫기" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
  });
});
