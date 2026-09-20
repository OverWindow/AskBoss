import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPanel } from "./TranslatorPanel";
import { api } from "../../services/api-client";

vi.mock("../../services/api-client", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const boss: any = { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };
const examples = ["이거 언제 되나?", "한번 검토해 볼게요.", "이 정도는 알아서 해주세요."] as const;
const translation = { translationId: "00000000-0000-4000-8000-000000000010", archiveId: "00000000-0000-4000-8000-000000000020", result: { plainMeaning: "진행 상황을 확인하는 말입니다.", likelyIntent: ["일정 확인"], tone: "간결함", confidence: 0.8, surfaceActualGapScore: 20, replies: [{ text: "오늘 공유드리겠습니다.", style: "무난하게", reason: "일정 안내" }, { text: "오후에 드리겠습니다.", style: "간결하게", reason: "시점 안내" }, { text: "정리해서 공유드리겠습니다.", style: "부드럽게", reason: "예의 유지" }] } };

describe("TranslatorPanel", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue(translation as any);
  });

  it("inserts a selected example into the textarea without translating immediately", async () => {
    const onSourceMessage = vi.fn();
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={onSourceMessage} onSimulate={() => undefined}/>);

    const textarea = screen.getByLabelText("상사가 뭐라고 했나요?");
    expect(screen.queryByText("TRANSLATOR")).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute("placeholder");
    fireEvent.click(screen.getByRole("button", { name: "이거 언제 되나?" }));
    expect(textarea).toHaveValue("이거 언제 되나?");
    expect(mockedApi).not.toHaveBeenCalled();
    expect(onSourceMessage).not.toHaveBeenCalled();
  });

  it("uses the selected channel and blocks another example while loading", async () => {
    let finish: ((value: unknown) => void) | undefined;
    mockedApi.mockImplementation(() => new Promise((resolve) => { finish = resolve; }) as any);
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={() => undefined} onSimulate={() => undefined}/>);
    fireEvent.change(screen.getByLabelText("전달 수단은 무엇인가요?"), { target: { value: "메일" } });
    fireEvent.click(screen.getByRole("button", { name: "한번 검토해 볼게요." }));
    fireEvent.click(screen.getByRole("button", { name: "해석하기" }));
    expect(screen.getByRole("button", { name: "이 정도는 알아서 해주세요." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "이 정도는 알아서 해주세요." }));
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(mockedApi.mock.calls[0]?.[1]?.body))).toEqual({ inputText: "한번 검토해 볼게요.", channel: "메일" });
    finish?.(translation);
    await screen.findByText("진행 상황을 확인하는 말입니다.");
  });

  it("retries the translation that failed even after clearing the textarea", async () => {
    mockedApi.mockRejectedValueOnce(new Error("일시적인 오류")).mockResolvedValueOnce(translation as any);
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={() => undefined} onSimulate={() => undefined}/>);
    fireEvent.click(screen.getByRole("button", { name: "이 정도는 알아서 해주세요." }));
    fireEvent.click(screen.getByRole("button", { name: "해석하기" }));
    expect(await screen.findByText("일시적인 오류")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("상사가 뭐라고 했나요?"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(mockedApi.mock.calls[1]?.[1]?.body)).inputText).toBe("이 정도는 알아서 해주세요.");
  });

  it("does not mark a recommended reply as selected when simulation replacement is cancelled", async () => {
    const onSimulate = vi.fn(() => false);
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={() => undefined} onSimulate={onSimulate}/>);
    fireEvent.change(screen.getByLabelText("상사가 뭐라고 했나요?"), { target: { value: "일정 확인 부탁드립니다." } });
    fireEvent.click(screen.getByRole("button", { name: "해석하기" }));
    const [simulate] = await screen.findAllByRole("button", { name: /이 답변으로 대화를 시뮬레이션/ });
    expect(simulate).toBeDefined();
    fireEvent.click(simulate!);
    expect(onSimulate).toHaveBeenCalledTimes(1);
    expect(simulate).not.toHaveClass("is-selected");
  });

  it("records a copied reply, offers a dismissible actual-response prompt, and applies the modal result", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onActualResponseApplied = vi.fn();
    mockedApi.mockImplementation(async (path, options) => {
      if (String(path).endsWith("/selected-reply")) {
        expect(JSON.parse(String(options?.body))).toEqual({ replyIndex: 0 });
        return { archive: { actualResponse: null } } as any;
      }
      if (String(path).endsWith("/actual-response")) {
        expect(JSON.parse(String(options?.body))).toEqual({ content: "실제로는 내일 오전에 보자고 했습니다." });
        return {
          archive: { actualResponse: { content: "실제로는 내일 오전에 보자고 했습니다.", replyIndex: 0, replyText: translation.result.replies[0]!.text } },
          activeChat: { threadId: "thread-2", archiveId: translation.archiveId, messages: [] },
        } as any;
      }
      return translation as any;
    });
    render(<TranslatorPanel boss={boss} active examples={examples} onSourceMessage={() => undefined} onSimulate={() => undefined} onActualResponseApplied={onActualResponseApplied}/>);
    fireEvent.change(screen.getByLabelText("상사가 뭐라고 했나요?"), { target: { value: "일정 확인 부탁드립니다." } });
    fireEvent.click(screen.getByRole("button", { name: "해석하기" }));
    const copyButtons = await screen.findAllByRole("button", { name: "복사" });
    fireEvent.click(copyButtons[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(translation.result.replies[0]!.text));
    expect(await screen.findByText("답변을 받았나요?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "답변 확인 닫기" }));
    expect(screen.queryByText("답변을 받았나요?")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "복사됨" })[0]!);
    await screen.findByText("답변을 받았나요?");
    fireEvent.click(screen.getByRole("button", { name: "실제 답변 입력" }));
    fireEvent.change(screen.getByLabelText("실제로 상사는 뭐라고 답했나요?"), { target: { value: "실제로는 내일 오전에 보자고 했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "실제 답변 반영" }));
    await waitFor(() => expect(onActualResponseApplied).toHaveBeenCalledWith({ threadId: "thread-2", archiveId: translation.archiveId, messages: [] }));
    expect(screen.getByText("실제 답변이 저장되었습니다.")).toBeInTheDocument();
  });

});
