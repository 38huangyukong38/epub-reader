import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const local = (...parts) => path.join(root, "tools", "android", ...parts);
const command = process.argv[2] ?? "build";
if (!["build", "dev", "init"].includes(command)) {
  throw new Error("Usage: node scripts/run-android.mjs build|dev|init [--skip-frontend]");
}

const env = { ...process.env };
env.ANDROID_HOME ||= local("sdk");
env.ANDROID_SDK_ROOT ||= env.ANDROID_HOME;
env.ANDROID_USER_HOME ||= local("user");
env.GRADLE_USER_HOME ||= local("gradle");
env.CARGO_HOME = path.join(root, "tools", "rust", "cargo");
env.CARGO_HTTP_MULTIPLEXING ??= "false";
env.CARGO_PROFILE_DEV_DEBUG ??= "0";
env.CARGO_INCREMENTAL ??= "0";
env.CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = `${env.CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS ?? ""} -C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384`.trim();
if (!env.JAVA_HOME && existsSync(local("java"))) {
  const jdks = await readdir(local("java"));
  env.JAVA_HOME = jdks.map((name) => local("java", name)).find((dir) => existsSync(path.join(dir, "bin", "java.exe")));
}
if (!env.NDK_HOME && existsSync(path.join(env.ANDROID_HOME, "ndk"))) {
  const ndks = await readdir(path.join(env.ANDROID_HOME, "ndk"));
  env.NDK_HOME = path.join(env.ANDROID_HOME, "ndk", ndks.sort().at(-1));
}
if (!env.JAVA_HOME || !existsSync(env.ANDROID_HOME) || !env.NDK_HOME) {
  throw new Error("Android build tools missing. Set JAVA_HOME, ANDROID_HOME and NDK_HOME, or install them under tools/android. See README.md.");
}
const localRustup = path.join(root, "tools", "rust", "rustup");
const localCargo = path.join(root, "tools", "rust", "cargo", "bin");
if (existsSync(path.join(localRustup, "toolchains", "stable-x86_64-pc-windows-msvc", "bin", "cargo.exe"))) {
  env.RUSTUP_HOME = localRustup;
  env.RUSTUP_TOOLCHAIN = "stable";
  env.PATH = `${localCargo};${env.PATH ?? ""}`;
} else {
  env.PATH = `${path.join(env.USERPROFILE ?? "", ".cargo", "bin")};${env.PATH ?? ""}`;
}
env.PATH = `${path.join(env.JAVA_HOME, "bin")};${path.join(env.ANDROID_HOME, "platform-tools")};${env.PATH}`;

async function run(script, args, allowSymlinkFallback = false) {
  const child = spawn(process.execPath, [path.join(root, script), ...args], {
    cwd: root, env, stdio: allowSymlinkFallback ? ["inherit", "inherit", "pipe"] : "inherit", windowsHide: true,
  });
  let diagnostic = "";
  if (allowSymlinkFallback) child.stderr.on("data", (data) => { diagnostic += data; process.stderr.write(data); });
  const [code] = await once(child, "exit");
  if (code !== 0) {
    if (allowSymlinkFallback && diagnostic.includes("Creation symbolic link is not allowed")) return false;
    process.exit(code ?? 1);
  }
  return true;
}

if (command === "build" && !process.argv.includes("--skip-frontend")) {
  await run("node_modules/typescript/bin/tsc", ["-b"]);
  await run("node_modules/vite/bin/vite.js", ["build"]);
}

const args = command === "build"
  ? ["android", "build", "--debug", "--apk", "--target", "aarch64", "--ci"]
  : command === "init" ? ["android", "init", "--ci"] : ["android", "dev"];
const built = await run("node_modules/@tauri-apps/cli/tauri.js", args, command === "build");
if (!built) {
  // Cargo has completed successfully; only the Windows JNI symlink failed.
  // Package exactly that library using Gradle without rerunning the symlink task.
  const androidProject = path.join(root, "src-tauri", "gen", "android");
  const jniDirectory = path.join(androidProject, "app", "src", "main", "jniLibs", "arm64-v8a");
  await mkdir(jniDirectory, { recursive: true });
  await copyFile(path.join(root, "src-tauri", "target", "aarch64-linux-android", "debug", "liblocal_epub_reader_lib.so"), path.join(jniDirectory, "liblocal_epub_reader_lib.so"));
  const localGradle = local("gradle-dist", "gradle-8.14.3", "lib");
  const gradle = spawn(path.join(env.JAVA_HOME, "bin", "java.exe"), [
    "-classpath", existsSync(localGradle) ? path.join(localGradle, "*") : path.join(androidProject, "gradle", "wrapper", "gradle-wrapper.jar"),
    existsSync(localGradle) ? "org.gradle.launcher.GradleMain" : "org.gradle.wrapper.GradleWrapperMain", ":app:assembleArm64Debug", "-x", ":app:rustBuildArm64Debug", "--no-daemon",
  ], { cwd: androidProject, env, stdio: "inherit", windowsHide: true });
  const [code] = await once(gradle, "exit");
  if (code !== 0) process.exit(code ?? 1);
}

if (command === "build") {
  const output = path.join(root, "src-tauri", "gen", "android", "app", "build", "outputs", "apk");
  async function findApks(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
      ? findApks(path.join(dir, entry.name))
      : entry.name.endsWith(".apk") ? [path.join(dir, entry.name)] : []));
    return nested.flat();
  }
  const apks = await findApks(output);
  const apk = apks.find((file) => /arm64.*debug|universal.*debug/i.test(file)) ?? apks.find((file) => /debug/i.test(file));
  if (!apk) throw new Error(`No debug APK found in ${output}`);
  const destination = path.join(root, "release", "Local EPUB Reader.apk");
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(apk, destination);
  console.log(`Android APK: ${destination}`);
}
