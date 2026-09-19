import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PkiIndicator } from "./PkiIndicator";

const globalBoss: any = { id: "g", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };
const personalBoss: any = { ...globalBoss, id: "p", scope: "SESSION", alias: "김팀장", pki: { score: 62, completeness: 55, evidenceReliability: 70, diversity: 60, freshness: 68 } };

describe("PkiIndicator", () => {
  it("hides the indicator for the global boss", () => {
    const { container } = render(<PkiIndicator boss={globalBoss}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains the weighted score and closes with Escape", () => {
    render(<PkiIndicator boss={personalBoss}/>);
    const info = screen.getByRole("button", { name: "상사 파악도 산정 방식 보기" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("정보 충족도 35% + 근거 신뢰도 30% + 상황 다양성 20% + 최신성 15%")).toBeInTheDocument();
    expect(screen.getByText(/페르소나를 재생성할 때 다시 집계/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "상사 파악도 산정 방식" })).not.toBeInTheDocument();
  });
});
