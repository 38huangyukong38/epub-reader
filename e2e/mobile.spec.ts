import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

const title = "手机阅读测试：很长的中文书名也应该完整保存在书架中并适应窄屏";
const firstChapter = "第一章 初次阅读";
const secondChapter = "第二章 继续旅程";

// A real, multi-page EPUB keeps navigation assertions independent of mocks.
async function mobileBook() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?><package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">mobile-reader-test</dc:identifier><dc:title>${title}</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-09-08T00:00:00Z</meta></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>`);
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">${firstChapter}</a></li><li><a href="chapter-2.xhtml">${secondChapter}</a></li></ol></nav></body></html>`);
  for (const [index, chapter] of [firstChapter, secondChapter].entries()) {
    const paragraphs = Array.from({ length: 36 }, (_, paragraph) => `<p>第 ${paragraph + 1} 段。清晨的阳光照进窗户，读者打开一本新书，沿着文字走入故事。无论是竖屏阅读还是横屏浏览，文字都应清晰，翻页后也能记住阅读位置。这里是一段用于手机屏幕的真实正文，帮助检查分页、目录、书签和触摸操作。</p>`).join("");
    zip.file(`OEBPS/chapter-${index + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter}</title></head><body><h1>${chapter}</h1>${paragraphs}</body></html>`);
  }
  return { name: "mobile-reader.epub", mimeType: "application/epub+zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}

async function importAndOpen(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(await mobileBook());
  await expect(page.locator(".book-card__title")).toHaveText(title);
  await page.locator(".book-card__open").click();
  await expect(page.locator(".reader-render-target iframe").first()).toBeVisible();
  await expect(page.locator(".reader-toolbar__chapter")).toHaveText(firstChapter);
  await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    height: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }))).toMatchObject({ width: page.viewportSize()!.width, viewport: page.viewportSize()!.width, height: page.viewportSize()!.height, viewportHeight: page.viewportSize()!.height });
}

async function openSidebar(page: Page) {
  await page.getByRole("button", { name: "显示目录栏", exact: true }).click();
  await expect(page.locator(".reader-page__sidebar")).toBeVisible();
}

async function jumpToChapter(page: Page, chapter: string) {
  await openSidebar(page);
  await page.getByRole("navigation", { name: "目录" }).getByRole("button", { name: chapter, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "跳转", exact: true }).click();
  await expect(page.locator(".reader-page__sidebar")).toBeHidden();
  await expect(page.locator(".reader-toolbar__chapter")).toHaveText(chapter);
}

test.describe("mobile reader", () => {
  test.describe.configure({ timeout: 60_000 });
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("imports, opens a drawer without shrinking text, navigates and restores bookmarks", async ({ page }) => {
    await importAndOpen(page);
    await expect(page.locator(".reader-page__sidebar")).toBeHidden();
    await expectNoOverflow(page);
    const paper = await page.locator(".reader-paper").boundingBox();
    await openSidebar(page);
    await expect(page.getByRole("button", { name: "关闭侧栏", exact: true })).toBeVisible();
    expect(await page.locator(".reader-paper").boundingBox()).toEqual(paper);
    await page.screenshot({ path: "test-results/mobile-sidebar.png", fullPage: true });
    await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
    await expect(page.locator(".reader-page__sidebar")).toBeHidden();

    const mobileNavigation = page.locator(".reader-mobile-navigation");
    await mobileNavigation.getByRole("button", { name: "下一页" }).click();
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await mobileNavigation.getByRole("button", { name: "上一页" }).click();
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await jumpToChapter(page, secondChapter);
    await mobileNavigation.getByRole("button", { name: "下一页" }).click();
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    const savedPage = await page.locator(".reader-toolbar__page").textContent();

    await openSidebar(page);
    await page.getByRole("button", { name: "添加书签" }).click();
    await expect(page.locator(".bookmark-panel__item")).toHaveCount(1);
    await page.getByRole("button", { name: `重命名书签 ${secondChapter}` }).click();
    await page.getByRole("textbox", { name: "书签名称" }).fill("手机阅读位置");
    await page.getByRole("button", { name: "保存书签名称" }).click();
    await expect(page.getByRole("button", { name: "手机阅读位置", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
    await page.getByRole("button", { name: "返回书架" }).click();
    await page.reload();
    await page.locator(".book-card__open").click();
    await expect(page.locator(".reader-page__sidebar")).toBeHidden();
    await expect(page.locator(".reader-toolbar__chapter")).toHaveText(secondChapter);
    await expect(page.locator(".reader-toolbar__page")).toHaveText(savedPage!);

    await jumpToChapter(page, firstChapter);
    await openSidebar(page);
    await page.getByRole("button", { name: "手机阅读位置", exact: true }).click();
    await expect(page.locator(".reader-page__sidebar")).toBeHidden();
    await expect(page.locator(".reader-toolbar__chapter")).toHaveText(secondChapter);
    await expect(page.locator(".reader-toolbar__page")).toHaveText(savedPage!);
    await page.screenshot({ path: "test-results/mobile-reader.png", fullPage: true });
  });

  test("keeps margins horizontal and themes transparent above the full-window background", async ({ page }) => {
    await importAndOpen(page);
    await openSidebar(page);
    const initialPaper = await page.locator(".reader-paper").boundingBox();
    const target = page.locator(".reader-render-target");
    const initialTarget = (await target.boundingBox())!;
    const margin = page.getByLabel("正文边距", { exact: true });
    await margin.fill("56");
    await expect(margin).toHaveValue("56");
    await expect.poll(async () => (await target.boundingBox())!.width).toBe(initialTarget.width - 64);
    expect(await page.locator(".reader-paper").boundingBox()).toEqual(initialPaper);
    const changedTarget = (await target.boundingBox())!;
    expect(changedTarget.y).toBe(initialTarget.y);
    expect(changedTarget.height).toBe(initialTarget.height);
    expect(changedTarget.x).toBe(initialTarget.x + 32);

    await page.getByLabel("选择背景图片").setInputFiles({ name: "background.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64") });
    const background = page.locator(".reader-page__background-image");
    await expect(background).toBeVisible();
    expect(await background.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    for (const [theme, color] of [["dark", "rgb(220, 228, 239)"], ["sepia", "rgb(245, 239, 223)"], ["light", "rgb(244, 247, 251)"]]) {
      await page.getByRole("combobox", { name: "主题", exact: true }).selectOption(theme);
      await expect(page.locator(".reader-page")).toHaveCSS("background-color", color);
      await expect(page.frameLocator(".reader-render-target iframe").first().locator("body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(background).toBeVisible();
    }
    await page.getByRole("button", { name: "关闭侧栏遮罩", exact: true }).click({ position: { x: 385, y: 420 } });
    await expect(page.locator(".reader-page__sidebar")).toBeHidden();
    await expectNoOverflow(page);
    await page.getByRole("button", { name: "返回书架" }).click();
    await page.locator(".book-card__open").click();
    await openSidebar(page);
    await expect(margin).toHaveValue("56");
    await expect(background).toBeVisible();
  });

  test("fits small portrait and landscape screens and resizes the EPUB after rotation", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await expectNoOverflow(page);
    await expect(page.getByRole("button", { name: "导入 EPUB" })).toBeInViewport();
    await importAndOpen(page);
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expectNoOverflow(page);
      const navigation = page.locator(".reader-mobile-navigation");
      await expect(navigation.getByRole("button", { name: "下一页" })).toBeInViewport();
      await expect(page.locator(".reader-render-target iframe").first()).toBeInViewport();
      await expect.poll(async () => {
        const target = (await page.locator(".reader-render-target").boundingBox())!;
        // The iframe contains all chapter columns; the stage is the visible page.
        const stage = (await page.locator(".reader-render-target .epub-container").boundingBox())!;
        return Math.abs(target.width - stage.width);
      }).toBeLessThanOrEqual(1);
      const paper = await page.locator(".reader-paper").boundingBox();
      await openSidebar(page);
      await expectNoOverflow(page);
      expect(await page.locator(".reader-paper").boundingBox()).toEqual(paper);
      await expect(page.getByRole("button", { name: "关闭侧栏", exact: true })).toBeInViewport();
      await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
      await expect(page.locator(".reader-page__sidebar")).toBeHidden();
    }
  });

  test("turns pages with a horizontal touch gesture inside EPUB content only", async ({ page }) => {
    await importAndOpen(page);
    const swipe = async (from: [number, number], to: [number, number]) => {
      await page.frameLocator(".reader-render-target iframe").first().locator("body").evaluate((body, { from, to }) => {
        const touch = (point: [number, number]) => new Touch({ identifier: 1, target: body, clientX: point[0], clientY: point[1], pageX: point[0], pageY: point[1] });
        const start = touch(from);
        body.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [start], targetTouches: [start], changedTouches: [start] }));
        body.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch(to)] }));
      }, { from, to });
    };
    await swipe([280, 220], [80, 225]);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await swipe([80, 220], [280, 225]);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await swipe([160, 300], [165, 80]);
    // Give an unintended asynchronous rendition.next() enough time to appear.
    await page.waitForTimeout(300);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await swipe([160, 220], [164, 224]);
    await page.waitForTimeout(300);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
  });

  test("turns pages by tapping both edges and toggles a full-height reading area with the center", async ({ page }) => {
    await importAndOpen(page);
    const content = page.locator(".reader-page__content");
    const target = page.locator(".reader-render-target");
    const tap = async (fraction: number) => {
      const box = (await content.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width * fraction, box.y + Math.min(160, box.height / 2));
    };
    await tap(0.97); // Includes the margin outside the EPUB iframe.
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await tap(0.03);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await tap(0.85); // Includes a page other than the chapter's initial column.
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await tap(0.15);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");

    await tap(0.575);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await expect(page.locator(".reader-toolbar")).toBeVisible();
    await tap(0.425);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await expect(page.locator(".reader-toolbar")).toBeVisible();

    const normalHeight = (await target.boundingBox())!.height;
    await tap(0.5);
    await expect(page.locator(".reader-toolbar")).toBeHidden();
    await expect(page.locator(".reader-mobile-navigation")).toBeHidden();
    await expect.poll(async () => (await target.boundingBox())!.height).toBeGreaterThan(normalHeight);
    await expect.poll(async () => (await content.boundingBox())!.height).toBe(844);
    await expectNoOverflow(page);
    await expect.poll(async () => {
      const stage = (await page.locator(".epub-container").boundingBox())!;
      return Math.abs(stage.height - (await target.boundingBox())!.height);
    }).toBeLessThanOrEqual(1);
    await tap(0.85);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await expect(page.locator(".reader-toolbar")).toBeHidden();
    await tap(0.15);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await page.screenshot({ path: "test-results/mobile-reading-controls-hidden.png", fullPage: true });
    await tap(0.5);
    await expect(page.locator(".reader-toolbar")).toBeVisible();
    await expect(page.locator(".reader-mobile-navigation")).toBeVisible();
    await expect.poll(async () => (await target.boundingBox())!.height).toBe(normalHeight);
    await page.screenshot({ path: "test-results/mobile-reading-controls-shown.png", fullPage: true });
  });

  test("keeps swipes and cross-chapter taps working with controls hidden and restores controls on Android back", async ({ page }) => {
    await importAndOpen(page);
    await jumpToChapter(page, secondChapter);
    const tap = async (fraction: number) => {
      const box = (await page.locator(".reader-page__content").boundingBox())!;
      await page.touchscreen.tap(box.x + box.width * fraction, box.y + Math.min(160, box.height / 2));
    };
    await tap(0.85);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await tap(0.15);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await tap(0.5);
    await expect(page.locator(".reader-toolbar")).toBeHidden();
    await expect.poll(async () => {
      const stage = (await page.locator(".epub-container").boundingBox())!;
      return Math.abs(stage.height - (await page.locator(".reader-render-target").boundingBox())!.height);
    }).toBeLessThanOrEqual(1);
    const client = await page.context().newCDPSession(page);
    try {
      const box = (await page.locator(".reader-render-target").boundingBox())!;
      const y = Math.round(box.y + box.height / 2);
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 280, y }] });
      for (const x of [240, 190, 130, 80]) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    } finally { await client.detach(); }
    await expect(page.locator(".reader-toolbar")).toBeHidden();
    await tap(0.15);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
    await tap(0.15);
    await expect(page.locator(".reader-toolbar__chapter")).toHaveText(firstChapter);
    await tap(0.85);
    await expect(page.locator(".reader-toolbar__chapter")).toHaveText(secondChapter);
    await tap(0.85);
    await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
    await expect(page.locator(".reader-mobile-navigation")).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event("reader-android-back", { cancelable: true })));
    await expect(page.locator(".reader-toolbar")).toBeVisible();
    await expect(page.locator(".reader-mobile-navigation")).toBeVisible();
    await expect(page.locator(".reader-render-target iframe")).toBeVisible();
  });
});

