import { describe, expect, it } from "vitest";
import { PlainTextStream, plainTextValues, toPlainText } from "../src/utils/plain-text";

describe("plain AI output", () => {
  it("removes common Markdown syntax without losing its text", () => {
    expect(toPlainText("# 제목\n- **핵심**\n[자세히](https://example.com)\n```txt\n일정 확인\n```")).toBe("제목\n핵심\n자세히\n\n일정 확인");
    expect(toPlainText("**닫히지 않은 강조와 `코드 표시")).toBe("닫히지 않은 강조와 코드 표시");
    expect(plainTextValues({ summary: "**결론**", nested: ["`일정`"] })).toEqual({ summary: "결론", nested: ["일정"] });
  });

  it("holds an incomplete Markdown fragment until it can be emitted safely", () => {
    const stream = new PlainTextStream();
    expect(stream.push("**결론")).toBe("");
    expect(stream.push("부터** 말해요.")).toBe("");
    expect(stream.flush()).toBe("결론부터 말해요.");
  });
});
