import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidencePrivacyNotice } from "./BossOnboarding";

describe("EvidencePrivacyNotice", () => {
  it("warns before users upload conversations, text files, or images", () => {
    render(<EvidencePrivacyNotice/>);
    const notice = screen.getByRole("note", { name: "자료 업로드 개인정보 안내" });
    expect(notice).toHaveTextContent("기밀 정보나 개인 정보 노출이 없도록 주의해주세요!");
    expect(notice).toHaveTextContent("이름, 연락처, 계정 정보, 고객정보와 회사 기밀은 업로드 전에 가리거나 삭제해 주세요.");
  });
});
