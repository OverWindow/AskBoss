import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProfile } from "../features/profile/useProfile";
import { api } from "../services/api-client";
import { SettingsPage } from "./SettingsPage";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("../features/boss/useBosses", () => ({ useBosses: () => ({ data: [] }) }));
vi.mock("../services/api-client", () => ({ api: vi.fn() }));

const mockedApi = vi.mocked(api);
const initialProfile = { handle: "기존이름", ageBand: 30, yearsOfServiceBand: "3~4년", jobFunction: "개발", rank: "대리", entryPath: "신입", weaknesses: [] } as const;

function ProfileEcho() {
  const profile = useProfile();
  return <output aria-label="공유 프로필 이름">{profile.data?.handle}</output>;
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><SettingsPage/><ProfileEcho/></QueryClientProvider></MemoryRouter>);
  return client;
}

describe("SettingsPage profile saving", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/profile" && options?.method === "PUT") return { profile: { ...initialProfile, handle: JSON.parse(String(options.body)).handle } } as any;
      if (path === "/profile") return { profile: initialProfile } as any;
      return {} as any;
    });
  });
  afterEach(() => cleanup());

  it("applies the returned profile to every profile consumer before showing success", async () => {
    const client = renderSettings();
    const input = await screen.findByLabelText("사용자 ID");
    expect(screen.getByLabelText("공유 프로필 이름")).toHaveTextContent("기존이름");
    fireEvent.change(input, { target: { value: "새이름" } });
    fireEvent.click(screen.getByRole("button", { name: "내 정보 저장" }));
    expect(await screen.findByText("내 정보를 저장했습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("공유 프로필 이름")).toHaveTextContent("새이름");
    expect(client.getQueryData<{ handle: string }>(["profile"])?.handle).toBe("새이름");
  });

  it("shows local validation and server errors without a false success message", async () => {
    renderSettings();
    const input = await screen.findByLabelText("사용자 ID");
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "내 정보 저장" }));
    expect(await screen.findByText("사용자 ID는 3자 이상 입력해 주세요.")).toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalledWith("/profile", expect.objectContaining({ method: "PUT" }));

    mockedApi.mockImplementation(async (path, options) => {
      if (path === "/profile" && options?.method === "PUT") throw new Error("내 정보를 저장하지 못했습니다.");
      if (path === "/profile") return { profile: initialProfile } as any;
      return {} as any;
    });
    fireEvent.change(input, { target: { value: "새이름" } });
    fireEvent.click(screen.getByRole("button", { name: "내 정보 저장" }));
    expect(await screen.findByText("내 정보를 저장하지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText("내 정보를 저장했습니다.")).not.toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue("새이름"));
  });
});
