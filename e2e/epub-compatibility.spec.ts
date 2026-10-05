import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { existsSync } from "node:fs";

async function malformedBook() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file("OEBPS/content.opf", '<?xml version="1.0" encoding="UTF-8"?><package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">malformed-alt-test</dc:identifier><dc:title>缺失属性兼容测试</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-10-04T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="picture" href="picture.png" media-type="image/png"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file("OEBPS/nav.xhtml", '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">第一章</a></li></ol></nav></body></html>');
  zip.file("OEBPS/chapter.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章</h1><p>这是图片前的正文。</p><img src="picture.png" alt style="width:120px;height:80px"/><p id="after">图片后的完整正文应正常显示。</p></body></html>');
  zip.file("OEBPS/picture.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"));
  return { name: "malformed.epub", mimeType: "application/epub+zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile EPUB compatibility" : "desktop EPUB compatibility", () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });

    test("renders the full chapter and image despite a missing alt value", async ({ page }) => {
      await page.goto("/");
      await page.locator('input[type="file"]').setInputFiles(await malformedBook());
      await page.locator(".book-card__open").click();
      const body = page.frameLocator(".reader-render-target iframe").first().locator("body");
      await expect(body).toContainText("图片后的完整正文应正常显示。");
      await expect(body.locator("parsererror")).toHaveCount(0);
      await expect(body.locator("img")).toHaveAttribute("alt", "");
      await expect.poll(() => body.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    });

    test("renders all four affected chapters of the supplied 1.epub", async ({ page }) => {
      test.skip(!existsSync("release/1.epub"), "The user's source EPUB is optional local test data.");
      test.setTimeout(90_000);
      await page.goto("/");
      await page.locator('input[type="file"]').setInputFiles("release/1.epub");
      await page.locator(".book-card__open").click();
      await expect(page.locator(".reader-render-target iframe").first()).toBeVisible();
      for (const chapter of ["第一章", "第四章", "第五章", "第六章"]) {
        if (mobile) await page.getByRole("button", { name: "显示目录栏", exact: true }).click();
        await page.getByRole("navigation", { name: "目录", exact: true }).getByRole("button", { name: chapter, exact: true }).click();
        await page.getByRole("button", { name: "跳转", exact: true }).click();
        await expect(page.locator(".reader-toolbar__chapter")).toHaveText(chapter);
        const body = page.frameLocator(".reader-render-target iframe").first().locator("body");
        await expect(body.locator("parsererror")).toHaveCount(0);
        await expect(body).not.toContainText("This page contains the following errors");
        await expect.poll(() => body.locator("img").evaluateAll((images: HTMLImageElement[]) => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
        if (chapter === "第一章") {
          await expect(body).toContainText("那是他从未见过的美丽少女。");
          await page.screenshot({ path: `test-results/${mobile ? "mobile" : "desktop"}-source-epub-restored.png`, fullPage: true });
        }
      }
    });
  });
}
