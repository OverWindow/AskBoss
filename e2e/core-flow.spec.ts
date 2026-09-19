import { expect, test, type Page } from "@playwright/test";

async function dismissTutorial(page: Page) {
  const skip = page.getByRole("button", { name: "건너뛰기" });
  try {
    await expect(skip).toBeVisible({ timeout: 1_500 });
    await skip.click();
  } catch {
    // The tutorial was already completed in this browser context.
  }
}

test.describe("메인 인터랙션", () => {
  test.use({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });

  test("번역 시뮬레이션을 단일 대화로 이어가고 실제 답변을 저장·초기화한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "모두의 상사", exact: true })).toBeVisible();
    await dismissTutorial(page);

    const avatar = page.getByAltText("모두의 상사 픽셀 아바타");
    const translatorPanel = page.locator("#translator-panel");
    const chatPanel = page.locator("#chat-panel");
    const dock = page.getByRole("complementary", { name: "대화와 번역" });
    await expect(dock).toBeVisible();
    await expect(chatPanel).toBeVisible();
    await expect(translatorPanel).toBeHidden();
    await expect(page.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");

    const avatarBox = await avatar.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(avatarBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(avatarBox!.x + avatarBox!.width).toBeLessThan(dockBox!.x);

    await page.getByLabel("대화 입력").fill("일정이 조금 늦어질 것 같습니다.");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(chatPanel.getByText(/현재 진행 상황부터/)).toBeVisible();

    await page.getByRole("tab", { name: "번역" }).click();
    await expect(translatorPanel).toBeVisible();
    await expect(chatPanel).toBeHidden();
    await page.getByLabel("상사가 뭐라고 했나요?").fill("이거 언제 되나?");
    await page.getByRole("button", { name: "해석하기" }).click();
    await expect(translatorPanel.getByRole("heading", { name: "쉽게 말하면" })).toBeVisible();
    await translatorPanel.getByRole("button", { name: "복사", exact: true }).first().click();
    await expect(translatorPanel.getByText("답변을 받았나요?", { exact: true })).toBeVisible();
    const simulationButtons = translatorPanel.getByRole("button", { name: "이 답변으로 대화를 시뮬레이션해 볼게요." });
    await expect(simulationButtons).toHaveCount(3);
    page.once("dialog", (dialog) => dialog.accept());
    await simulationButtons.first().click();
    await expect(page.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    await expect(chatPanel).toBeVisible();
    await expect(chatPanel.getByText("이거 언제 되나?", { exact: true })).toBeVisible();
    await expect(chatPanel.getByText("알겠어. 말한 일정대로 진행하고 변동 생기면 바로 알려줘.", { exact: true })).toBeVisible();
    await chatPanel.getByRole("button", { name: "실제로 답변은 달랐어요" }).click();
    await chatPanel.getByLabel("실제로 상사는 뭐라고 답했나요?").fill("실제로는 내일 오전에 다시 보자고 했습니다.");
    await chatPanel.getByRole("button", { name: "실제 답변 반영", exact: true }).click();
    await expect(chatPanel.getByText("실제 답변", { exact: true })).toBeVisible();
    await expect(chatPanel.getByText("실제로는 내일 오전에 다시 보자고 했습니다.", { exact: true })).toBeVisible();

    await page.reload();
    await dismissTutorial(page);
    await expect(page.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#chat-panel").getByText("이거 언제 되나?", { exact: true })).toBeVisible();
    await expect(page.locator("#chat-panel").getByText("실제 답변", { exact: true })).toBeVisible();
    await expect(page.locator("#chat-panel").getByText("실제로는 내일 오전에 다시 보자고 했습니다.", { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "대화 초기화" }).click();
    await expect(page.locator("#chat-panel").getByText("하고 싶은 말을 적어보세요.")).toBeVisible();
    await page.getByRole("button", { name: "아카이브" }).click();
    await expect(page.getByRole("dialog", { name: "번역 아카이브" })).toBeVisible();
    const archived = page.getByRole("button", { name: /이거 언제 되나?/ }).first();
    await expect(archived).toBeVisible();
    await archived.click();
    await expect(page.getByText("마지막으로 복사한 답변")).toBeVisible();
    await expect(page.getByText("실제로는 내일 오전에 다시 보자고 했습니다.", { exact: true }).first()).toBeVisible();
  });

  test("아바타를 누르면 서버 호출 없이 말풍선이 바뀐다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "모두의 상사", exact: true })).toBeVisible();
    await dismissTutorial(page);
    let monologueCalls = 0;
    page.on("request", (request) => { if (request.url().includes("/monologue")) monologueCalls++; });
    await page.getByRole("button", { name: "모두의 상사의 한마디 바꾸기" }).click();
    await expect(page.getByText(/결론부터 얘기해 보지/)).toBeVisible();
    expect(monologueCalls).toBe(0);
  });
});

test("모바일에서는 하단 패널을 기본으로 펼치고 접을 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissTutorial(page);
  const avatar = page.getByAltText("모두의 상사 픽셀 아바타");
  await expect(avatar).toBeVisible();
  await expect(page.locator("#chat-panel")).toBeVisible();
  const collapse = page.getByRole("button", { name: "패널 접기" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(page.getByRole("button", { name: "패널 펼치기" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("tab", { name: "번역" }).click();
  await expect(page.locator("#translator-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "패널 접기" })).toHaveAttribute("aria-expanded", "true");
  await expect(avatar).toBeVisible();
});

test("낮은 모바일 화면에서도 상사 파악도가 하단 패널에 가려지지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await dismissTutorial(page);
  await page.evaluate(async () => {
    const response = await fetch("/api/bosses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias: "모바일 파악도 테스트", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트 회사", ageBand: 40, hierarchyScore: 70 }) });
    if (!response.ok) throw new Error("테스트 상사를 만들지 못했습니다.");
  });
  await page.reload();
  await dismissTutorial(page);
  await page.getByRole("button", { name: "모바일 파악도 테스트", exact: true }).click();

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    const indicator = page.locator("[data-tutorial='pki']");
    const dock = page.getByRole("complementary", { name: "대화와 번역" });
    await indicator.scrollIntoViewIfNeeded();
    await expect(indicator).toBeVisible();
    const indicatorBox = await indicator.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(indicatorBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(indicatorBox!.y + indicatorBox!.height).toBeLessThanOrEqual(dockBox!.y + 1);

    const collapse = page.getByRole("button", { name: "패널 접기" });
    await collapse.click();
    await indicator.scrollIntoViewIfNeeded();
    const collapsedIndicatorBox = await indicator.boundingBox();
    const collapsedDockBox = await dock.boundingBox();
    expect(collapsedIndicatorBox!.y + collapsedIndicatorBox!.height).toBeLessThanOrEqual(collapsedDockBox!.y + 1);
    await page.getByRole("button", { name: "패널 펼치기" }).click();
  }
});

test("관리자 비밀번호 로그인 후 운영 현황을 확인할 수 있다", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  await page.getByLabel("관리자 비밀번호").fill("playwright-admin-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "운영 관리자" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "세션 현황" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 상태와 크레딧" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "개인 상사 공통 기본 성격" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 업무 프롬프트" })).toBeVisible();
  await expect(page.getByLabel("번역 업무 지침")).not.toHaveValue("");
  await expect(page.getByLabel("개인 상사 공통 시스템 프롬프트")).not.toHaveValue("");
  await page.getByRole("link", { name: "모두의 상사 관리" }).click();
  await expect(page.getByRole("heading", { name: "모두의 상사 관리" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "기본 정보" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "모두의 상사 전용 프롬프트" })).toBeVisible();
  await expect(page.getByLabel("시스템 프롬프트형 기본 성격")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "관찰 자료" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "상황 설문" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "페르소나 반영" })).toBeVisible();
});
