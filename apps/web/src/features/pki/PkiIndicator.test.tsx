import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PkiIndicator } from "./PkiIndicator";

const globalBoss: any = { id: "g", scope: "GLOBAL", status: "READY", alias: "모두의 상사", avatarKey: "boss-male-01", persona: null, pki: null };
const personalBoss: any = { ...globalBoss, id: "p", scope: "SESSION", alias: "김팀장", pki: { score: 62, completeness: 55, evidenceReliability: 70, diversity: 60, freshness: 68 } };

describe("PkiIndicator", () => {
  it("renders a hidden placeholder for the global boss to keep layout aligned", () => {
    const { container } = render(<PkiIndicator boss={globalBoss}/>);
    const placeholder = container.querySelector(".pki-indicator-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
  });

  it("explains the weighted score and closes with Escape", () => {
    render(<PkiIndicator boss={personalBoss}/>);
    const info = screen.getByRole("button", { name: "상사 파악도 산정 방식 보기" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("정보 충족도")).toBeInTheDocument();
    expect(screen.getByText("55점")).toBeInTheDocument();
    expect(screen.getByText("최신성")).toBeInTheDocument();
    expect(screen.getByText("68점")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "상사 파악도 산정 방식" })).not.toBeInTheDocument();
  });
});
