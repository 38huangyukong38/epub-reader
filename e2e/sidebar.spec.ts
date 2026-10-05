import { expect, test, type Locator, type Page } from "@playwright/test";
import JSZip from "jszip";

const longTitle = "一、茶从何处起源：从古老传说到现代考证，追寻茶叶文化在不同地区的发展与传播";

async function nestedBook() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file("OEBPS/content.opf", '<?xml version="1.0" encoding="UTF-8"?><package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">nested-sidebar-test</dc:identifier><dc:title>目录与侧栏滚动测试</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-10-04T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
  const volumes = Array.from({ length: 8 }, (_, i) => `<li><a href="chapter.xhtml${i ? `#volume-${i}` : ""}">第${i + 1}卷 茶文化</a><ol><li><a href="chapter.xhtml#section-${i}">${i ? `第${i + 1}卷 茶文化的历史` : longTitle}</a><ol><li><a href="chapter.xhtml#story-${i}">神话与传说${i + 1}</a></li><li><a href="chapter.xhtml#spread-${i}">茶文化的传播${i + 1}</a></li></ol></li><li><a href="chapter.xhtml#summary-${i}">本卷小结${i + 1}</a></li></ol></li>`).join("");
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${volumes}</ol></nav></body></html>`);
  const body = Array.from({ length: 8 }, (_, i) => `<h1 id="volume-${i}">第${i + 1}卷 茶文化</h1><h2 id="section-${i}">茶从何处起源</h2><p id="story-${i}">神话与传说。茶文化的故事与人们的生活紧密相连，目录应保持清晰的层级，阅读界面中的各个区域仍可独立滚动。</p><p id="spread-${i}">茶文化的传播。这里是用于检验真实 EPUB 阅读和侧栏操作的正文。</p><p id="summary-${i}">本卷小结。点击目录标题跳转，展开与收起箭头只改变目录显示。</p>`).join("");
  zip.file("OEBPS/chapter.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>茶文化</title></head><body>${body}</body></html>`);
  return { name: "nested-sidebar.epub", mimeType: "application/epub+zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}

async function openBook(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(await nestedBook());
  await expect(page.locator(".book-card__title")).toHaveText("目录与侧栏滚动测试");
  // Many saved bookmarks exercise the inner scroll container with real data.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("local-epub-reader");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const books = await new Promise<Array<{ id: string }>>((resolve, reject) => {
        const request = db.transaction("books").objectStore("books").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction("bookmarks", "readwrite");
      for (let i = 0; i < 24; i++) transaction.objectStore("bookmarks").put({
        id: `sidebar-bookmark-${i}`, bookId: books[0].id,
        cfi: `epubcfi(/6/2!/4/${i * 2 + 2}/1:0)`, chapterLabel: `阅读记录${i + 1}`,
        excerpt: "一段用于检验书签列表独立滚动的摘录。", createdAt: i,
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  });
  await page.locator(".book-card__open").click();
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();
  await expect(page.locator(".bookmark-panel__item")).toHaveCount(24);
}

test.use({ viewport: { width: 1440, height: 720 } });

test("keeps nested titles aligned and folds branches without jumping", async ({ page }) => {
  await openBook(page);
  const toc = page.getByRole("navigation", { name: "目录", exact: true });
  const root = toc.getByRole("button", { name: "第1卷 茶文化", exact: true });
  const child = toc.getByRole("button", { name: longTitle, exact: true });
  const grandchild = toc.getByRole("button", { name: "神话与传说1", exact: true });
  const rootBox = (await root.boundingBox())!;
  const childBox = (await child.boundingBox())!;
  const grandchildBox = (await grandchild.boundingBox())!;
  expect(childBox.x - rootBox.x).toBe(12);
  expect(grandchildBox.x - childBox.x).toBe(12);
  await expect(child).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const lines = await child.evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    return Array.from(range.getClientRects(), (rect) => rect.x);
  });
  expect(lines.length).toBeGreaterThan(1);
  expect(Math.max(...lines) - Math.min(...lines)).toBeLessThanOrEqual(1);
  const before = await page.locator(".reader-toolbar__page").textContent();
  await toc.getByRole("button", { name: "收起第1卷 茶文化", exact: true }).click();
  await expect(child).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".reader-toolbar__page")).toHaveText(before!);
  await toc.getByRole("button", { name: "展开第1卷 茶文化", exact: true }).click();
  await expect(child).toBeVisible();
  await child.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
});

async function wheelInside(page: Page, region: Locator) {
  await region.scrollIntoViewIfNeeded();
  await region.evaluate((element) => { element.scrollTop = 0; });
  const outer = page.locator(".reader-page__sidebar-scroll");
  const outerBefore = await outer.evaluate((element) => element.scrollTop);
  const box = (await region.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await outer.evaluate((element) => element.scrollTop)).toBe(outerBefore);
}

test("shows only the outer scrollbar while keeping inner wheel and keyboard scrolling", async ({ page }) => {
  await openBook(page);
  for (const selector of [".reader-page__toc", ".reader-page__bookmarks", ".reader-page__settings", ".reader-page__background"]) {
    const region = page.locator(selector);
    await expect(region).toHaveCSS("overflow-y", "auto");
    await expect(region).toHaveCSS("scrollbar-width", "none");
    expect(await region.evaluate((element) => getComputedStyle(element, "::-webkit-scrollbar").display)).toBe("none");
  }
  for (const selector of [".reader-page__toc", ".reader-page__bookmarks", ".reader-page__settings"]) {
    await wheelInside(page, page.locator(selector));
  }
  // Keyboard focus still scrolls hidden-bar containers to controls at the end.
  await page.getByLabel("背景板透明度", { exact: true }).focus();
  await expect(page.getByLabel("背景板透明度", { exact: true })).toBeFocused();
  expect(await page.locator(".reader-page__settings").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const outer = page.locator(".reader-page__sidebar-scroll");
  expect(await outer.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await outer.evaluate((element) => getComputedStyle(element).scrollbarWidth)).not.toBe("none");
  expect(await outer.evaluate((element) => getComputedStyle(element, "::-webkit-scrollbar").display)).not.toBe("none");
  await outer.evaluate((element) => { element.scrollTop = 0; });
  // Wheel over the gap belongs to the outer container on systems with either
  // classic or overlay scrollbars; wheel over a panel still scrolls that panel.
  const tocBox = (await page.locator(".reader-page__toc").boundingBox())!;
  const bookmarksBox = (await page.locator(".reader-page__bookmarks").boundingBox())!;
  await page.mouse.move(tocBox.x + tocBox.width / 2, (tocBox.y + tocBox.height + bookmarksBox.y) / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => outer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.locator(".reader-page__sidebar-scroll, .reader-page__toc, .reader-page__bookmarks, .reader-page__settings").evaluateAll((elements) => elements.forEach((element) => { element.scrollTop = 0; }));
  await page.screenshot({ path: "test-results/sidebar-layout.png", fullPage: true });
});

test.describe("mobile sidebar", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps the agreed directory and hidden inner scrollbars usable with touch", async ({ page }) => {
    await openBook(page);
    await page.getByRole("button", { name: "显示目录栏", exact: true }).click();
    const toc = page.locator(".reader-page__toc");
    const child = toc.getByRole("button", { name: longTitle, exact: true });
    const indentation = await toc.evaluate((element, title) => {
      const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>(".table-of-contents__item"));
      const root = buttons.find((button) => button.textContent === "第1卷 茶文化")!;
      const child = buttons.find((button) => button.textContent === title)!;
      return child.getBoundingClientRect().x - root.getBoundingClientRect().x;
    }, longTitle);
    expect(indentation).toBe(12);
    await toc.getByRole("button", { name: "收起第1卷 茶文化", exact: true }).click();
    await expect(child).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await toc.getByRole("button", { name: "展开第1卷 茶文化", exact: true }).click();
    await expect(child).toBeVisible();

    const outer = page.locator(".reader-page__sidebar-scroll");
    for (const selector of [".reader-page__toc", ".reader-page__bookmarks"]) {
      const region = page.locator(selector);
      await expect(region).toHaveCSS("scrollbar-width", "none");
      await expect(region).toHaveCSS("overflow-y", "auto");
      expect(await region.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    }
    expect(await outer.evaluate((element) => getComputedStyle(element).scrollbarWidth)).not.toBe("none");
    const outerBefore = await outer.evaluate((element) => element.scrollTop);
    const box = (await toc.boundingBox())!;
    const client = await page.context().newCDPSession(page);
    try {
      const x = Math.round(box.x + box.width / 2);
      const y = Math.round(box.y + box.height - 30);
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (const distance of [30, 60, 100, 140]) {
        await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - distance }] });
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => toc.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await outer.evaluate((element) => element.scrollTop)).toBe(outerBefore);
    } finally { await client.detach(); }
    await page.getByLabel("背景板透明度", { exact: true }).focus();
    await expect(page.getByLabel("背景板透明度", { exact: true })).toHaveValue("0");
    await page.getByLabel("背景板透明度", { exact: true }).press("End");
    await expect(page.locator(".reader-background-overlay")).toHaveCSS("opacity", "0");
    await page.screenshot({ path: "test-results/mobile-sidebar-updated.png", fullPage: true });
  });
});
