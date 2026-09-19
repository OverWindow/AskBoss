import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HrDashboard as HrDashboardData } from "@askboss/shared";
import { api } from "../services/api-client";
import { HrDemoPage } from "./HrDemoPage";

vi.mock("../services/api-client", () => ({ api: vi.fn() }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => null, Cell: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
vi.mock("@visx/wordcloud", () => ({ Wordcloud: ({ words, children }: any) => <>{children(words.map((word: any, index: number) => ({ ...word, x: index * 30, y: 20, rotate: 0, size: 20, font: "sans-serif" })))}</> }));
vi.mock("@visx/text", () => ({ Text: ({ children }: any) => <text>{children}</text> }));

const actual: HrDashboardData = {
  dataSource: "ACTUAL", includesDemo: false,
  overview: { totalUses: 0, activeSubjects: 0, topFeature: "-", summary: "아직 집계된 실제 사용자 데이터가 없습니다." },
  topics: [], rankGap: [], ageGap: [], sameJobFunctionDistribution: [], surfaceActualGapRate: null, topRepeatedPhrases: [],
};
const mock: HrDashboardData = {
  dataSource: "MOCK", includesDemo: true,
  overview: { totalUses: 4_872, activeSubjects: 326, topFeature: "TRANSLATE", summary: "시연용 조직 인사이트입니다." },
  topics: [{ text: "보고", value: 94 }, { text: "일정", value: 88 }],
  rankGap: [{ label: "1단계", value: 914 }], ageGap: [{ label: "6~10년", value: 1_108 }],
  sameJobFunctionDistribution: [{ bucket: "SAME", count: 1_934 }, { bucket: "DIFF", count: 2_938 }],
  surfaceActualGapRate: 37.6, topRepeatedPhrases: [{ phrase: "이거 언제까지 가능해?", count: 184 }],
};

describe("HrDemoPage datasets", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path) => path === "/hr/dashboard?dataset=mock" ? mock as any : actual as any);
  });
  afterEach(() => cleanup());

  it("defaults to actual anonymous data and switches to a clearly labelled, populated mock dashboard", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><HrDemoPage/></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText("아직 집계된 실제 사용자 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "실제 익명 집계" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/모든 수치와 문구가 제품 시연용 가상 데이터/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Mock 데모" }));
    expect(await screen.findByText(/모든 수치와 문구가 제품 시연용 가상 데이터/)).toBeInTheDocument();
    expect(screen.getByText("100% 가상 데이터")).toBeInTheDocument();
    expect(screen.getByText("이거 언제까지 가능해?")).toBeInTheDocument();
    expect(screen.getByText("보고")).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalledWith("/hr/dashboard?dataset=actual"));
    expect(api).toHaveBeenCalledWith("/hr/dashboard?dataset=mock");
  });
});
