import { expect, test, type Page } from "@playwright/test";

async function dismissTutorial(page: Page) {
  const skip = page.getByRole("button", { name: "건너뛰기" });
  if (await skip.isVisible()) await skip.click();
}

test.describe("메인 인터랙션", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("아바타를 움직이지 않고 양쪽 패널을 독립적으로 연다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "모두의 상사", exact: true })).toBeVisible();
    await dismissTutorial(page);

    const avatar = page.getByAltText("모두의 상사 픽셀 아바타");
    const translatorPanel = page.getByLabel("상사의 말 번역");
    const chatPanel = page.getByLabel("모두의 상사와 대화");
    const before = await avatar.boundingBox();
    expect(before).not.toBeNull();
    await expect(translatorPanel).toBeHidden();
    await expect(chatPanel).toBeHidden();

    await page.getByRole("button", { name: "번역 패널 열기" }).click();
    await expect(translatorPanel).toBeVisible();
    await page.getByRole("button", { name: "대화 패널 열기" }).click();
    await expect(translatorPanel).toBeVisible();
    await expect(chatPanel).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const after = await avatar.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);

    await page.getByLabel("대화 입력").fill("일정이 조금 늦어질 것 같습니다.");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(chatPanel.getByText(/현재 진행 상황부터/)).toBeVisible();

    await page.getByLabel("상사가 뭐라고 했나요?").fill("이거 언제 되나?");
    await page.getByRole("button", { name: "해석하기" }).click();
    await expect(translatorPanel.getByRole("heading", { name: "쉽게 말하면" })).toBeVisible();
  });
});

test("모바일에서는 아바타를 유지하고 한 패널만 연다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "모두의 상사", exact: true })).toBeVisible();
  await dismissTutorial(page);

  const avatar = page.getByAltText("모두의 상사 픽셀 아바타");
  const translatorPanel = page.getByLabel("상사의 말 번역");
  const chatPanel = page.getByLabel("모두의 상사와 대화");
  await page.getByRole("button", { name: "번역 패널 열기" }).click();
  await expect(avatar).toBeVisible();
  await expect(translatorPanel).toBeVisible();
  await page.getByRole("button", { name: "대화 패널 열기" }).click();
  await expect(avatar).toBeVisible();
  await expect(translatorPanel).toBeHidden();
  await expect(chatPanel).toBeVisible();
});

test("관리자 비밀번호 로그인 후 운영 현황을 확인할 수 있다", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  await page.getByLabel("관리자 비밀번호").fill("playwright-admin-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "운영 관리자" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "세션 현황" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 상태와 크레딧" })).toBeVisible();
});
