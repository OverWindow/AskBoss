import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TranslatorPanel } from "./TranslatorPanel";

const boss: any = { id: "00000000-0000-4000-8000-000000000001", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };

describe("TranslatorPanel", () => {
  afterEach(() => cleanup());

  it("shows selectable examples without the English kicker or gray placeholder", () => {
    render(<TranslatorPanel boss={boss} active onSourceMessage={() => undefined} onSimulate={() => undefined}/>);

    const textarea = screen.getByLabelText("상사가 뭐라고 했나요?");
    expect(screen.queryByText("TRANSLATOR")).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute("placeholder");
    fireEvent.click(screen.getByRole("button", { name: "이거 언제 되나?" }));
    expect(textarea).toHaveValue("이거 언제 되나?");
  });

  it("hides global examples for a personal boss", () => {
    render(<TranslatorPanel boss={{ ...boss, id: "personal-boss", scope: "SESSION", alias: "김부장" }} active onSourceMessage={() => undefined} onSimulate={() => undefined}/>);

    expect(screen.queryByLabelText("예시 문장")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이거 언제 되나?" })).not.toBeInTheDocument();
  });
});
