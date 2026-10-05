import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";

async function bookBytes(title: string) {
  const zip = await JSZip.loadAsync(readFileSync("e2e/fixtures/test-book.epub"));
  const opf = await zip.file("OEBPS/content.opf")!.async("string");
  zip.file("OEBPS/content.opf", opf.replace("E2E Test Book", title));
  zip.file("OEBPS/chapter-1.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><h1>${title}</h1>${Array.from({ length: 20 }, (_, i) => `<p>第${i + 1}段。系统打开的 EPUB 会自动进入书架，重复打开已有内容会恢复阅读位置。这里是一段用于检查真实分页、外部打开和书签进度的正文。</p>`).join("")}</body></html>`);
  return (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("opens cold and warm system requests, resumes renamed content and rejects invalid files", async ({ page }) => {
  const a = await bookBytes("外部图书 A");
  const b = await bookBytes("外部图书 B");
  await page.addInitScript(({ a, b }) => {
    const hostWindow = window as Window & {
      __TAURI_INTERNALS__?: unknown; __readerExternalFilesReady?: boolean;
      __readerExternalPortToken?: string; __readerExternalPortConnected?: boolean;
      __externalTestHost?: { enqueue(id: string, name: string): void };
    };
    Object.defineProperty(navigator, "userAgent", { get: () => "Android external-open test" });
    hostWindow.__TAURI_INTERNALS__ = {};
    const data = new Map([[
      "a", atob(a),
    ], ["copy", atob(a)], ["b", atob(b)], ["bad", "not an EPUB"]]);
    const files = [{ id: "a", name: "中文 图书.epub" }];
    let port: MessagePort | undefined;
    hostWindow.__externalTestHost = {
      enqueue(id, name) { files.push({ id, name }); port?.postMessage(JSON.stringify({ kind: "available" })); },
    };
    setInterval(() => {
      if (!hostWindow.__readerExternalFilesReady || hostWindow.__readerExternalPortConnected) return;
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (event) => {
        const request = JSON.parse(event.data);
        let result: unknown;
        if (request.op === "take") result = files.splice(0).map(file => ({ ...file, size: data.get(file.id)!.length }));
        else if (request.op === "read") {
          const content = data.get(request.id)!;
          const part = content.slice(request.offset, request.offset + 128 * 1024);
          result = { data: btoa(part), done: request.offset + part.length >= content.length };
        } else result = {};
        port!.postMessage(JSON.stringify({ requestId: request.requestId, result }));
      };
      port.start();
      hostWindow.__readerExternalPortToken = "test-native-token";
      window.postMessage("reader-external-port:test-native-token", window.location.origin, [channel.port2]);
    }, 20);
  }, { a, b });
  await page.goto("/");
  await expect(page.locator(".reader-toolbar__title")).toHaveText("外部图书 A");
  await expect(page.locator(".reader-render-target iframe")).toBeVisible();
  await page.locator(".reader-mobile-navigation").getByRole("button", { name: "下一页" }).click();
  await expect(page.locator(".reader-toolbar__page")).toContainText("第 2 /");
  const savedPage = await page.locator(".reader-toolbar__page").textContent();
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("local-epub-reader"); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise<number | undefined>((resolve) => { const request = db.transaction("readingStates").objectStore("readingStates").getAll(); request.onsuccess = () => resolve(request.result[0]?.chapterPage); }); }
    finally { db.close(); }
  })).toBe(2);
  const send = async (id: string, name: string) => page.evaluate(({ id, name }) => {
    (window as Window & { __externalTestHost: { enqueue(id: string, name: string): void } }).__externalTestHost.enqueue(id, name);
  }, { id, name });
  await send("copy", "改名后的书.epub");
  await expect(page.locator(".reader-toolbar__title")).toHaveText("外部图书 A");
  await expect(page.locator(".reader-toolbar__page")).toHaveText(savedPage!);
  await send("b", "second.epub");
  await expect(page.locator(".reader-toolbar__title")).toHaveText("外部图书 B");
  await send("bad", "bad.epub");
  await expect(page.getByRole("dialog", { name: "无法打开 EPUB" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator(".reader-toolbar__title")).toHaveText("外部图书 B");
  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.locator(".book-card")).toHaveCount(2);
});
