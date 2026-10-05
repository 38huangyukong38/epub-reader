import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

const chapters = ["第一章 出发", "第二章 旅途", "第三章 归来"];

async function chapterBook() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?><package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">desktop-chapter-test</dc:identifier><dc:title>跨章节翻页测试</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-10-04T00:00:00Z</meta></metadata><manifest>${chapters.map((_, i) => `<item id="chapter-${i + 1}" href="chapter-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("")}<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine>${chapters.map((_, i) => `<itemref idref="chapter-${i + 1}"/>`).join("")}</spine></package>`);
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${chapters.map((name, i) => `<li><a href="chapter-${i + 1}.xhtml">${name}</a></li>`).join("")}</ol></nav></body></html>`);
  for (const [index, chapter] of chapters.entries()) {
    const paragraphs = Array.from({ length: 16 }, (_, i) => `<p>第 ${i + 1} 段。清晨的阳光照进窗户，读者打开一本新书，沿着文字走入故事。切换章节后，新的正文仍然可以用鼠标滚轮和点击继续翻页，返回前一章时也应如此。这里是一段真实的分页正文，用来验证连续阅读不会停在章节边界。</p>`).join("");
    zip.file(`OEBPS/chapter-${index + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter}</title></head><body><h1>${chapter}</h1>${paragraphs}</body></html>`);
  }
  return { name: "chapters.epub", mimeType: "application/epub+zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}

async function openBook(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(await chapterBook());
  await page.locator(".book-card__open").click();
  await expect(page.locator(".reader-toolbar__chapter")).toHaveText(chapters[0]);
  await expect(page.locator(".reader-toolbar__page")).toContainText("第 1 /");
}

async function position(page: Page) {
  return page.locator(".reader-toolbar").evaluate((toolbar) => `${toolbar.querySelector(".reader-toolbar__chapter")?.textContent}:${toolbar.querySelector(".reader-toolbar__page")?.textContent}`);
}

async function turn(page: Page, input: "wheel" | "click", direction: "next" | "previous") {
  const before = await position(page);
  const box = (await page.locator(".reader-render-target").boundingBox())!;
  await page.mouse.move(box.x + Math.min(140, box.width / 2), box.y + 100);
  if (input === "wheel") await page.mouse.wheel(0, direction === "next" ? 120 : -120);
  else await page.mouse.click(box.x + Math.min(140, box.width / 2), box.y + 100, { button: direction === "next" ? "left" : "right" });
  await expect.poll(() => position(page), { timeout: 5000 }).not.toBe(before);
}

for (const width of [1100, 1920]) {
  test.describe(`desktop ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const input of ["wheel", "click"] as const) {
      test(`${input} keeps working forward and backward across chapters and after a TOC jump`, async ({ page }) => {
        test.setTimeout(60_000);
        await openBook(page);
        for (let step = 0; step < 40 && await page.locator(".reader-toolbar__chapter").textContent() !== chapters[2]; step++) {
          await turn(page, input, "next");
        }
        await expect(page.locator(".reader-toolbar__chapter")).toHaveText(chapters[2]);
        await turn(page, input, "next");
        for (let step = 0; step < 40 && await page.locator(".reader-toolbar__chapter").textContent() !== chapters[0]; step++) {
          await turn(page, input, "previous");
        }
        await expect(page.locator(".reader-toolbar__chapter")).toHaveText(chapters[0]);
        await turn(page, input, "previous");
        await page.getByRole("navigation", { name: "目录" }).getByRole("button", { name: chapters[1], exact: true }).click();
        await page.getByRole("button", { name: "跳转", exact: true }).click();
        await expect(page.locator(".reader-toolbar__chapter")).toHaveText(chapters[1]);
        await turn(page, input, "next");
      });
    }
  });
}

test("aligns the sidebar checkbox and persists paper transparency without fading text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBook(page);
  const checkbox = page.getByRole("checkbox", { name: "显示目录栏", exact: true });
  const alignment = await checkbox.evaluate((input) => {
    const label = input.closest("label")!;
    const text = label.querySelector("span")!;
    const a = input.getBoundingClientRect();
    const b = text?.getBoundingClientRect();
    return b ? { verticalGap: Math.abs(a.y + a.height / 2 - b.y - b.height / 2), horizontalGap: Math.min(Math.abs(a.right - b.left), Math.abs(b.right - a.left)) } : undefined;
  });
  expect(alignment).toBeDefined();
  expect(alignment!.verticalGap).toBeLessThanOrEqual(2);
  expect(alignment!.horizontalGap).toBeLessThanOrEqual(10);

  await page.getByLabel("选择背景图片").setInputFiles({
    name: "background.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.locator(".reader-page__background-image")).toBeVisible();
  const slider = page.getByLabel("背景板透明度", { exact: true });
  await expect(slider).toHaveValue("45");
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("100");
  await expect(page.locator(".reader-background-overlay")).toHaveCSS("opacity", "0");
  await expect(page.locator(".reader-render-target")).toHaveCSS("opacity", "1");
  await expect(page.frameLocator(".reader-render-target iframe").first().locator("body")).toHaveCSS("opacity", "1");
  await slider.press("Home");
  await expect(page.locator(".reader-background-overlay")).toHaveCSS("opacity", "1");
  await slider.press("End");
  for (let i = 0; i < 5; i++) await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("75");
  await expect(page.locator(".reader-background-overlay")).toHaveCSS("opacity", "0.25");
  await page.getByRole("combobox", { name: "主题", exact: true }).selectOption("sepia");
  await expect(page.locator(".reader-background-overlay")).toHaveCSS("background-color", "rgb(245, 239, 223)");
  const paperBox = await page.locator(".reader-paper").boundingBox();
  await page.screenshot({ path: "test-results/desktop-reader-settings.png", fullPage: true });
  await page.getByRole("button", { name: "返回书架" }).click();
  await page.reload();
  await page.locator(".book-card__open").click();
  await expect(page.getByLabel("背景板透明度", { exact: true })).toHaveValue("75");
  await expect(page.locator(".reader-background-overlay")).toHaveCSS("opacity", "0.25");
  expect(await page.locator(".reader-paper").boundingBox()).toEqual(paperBox);
});
