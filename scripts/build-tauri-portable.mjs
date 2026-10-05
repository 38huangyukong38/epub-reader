import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
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
const typescript = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const executable = fileURLToPath(new URL("../src-tauri/target/release/local-epub-reader.exe", import.meta.url));
const releaseDirectory = fileURLToPath(new URL("../release", import.meta.url));
const releaseExecutable = fileURLToPath(new URL("../release/Local EPUB Reader.exe", import.meta.url));

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

const typecheck = spawn(process.execPath, [typescript, "-b"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
const [typecheckExitCode] = await once(typecheck, "exit");
if (typecheckExitCode !== 0) process.exit(typecheckExitCode ?? 1);

const frontendBuild = spawn(process.execPath, [vite, "build"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
const [frontendExitCode] = await once(frontendBuild, "exit");
if (frontendExitCode !== 0) process.exit(frontendExitCode ?? 1);

const build = spawn(process.execPath, [tauriCli, "build", "--no-bundle"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
const [exitCode] = await once(build, "exit");
if (exitCode !== 0) process.exit(exitCode ?? 1);

if (!existsSync(executable)) throw new Error(`Tauri reported success but did not create ${executable}.`);
await mkdir(releaseDirectory, { recursive: true });
await copyFile(executable, releaseExecutable);
console.log(`Portable executable: ${releaseExecutable}`);
