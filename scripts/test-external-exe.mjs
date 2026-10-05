import { spawn } from "node:child_process";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import JSZip from "jszip";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "test-results", "desktop-external-open", String(Date.now()));
await mkdir(output, { recursive: true });
const exe = path.join(root, "release", "Local EPUB Reader.exe");
const first = path.join(output, "中文 图书.epub");
const second = path.join(output, "第二本 图书.epub");
const renamed = path.join(output, "改名后的图书.epub");
await copyFile(path.join(root, "e2e", "fixtures", "test-book.epub"), first);
const zip = await JSZip.loadAsync(await readFile(first));
const packageFile = zip.file("OEBPS/content.opf");
const metadata = await packageFile.async("string");
zip.file("OEBPS/content.opf", metadata.replace("E2E Test Book", "Second E2E Test Book").replace("e2e-test-book", "second-e2e-test-book"));
await writeFile(second, await zip.generateAsync({ type: "nodebuffer" }));
await copyFile(second, renamed);
const endpoint = "http://127.0.0.1:9337";
const env = { ...process.env, WEBVIEW2_USER_DATA_FOLDER: path.join(output, "profile"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9337 --remote-debugging-address=127.0.0.1" };
const app = spawn(exe, [first], { cwd: root, env, windowsHide: true, stdio: "ignore" });
let browser;
try {
  const deadline = Date.now() + 20000;
  while (true) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) break; } catch { }
    if (Date.now() > deadline) throw new Error("Desktop WebView2 debugging endpoint did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0];
  await expect(page.locator(".reader-toolbar__title")).toHaveText("E2E Test Book", { timeout: 30000 });
  console.log("PASS: real EXE cold launch opens a Unicode path containing spaces.");
  const launch = (file) => new Promise((resolve, reject) => {
    const process = spawn(exe, [file], { cwd: root, env, windowsHide: true, stdio: "ignore" });
    process.once("error", reject);
    process.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Second instance exited ${code}`)));
  });
  await launch(second);
  await expect(page.locator(".reader-toolbar__title")).toHaveText("Second E2E Test Book", { timeout: 30000 });
  console.log("PASS: second launch forwards EPUB to the existing reader.");
  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.locator(".book-card")).toHaveCount(2);
  await launch(renamed);
  await expect(page.locator(".reader-toolbar__title")).toHaveText("Second E2E Test Book", { timeout: 30000 });
  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.screenshot({ path: path.join(output, "native-external-open.png") });
  console.log("PASS: renamed identical EPUB reuses its existing book record.");
} finally {
  await browser?.close().catch(() => undefined);
  app.kill();
}
