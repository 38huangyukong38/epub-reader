# Tauri Portable Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing EPUB reader as a Windows x64 Tauri portable executable while preserving every reader feature and adding fixed-layout mouse pagination.

**Architecture:** Tauri owns only the native window and loads the existing Vite frontend in WebView2. The React app continues to own EPUB import, rendering, IndexedDB state, settings, bookmarks, backgrounds, and error messages. A focused reader interaction helper binds mouse events to each epub.js iframe and a confirmation modal mediates TOC navigation.

**Tech Stack:** React 18, TypeScript, Vite, epub.js, IndexedDB, Vitest, Playwright, Tauri 2, Rust, Windows WebView2.

---

### Task 1: Add the Tauri desktop shell

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add Tauri npm packages locally**

Run:

```powershell
npm.cmd install -D @tauri-apps/cli@^2
npm.cmd install @tauri-apps/api@^2
```

Expected: both packages are added to `package.json` and `node_modules`; no global npm installation is used.

- [ ] **Step 2: Create the minimal Rust shell**

Create `src-tauri/Cargo.toml` with a Tauri 2 package and `tauri-build` build dependency, `src-tauri/build.rs` containing `tauri_build::build()`, and `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run local EPUB reader");
}
```

Create `src-tauri/tauri.conf.json` with `productName` set to `Local EPUB Reader`, `identifier` set to `com.localepubreader.app`, `build.devUrl` set to `http://127.0.0.1:5173`, `build.frontendDist` set to `../dist`, one `main` window at 1280 by 840 with a minimum size of 1024 by 680, and no enabled bundle target. Create `src-tauri/capabilities/default.json` granting only `core:default` to `main`.

- [ ] **Step 3: Add local desktop scripts**

Add these scripts to `package.json`:

```json
"tauri:dev": "tauri dev",
"tauri:build": "npm run build && tauri build --no-bundle"
```

Add a README desktop section that states the Windows x64 requirement, system WebView2 prerequisite, commands, the portable executable path `src-tauri/target/release/local-epub-reader.exe`, and that it does not create file associations or registry entries.

- [ ] **Step 4: Verify the shell compiles**

Run:

```powershell
$env:CARGO_HOME = "$PWD\tools\rust\cargo"
$env:RUSTUP_HOME = "$PWD\tools\rust\rustup"
npm.cmd run tauri:build
```

Expected: Vite completes, Cargo completes, and a Windows x64 executable is present below `src-tauri/target/release/`.

### Task 2: Isolate mouse pagination behavior

**Files:**
- Create: `src/services/readerMouseNavigation.ts`
- Create: `src/services/readerMouseNavigation.test.ts`
- Modify: `src/services/epubReaderService.ts`
- Modify: `src/services/epubReaderService.test.ts`

- [ ] **Step 1: Write failing mouse-navigation tests**

Create tests for `bindReaderMouseNavigation(target, { previous, next })` that dispatch a left `click`, a right `contextmenu`, a positive `wheel`, and a negative `wheel`. Assert left click and positive wheel call `next`, right click and negative wheel call `previous`, and right click/wheel are default-prevented. Assert the cleanup function removes all listeners.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm.cmd test -- src/services/readerMouseNavigation.test.ts
```

Expected: FAIL because `readerMouseNavigation.ts` does not exist.

- [ ] **Step 3: Implement the focused helper**

Implement `bindReaderMouseNavigation` without timers or shared state:

```ts
export function bindReaderMouseNavigation(
  target: EventTarget,
  actions: { previous(): void; next(): void },
) {
  const onClick = () => actions.next();
  const onContextMenu = (event: Event) => { event.preventDefault(); actions.previous(); };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY > 0) actions.next();
    if (event.deltaY < 0) actions.previous();
  };
  target.addEventListener("click", onClick);
  target.addEventListener("contextmenu", onContextMenu);
  target.addEventListener("wheel", onWheel, { passive: false });
  return () => { /* remove the exact three listeners */ };
}
```

Extend the epub.js rendition type with a `getContents()` method returning iframe content documents. Bind the helper to the outer render target and every rendition content document after `display`; remove all callbacks from `close()`.

- [ ] **Step 4: Verify focused reader behavior**

Run:

```powershell
npm.cmd test -- src/services/readerMouseNavigation.test.ts src/services/epubReaderService.test.ts
```

Expected: PASS, including service close cleanup coverage.

### Task 3: Confirm chapter navigation before display

**Files:**
- Create: `src/components/common/ConfirmDialog.tsx`
- Create: `src/components/common/ConfirmDialog.test.tsx`
- Modify: `src/components/reader/TableOfContents.tsx`
- Modify: `src/components/reader/TableOfContents.test.tsx`
- Modify: `src/components/reader/ReaderPage.tsx`
- Modify: `src/components/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write failing dialog and TOC tests**

Test that a dialog exposes the supplied title, cancel label, and confirm label; its cancel button calls `onCancel` and confirm calls `onConfirm`. Update the TOC test to click an item and assert `onSelect` was not called before confirmation, then confirm and assert it was called with the selected href.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm.cmd test -- src/components/common/ConfirmDialog.test.tsx src/components/reader/TableOfContents.test.tsx
```

Expected: FAIL because no confirmation dialog is rendered before `onSelect`.

- [ ] **Step 3: Implement confirmation state at the reader-page boundary**

Implement an accessible `role="dialog"` confirmation component. In `ReaderPage`, store the selected TOC `{ href, label }`, pass an `onSelectRequest` callback to `TableOfContents`, and only call `reader.display(href)` from the dialog confirm action. Escape and cancel close the dialog without calling display.

- [ ] **Step 4: Verify chapter navigation behavior**

Run:

```powershell
npm.cmd test -- src/components/common/ConfirmDialog.test.tsx src/components/reader/TableOfContents.test.tsx src/components/reader/ReaderPage.test.tsx
```

Expected: PASS; cancel does not navigate and confirmation does.

### Task 4: Make the desktop reader layout scroll-safe

**Files:**
- Modify: `src/components/reader/ReaderPage.tsx`
- Modify: `src/components/reader/BookmarkPanel.tsx`
- Modify: `src/components/reader/ReaderSettings.tsx`
- Modify: `src/components/reader/BackgroundSettings.tsx`
- Modify: `src/styles/reader.css`
- Modify: `src/components/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write failing layout structure tests**

Extend `ReaderPage.test.tsx` to assert that the reader has named `reader-page__sidebar-scroll`, `reader-page__toc`, `reader-page__bookmarks`, and `reader-page__settings` regions. Assert the render target remains inside `reader-page__content`, not any scrollable sidebar region.

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test -- src/components/reader/ReaderPage.test.tsx
```

Expected: FAIL because the current sidebar is one combined scroll container.

- [ ] **Step 3: Implement fixed grid and independent left scroll regions**

Refactor the sidebar into a fixed-height grid with a title, a flexible `reader-page__toc` block, and independent max-height blocks for bookmarks, settings, and background controls. Apply `overflow: auto` only to those blocks. Set `height: 100vh`, `overflow: hidden`, and fixed grid rows on `.reader-page`; keep `.reader-page__content` and `.reader-render-target` at `min-height: 0` with `overflow: hidden`. Ensure `.reader-background-image` and overlay retain the same bounds as the render target.

- [ ] **Step 4: Verify layout component tests**

Run:

```powershell
npm.cmd test -- src/components/reader/ReaderPage.test.tsx src/components/reader/BackgroundSettings.test.tsx src/components/reader/ReaderSettings.test.tsx
```

Expected: PASS.

### Task 5: Verify desktop and web regressions

**Files:**
- Modify: `e2e/reader.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Extend the browser E2E test**

After opening `test-book.epub`, assert the reader iframe is visible, click the TOC item, assert the confirmation dialog appears, cancel it, and assert the reader remains visible. Confirm the dialog and assert the iframe remains visible. Do not test EPUB pagination by visual page text because the fixture has a single chapter.

- [ ] **Step 2: Run the new E2E test and confirm it fails**

Run:

```powershell
npm.cmd run test:e2e
```

Expected: FAIL before the confirmation UI is implemented.

- [ ] **Step 3: Run all validations after implementation**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
$env:CARGO_HOME = "$PWD\tools\rust\cargo"
$env:RUSTUP_HOME = "$PWD\tools\rust\rustup"
npm.cmd run tauri:build
```

Expected: all commands exit 0; E2E exits normally; the Tauri executable exists and retains the current browser reader functionality when manually opened.
