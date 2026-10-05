import configuration from "../src-tauri/tauri.conf.json";

it("allows HTML file drops in the Windows webview", () => {
  expect(configuration.app.windows[0].dragDropEnabled).toBe(false);
});
