import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const playwright = fileURLToPath(new URL("../node_modules/playwright/cli.js", import.meta.url));
const url = "http://127.0.0.1:5173/";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited before becoming available (code ${server.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await wait(100);
  }
  throw new Error("Timed out waiting for Vite to start.");
}

async function isServerAvailable() {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([once(server, "exit"), wait(5_000)]);
}

const existingServer = await isServerAvailable();
const server = existingServer ? undefined : spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

try {
  if (server) await waitForServer(server);
  const test = spawn(process.execPath, [playwright, "test", ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0", PLAYWRIGHT_EXTERNAL_SERVER: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  const [exitCode] = await once(test, "exit");
  process.exitCode = exitCode ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server) await stopServer(server);
}
