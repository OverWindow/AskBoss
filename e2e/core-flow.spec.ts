import { expect, test } from "@playwright/test";

test("아바타와 대화·번역 패널을 한 화면에서 사용할 수 있다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "모두의 상사", exact: true })).toBeVisible();
  const skip = page.getByRole("button", { name: "건너뛰기" });
  if (await skip.isVisible()) await skip.click();

  const translatorPanel = page.getByLabel("상사의 말 번역");
  const chatPanel = page.getByLabel("모두의 상사와 대화");
  await expect(translatorPanel).toBeVisible();
  await expect(chatPanel).toBeVisible();
  await expect(page.getByAltText("모두의 상사 픽셀 아바타")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("대화 입력").fill("일정이 조금 늦어질 것 같습니다.");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(chatPanel.getByText(/현재 진행 상황부터/)).toBeVisible();

  await page.getByLabel("상사가 뭐라고 했나요?").fill("이거 언제 되나?");
  await page.getByRole("button", { name: "해석하기" }).click();
  await expect(translatorPanel.getByText("쉽게 말하면")).toBeVisible();
  await expect(translatorPanel.getByText(/현재 진행 상황과 남은 일정을/)).toBeVisible();
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
