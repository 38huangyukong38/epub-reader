# Reader Layout and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop EPUB reader show a centered chapter dialog, a window-wide background image, current-chapter pagination, and bookmark chapter/page locations while preserving existing local data.

**Architecture:** Extend the reader location emitted by epub.js with its native `displayed.page` and `displayed.total` values. Persist that optional pagination snapshot in bookmarks and render it in the toolbar and bookmark list. Raise the IndexedDB version so existing installs receive the background-image stores without removing books or reader state.

**Tech Stack:** React 19, TypeScript, epub.js, idb, Vitest, Testing Library, Vite, Tauri 2.

---

### Task 1: Upgrade Stored Reader Data Safely

**Files:**
- Modify: `src/db/readerDb.ts`
- Modify: `src/domain/models.ts`
- Modify: `src/repositories/readerRepository.ts`
- Test: `src/repositories/readerRepository.test.ts`

- [ ] **Step 1: Write the failing migration and bookmark-shape tests**

```ts
it("upgrades an existing reader database without removing its books", async () => {
  // Create v1 data containing a book, open with the new schema, then assert
  // the book remains available and both background stores can be opened.
});

it("keeps optional chapter pagination when saving a bookmark", async () => {
  const bookmark = { id: "mark-1", bookId: "book-1", cfi: "epubcfi(/6/2)", chapterLabel: "雨夜来信", excerpt: "摘录", chapterPage: 2, chapterPageTotal: 14, createdAt: 1 };
  await repository.saveBookmark(bookmark);
  expect(await repository.getBookmarks("book-1")).toEqual([bookmark]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- src/repositories/readerRepository.test.ts`

Expected: the v1 database cannot expose background stores and `Bookmark` does not accept the pagination properties.

- [ ] **Step 3: Implement the schema migration and optional bookmark fields**

```ts
export interface Bookmark {
  // Existing fields remain unchanged.
  chapterPage?: number;
  chapterPageTotal?: number;
}

const DATABASE_VERSION = 2;

upgrade(db) {
  if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
  if (!db.objectStoreNames.contains("readingStates")) db.createObjectStore("readingStates", { keyPath: "bookId" });
  if (!db.objectStoreNames.contains("bookmarks")) {
    const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
    bookmarks.createIndex("bookId", "bookId");
  }
  if (!db.objectStoreNames.contains("preferences")) db.createObjectStore("preferences", { keyPath: "key" });
  if (!db.objectStoreNames.contains("bookReaderAppearances")) db.createObjectStore("bookReaderAppearances", { keyPath: "bookId" });
  if (!db.objectStoreNames.contains("backgroundImages")) {
    const images = db.createObjectStore("backgroundImages", { keyPath: "id" });
    images.createIndex("bookId", "bookId");
  }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm.cmd test -- src/repositories/readerRepository.test.ts`

Expected: all repository tests pass, including the migration case.

### Task 2: Propagate Native Chapter Pagination

**Files:**
- Modify: `src/services/epubReaderService.ts`
- Modify: `src/services/epubReaderService.test.ts`
- Modify: `src/hooks/useReader.ts`
- Test: `src/hooks/useReader.test.tsx`

- [ ] **Step 1: Write a failing reader-service test for native displayed pages**

```ts
it("emits the current chapter page from epub.js relocation data", async () => {
  relocated({ start: { cfi: "epubcfi(/6/2)", percentage: 0.25, href: "chapter.xhtml", displayed: { page: 3, total: 12 } } });
  expect(onLocation).toHaveBeenCalledWith(expect.objectContaining({ chapterPage: 3, chapterPageTotal: 12 }));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- src/services/epubReaderService.test.ts`

Expected: `ReaderLocation` does not yet include chapter pagination.

- [ ] **Step 3: Add optional page fields to `ReaderLocation` and parse relocation data**

```ts
const displayed = start?.displayed as { page?: unknown; total?: unknown } | undefined;
const chapterPage = typeof displayed?.page === "number" && displayed.page > 0 ? displayed.page : undefined;
const chapterPageTotal = typeof displayed?.total === "number" && displayed.total > 0 ? displayed.total : undefined;
return { cfi, progression, chapterLabel, href, chapterPage, chapterPageTotal };
```

- [ ] **Step 4: Write a failing hook test for bookmark pagination**

```ts
readerLocation = { cfi: "epubcfi(/6/2)", progression: 0.25, chapterLabel: "雨夜来信", chapterPage: 3, chapterPageTotal: 12 };
result.current.createBookmark("epubcfi(/6/2)");
await waitFor(() => expect(repository.saveBookmark).toHaveBeenCalledWith(expect.objectContaining({ chapterLabel: "雨夜来信", chapterPage: 3, chapterPageTotal: 12 })));
```

- [ ] **Step 5: Run the focused hook test and verify it fails**

Run: `npm.cmd test -- src/hooks/useReader.test.tsx`

Expected: the stored bookmark omits `chapterPage` and `chapterPageTotal`.

- [ ] **Step 6: Copy current location pagination into new bookmarks**

```ts
const bookmark: Bookmark = {
  id: crypto.randomUUID(), bookId: book.id, cfi,
  chapterLabel: location?.chapterLabel ?? "当前位置",
  chapterPage: location?.chapterPage,
  chapterPageTotal: location?.chapterPageTotal,
  excerpt, createdAt: Date.now(),
};
```

- [ ] **Step 7: Run focused service and hook tests**

Run: `npm.cmd test -- src/services/epubReaderService.test.ts src/hooks/useReader.test.tsx`

Expected: all selected tests pass.

### Task 3: Render Pagination and Window-Wide Background

**Files:**
- Modify: `src/components/reader/ReaderToolbar.tsx`
- Modify: `src/components/reader/BookmarkPanel.tsx`
- Modify: `src/components/reader/ReaderPage.tsx`
- Modify: `src/styles/reader.css`
- Test: `src/components/reader/ReaderPage.test.tsx`
- Create: `src/components/reader/BookmarkPanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
render(<ReaderToolbar title="示例" progression={0.1} location={{ chapterPage: 3, chapterPageTotal: 12 }} onBack={fn} onPrevious={fn} onNext={fn} />);
expect(screen.getByText("第 3 / 12 页")).toBeInTheDocument();

render(<BookmarkPanel bookmarks={[{ id: "mark-1", bookId: "book-1", cfi: "cfi", chapterLabel: "雨夜来信", chapterPage: 3, chapterPageTotal: 12, excerpt: "", createdAt: 1 }]} currentCfi="cfi" onCreate={fn} onJump={fn} onDelete={fn} />);
expect(screen.getByText("雨夜来信 · 第 3 / 12 页")).toBeInTheDocument();
```

- [ ] **Step 2: Run focused component tests and verify they fail**

Run: `npm.cmd test -- src/components/reader/ReaderPage.test.tsx src/components/reader/BookmarkPanel.test.tsx`

Expected: the pagination text is absent.

- [ ] **Step 3: Add the toolbar and bookmark presentation**

```tsx
{location?.chapterPage && location.chapterPageTotal && <span className="reader-toolbar__page">第 {location.chapterPage} / {location.chapterPageTotal} 页</span>}

const locationLabel = bookmark.chapterPage && bookmark.chapterPageTotal
  ? `${bookmark.chapterLabel} · 第 ${bookmark.chapterPage} / ${bookmark.chapterPageTotal} 页`
  : bookmark.chapterLabel;
```

- [ ] **Step 4: Move the background layer to the reader-page root**

```tsx
<main className={`reader-page${sidebarVisible ? "" : " reader-page--sidebar-hidden"}`} style={reader.background?.enabled ? { "--reader-background": `url(${reader.background.url})` } as React.CSSProperties : undefined}>
  <div className="reader-page__background-image" aria-hidden="true" />
  {/* toolbar, sidebar, and content */}
</main>
```

```css
.reader-page { position: relative; isolation: isolate; }
.reader-page__background-image { position: absolute; inset: 0; z-index: -1; background: var(--reader-background) center / cover; }
.reader-toolbar, .reader-page__sidebar, .reader-render-target { background-color: rgb(255 255 255 / 78%); }
```

- [ ] **Step 5: Run focused component tests and verify they pass**

Run: `npm.cmd test -- src/components/reader/ReaderPage.test.tsx src/components/reader/BookmarkPanel.test.tsx`

Expected: all selected tests pass.

### Task 4: Center the Chapter Confirmation Dialog and Preserve Specific Errors

**Files:**
- Modify: `src/components/common/ConfirmDialog.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/hooks/useReader.ts`
- Test: `src/components/common/ConfirmDialog.test.tsx`
- Test: `src/hooks/useReader.test.tsx`

- [ ] **Step 1: Write a failing mutation-error test**

```ts
repository.replaceBackground.mockRejectedValue(new DOMException("backgroundImages store is missing", "NotFoundError"));
// Trigger setBackground and assert the displayed error includes the real reason.
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm.cmd test -- src/components/common/ConfirmDialog.test.tsx src/hooks/useReader.test.tsx`

Expected: mutation errors are replaced by the generic storage string.

- [ ] **Step 3: Implement fixed centering and specific error conversion**

```css
.confirm-dialog-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 24px; }
.confirm-dialog { width: min(100%, 420px); }
```

```ts
const message = reason instanceof Error && reason.message
  ? `无法保存阅读器数据：${reason.message}`
  : "无法保存阅读器数据，请重试";
setError(message);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm.cmd test -- src/components/common/ConfirmDialog.test.tsx src/hooks/useReader.test.tsx`

Expected: the selected test passes. The fixed centering is verified in the browser/E2E step because jsdom does not calculate stylesheet layout.

### Task 5: Verify the Web and Portable Desktop Deliverable

**Files:**
- Modify: `e2e/reader.spec.ts`
- Output: `release/Local EPUB Reader.exe`

- [ ] **Step 1: Add an end-to-end assertion for the visible toolbar page label and centered dialog contract**

```ts
await expect(page.getByRole("dialog")).toBeVisible();
await expect(page.getByText("第 1 / 1 页")).toBeVisible();
```

- [ ] **Step 2: Run the full web verification suite**

Run: `npm.cmd test; npm.cmd run lint; npm.cmd run build; npm.cmd run test:e2e; git diff --check`

Expected: tests, lint, production build, E2E suite, and whitespace check complete with exit code 0.

- [ ] **Step 3: Build the portable executable**

Run: `npm.cmd run tauri:build`

Expected: exit code 0 and `release/Local EPUB Reader.exe` exists with a non-zero size.

- [ ] **Step 4: Smoke test the release executable**

Run: start `release/Local EPUB Reader.exe`, open a known EPUB, change font size, resize the window, set a PNG background, create a bookmark, restart the app, and verify the background/bookmark remain available.

Expected: page label updates within the current chapter, the background covers header/sidebar/content, the dialog remains centered, and the bookmark label retains its chapter title and page information.
