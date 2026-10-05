import { expect, test } from "@playwright/test";

test("shows the empty local library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "本地书架" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导入 EPUB" })).toBeVisible();
});

test("imports and opens a local EPUB", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/test-book.epub");
  await expect(page.locator(".book-card__title")).toHaveText("E2E Test Book");

  await page.locator(".book-card__open").click();
  await expect(page.locator(".reader-toolbar__title")).toHaveText("E2E Test Book");
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();

  await page.getByRole("button", { name: "Chapter One" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();

  await page.getByRole("button", { name: "Chapter One" }).click();
  await page.getByRole("button", { name: "跳转" }).click();
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();

  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.locator(".book-card__title")).toHaveText("E2E Test Book");
});

test("keeps the reading page equally inset on both sides", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/test-book.epub");
  await page.locator(".book-card__open").click();

  const margins = await page.locator(".reader-page__content").evaluate((content) => {
    const page = content.querySelector<HTMLElement>(".reader-render-target")!;
    const contentRect = content.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    return {
      left: pageRect.left - contentRect.left,
      right: contentRect.right - pageRect.right,
    };
  });

  expect(Math.abs(margins.left - margins.right)).toBeLessThanOrEqual(1);
});

test("changes only horizontal text space while keeping the paper and vertical space fixed", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/test-book.epub");
  await page.locator(".book-card__open").click();

  const readingPage = page.locator(".reader-render-target");
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();
  const paper = page.locator(".reader-paper");
  const initialPaper = (await paper.boundingBox())!;
  const initialTarget = (await readingPage.boundingBox())!;
  const initialWidth = (await readingPage.boundingBox())!.width;
  const marginSlider = page.getByLabel("正文边距");
  await marginSlider.focus();
  await marginSlider.press("End");
  await expect(marginSlider).toHaveValue("56");

  await expect.poll(async () => (await readingPage.boundingBox())!.width).toBeLessThan(initialWidth);
  expect(await paper.boundingBox()).toEqual(initialPaper);
  const changedTarget = (await readingPage.boundingBox())!;
  expect(changedTarget.y).toBe(initialTarget.y);
  expect(changedTarget.height).toBe(initialTarget.height);
  expect(changedTarget.x - initialTarget.x).toBe(32);
  expect(initialTarget.width - changedTarget.width).toBe(64);
  await expect.poll(async () => (await page.locator(".reader-render-target iframe").first().boundingBox())!.width).toBeLessThan(initialWidth);
});

test("slides the entire sidebar left, restores it and remembers visibility", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/test-book.epub");
  await page.locator(".book-card__open").click();
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();
  const initialWidth = (await page.locator(".reader-paper").boundingBox())!.width;
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  await expect(page.locator(".reader-page__sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: "添加书签" })).toBeHidden();
  await expect.poll(async () => (await page.locator(".reader-paper").boundingBox())!.width).toBe(initialWidth + 280);
  await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/reader-sidebar-hidden.png" });
  await page.getByRole("button", { name: "返回书架" }).click();
  await page.locator(".book-card__open").click();
  await expect(page.locator(".reader-page__sidebar")).toBeHidden();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "目录" })).toBeVisible();
  await expect.poll(async () => (await page.locator(".reader-paper").boundingBox())!.width).toBe(initialWidth);
  await expect(page.getByRole("button", { name: "添加书签" })).toBeVisible();
  for (const [theme, color] of [["dark", "rgb(220, 228, 239)"], ["sepia", "rgb(245, 239, 223)"], ["light", "rgb(244, 247, 251)"]]) {
    await page.getByRole("combobox", { name: "主题", exact: true }).selectOption(theme);
    await expect(page.locator(".reader-page")).toHaveCSS("background-color", color);
    await expect(page.frameLocator(".reader-render-target iframe").first().locator("body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  await page.getByRole("button", { name: "返回书架" }).click();
  await page.locator(".book-card__open").click();
  await expect(page.getByRole("button", { name: "收起侧栏", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "目录" })).toBeVisible();
  await page.getByLabel("选择背景图片").setInputFiles({
    name: "background.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.locator(".reader-page__background-image")).toBeVisible();
  await page.getByRole("combobox", { name: "主题", exact: true }).selectOption("sepia");
  await expect(page.locator(".reader-toolbar")).toHaveCSS("background-color", "rgba(245, 239, 223, 0.72)");
  await expect(page.locator(".reader-page__sidebar")).toHaveCSS("background-color", "rgba(245, 239, 223, 0.72)");
  await expect(page.frameLocator(".reader-render-target iframe").first().locator("body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "test-results/reader-updated.png", fullPage: true });
});


