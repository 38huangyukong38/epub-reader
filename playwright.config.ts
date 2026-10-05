import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1"
    ? undefined
    : { command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173", url: "http://127.0.0.1:5173", reuseExistingServer: false },
});
