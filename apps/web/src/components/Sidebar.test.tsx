import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { api } from "../services/api-client";
import { useUiStore } from "../stores/ui-store";

vi.mock("../services/api-client", () => ({ api: vi.fn() }));
vi.mock("../features/boss/useBosses", () => ({ useBosses: () => ({ data: [
  { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", alias: "모두의 상사", avatarKey: "boss-male-01" },
  { id: "personal-boss", scope: "SESSION", alias: "김부장", avatarKey: "boss-female-01" },
] }) }));

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Sidebar/></MemoryRouter></QueryClientProvider>);
}

describe("Sidebar boss deletion", () => {
  beforeEach(() => {
    vi.mocked(api).mockImplementation(async (path) => path === "/profile" ? { profile: null } as any : undefined as any);
    useUiStore.setState({ selectedBossId: "personal-boss", sidebarCollapsed: false, mobileNavOpen: false, settingsOpen: false, activeWorkspaceTab: "translator", mobilePanelExpanded: false });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("offers deletion only for a personal boss and requires an irreversible warning confirmation", async () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: "모두의 상사 삭제" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "김부장 삭제" }));
    expect(screen.getByRole("dialog", { name: "상사 데이터 삭제" })).toHaveTextContent("복구할 수 없습니다");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(api).not.toHaveBeenCalledWith("/bosses/personal-boss", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "김부장 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "모두 삭제" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/bosses/personal-boss", { method: "DELETE" }));
    expect(useUiStore.getState()).toMatchObject({ selectedBossId: "00000000-0000-4000-8000-000000000001", activeWorkspaceTab: "chat", mobilePanelExpanded: true });
  });

  it("keeps the profile menu mounted during its closing animation", async () => {
    renderSidebar();
    const trigger = screen.getByRole("button", { name: "사용자 설정" });
    fireEvent.click(trigger);
    expect(screen.getByText("내 정보 · 상사 관리")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText("내 정보 · 상사 관리")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("내 정보 · 상사 관리")).not.toBeInTheDocument());
  });
});
