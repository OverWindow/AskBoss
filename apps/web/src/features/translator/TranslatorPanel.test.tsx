import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPanel } from "./TranslatorPanel";
import { api } from "../../services/api-client";

vi.mock("../../services/api-client", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const boss: any = { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };
const examples = ["이거 언제 되나?", "한번 검토해 볼게요.", "이 정도는 알아서 해주세요."] as const;
const translation = { translationId: "00000000-0000-4000-8000-000000000010", result: { plainMeaning: "진행 상황을 확인하는 말입니다.", likelyIntent: ["일정 확인"], tone: "간결함", confidence: 0.8, surfaceActualGapScore: 20, replies: [{ text: "오늘 공유드리겠습니다.", style: "무난하게", reason: "일정 안내" }, { text: "오후에 드리겠습니다.", style: "간결하게", reason: "시점 안내" }, { text: "정리해서 공유드리겠습니다.", style: "부드럽게", reason: "예의 유지" }] } };

describe("TranslatorPanel", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue(translation as any);
  });

  it("runs a selected example immediately without copying it into the textarea", async () => {
    const onSourceMessage = vi.fn();
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={onSourceMessage} onSimulate={() => undefined}/>);

    const textarea = screen.getByLabelText("상사가 뭐라고 했나요?");
    expect(screen.queryByText("TRANSLATOR")).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute("placeholder");
    fireEvent.click(screen.getByRole("button", { name: "이거 언제 되나?" }));
    expect(textarea).toHaveValue("");
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(mockedApi.mock.calls[0]?.[1]?.body))).toEqual({ inputText: "이거 언제 되나?", channel: "카카오톡" });
    expect(onSourceMessage).toHaveBeenCalledWith("이거 언제 되나?");
    expect(await screen.findByText("진행 상황을 확인하는 말입니다.")).toBeInTheDocument();
  });

  it("uses the selected channel and blocks another example while loading", async () => {
    let finish: ((value: unknown) => void) | undefined;
    mockedApi.mockImplementation(() => new Promise((resolve) => { finish = resolve; }) as any);
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={() => undefined} onSimulate={() => undefined}/>);
    fireEvent.change(screen.getByLabelText("어떤 상황인가요?"), { target: { value: "메일" } });
    fireEvent.click(screen.getByRole("button", { name: "한번 검토해 볼게요." }));
    expect(screen.getByRole("button", { name: "이 정도는 알아서 해주세요." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "이 정도는 알아서 해주세요." }));
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(mockedApi.mock.calls[0]?.[1]?.body))).toEqual({ inputText: "한번 검토해 볼게요.", channel: "메일" });
    finish?.(translation);
    await screen.findByText("진행 상황을 확인하는 말입니다.");
  });

  it("retries the example that failed even when the textarea is empty", async () => {
    mockedApi.mockRejectedValueOnce(new Error("일시적인 오류")).mockResolvedValueOnce(translation as any);
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={() => undefined} onSimulate={() => undefined}/>);
    fireEvent.click(screen.getByRole("button", { name: "이 정도는 알아서 해주세요." }));
    expect(await screen.findByText("일시적인 오류")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(mockedApi.mock.calls[1]?.[1]?.body)).inputText).toBe("이 정도는 알아서 해주세요.");
  });

});
