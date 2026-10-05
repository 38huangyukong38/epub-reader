import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const localCargoHome = fileURLToPath(new URL("../tools/rust/cargo", import.meta.url));
const localRustupHome = fileURLToPath(new URL("../tools/rust/rustup", import.meta.url));
const localCargoBin = `${localCargoHome}\\bin`;
const localToolchainCargo = `${localRustupHome}\\toolchains\\stable-x86_64-pc-windows-msvc\\bin\\cargo.exe`;
const userCargoBin = `${process.env.USERPROFILE ?? ""}\\.cargo\\bin`;
const userCargo = `${userCargoBin}\\cargo.exe`;
const tauriCli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const command = process.argv[2];

if (command !== "dev") throw new Error("Usage: node scripts/run-tauri.mjs dev");

const env = { ...process.env };
env.CARGO_HTTP_MULTIPLEXING ??= "false";
env.CARGO_REGISTRIES_CRATES_IO_PROTOCOL ??= "sparse";
if (existsSync(localToolchainCargo)) {
  env.CARGO_HOME = localCargoHome;
  env.RUSTUP_HOME = localRustupHome;
  env.PATH = `${localCargoBin};${env.PATH ?? ""}`;
} else if (existsSync(userCargo)) {
  env.CARGO_HOME = localCargoHome;
  env.PATH = `${userCargoBin};${env.PATH ?? ""}`;
}

const tauri = spawn(process.execPath, [tauriCli, command], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
const [exitCode] = await once(tauri, "exit");
process.exit(exitCode ?? 1);
