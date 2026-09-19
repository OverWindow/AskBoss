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
  test.use({ viewport: { width: 1440, height: 900 } });

  test("우측 통합 패널의 대화·번역 탭과 비저장 시뮬레이션을 지원한다", async ({ page }) => {
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
    await expect(translatorPanel.getByLabel("이 답변으로 대화를 시뮬레이션해 볼게요.")).toHaveCount(3);
    await translatorPanel.getByLabel("이 답변으로 대화를 시뮬레이션해 볼게요.").first().check();
    await expect(page.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    await expect(chatPanel).toBeVisible();
    await expect(chatPanel.getByText("임시 시뮬레이션", { exact: true })).toBeVisible();
    await expect(chatPanel.getByText("기록되지 않음", { exact: true })).toBeVisible();
    await expect(chatPanel.getByText("이거 언제 되나?", { exact: true })).toBeVisible();
    await expect(chatPanel.getByText("알겠어. 말한 일정대로 진행하고 변동 생기면 바로 알려줘.", { exact: true })).toBeVisible();

    await page.reload();
    await dismissTutorial(page);
    await expect(page.getByRole("tab", { name: "대화" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#chat-panel").getByText("이거 언제 되나?", { exact: true })).toHaveCount(0);
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

test("관리자 비밀번호 로그인 후 운영 현황을 확인할 수 있다", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  await page.getByLabel("관리자 비밀번호").fill("playwright-admin-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "운영 관리자" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "세션 현황" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 상태와 크레딧" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "개인 상사 공통 기본 성격" })).toBeVisible();
  await expect(page.getByLabel("시스템 프롬프트형 기본 성격")).not.toHaveValue("");
  await page.getByRole("link", { name: "모두의 상사 관리" }).click();
  await expect(page.getByRole("heading", { name: "모두의 상사 관리" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "기본 정보" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "관찰 자료" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "상황 설문" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "페르소나 반영" })).toBeVisible();
});
