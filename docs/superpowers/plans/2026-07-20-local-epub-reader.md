# 本地 EPUB 小说阅读器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可在桌面 Chromium 浏览器离线使用的本地 EPUB 阅读器，持久化书架、进度、书签、阅读偏好及每本书的图片背景。

**Architecture:** React UI 通过 hook 调用 repository 与 epub.js reader service；IndexedDB 保存 EPUB Blob 和全部应用状态。epub.js 渲染与定位 EPUB，阅读器壳提供固定目录栏、工具栏、正文和独立背景图层。

**Tech Stack:** React 18、TypeScript、Vite、epub.js、idb、Vitest、React Testing Library、fake-indexeddb、Playwright。

---

## 目标文件结构

| 路径 | 职责 |
| --- | --- |
| `src/domain/models.ts` | 持久化记录、默认设置与 MIME 约束。 |
| `src/db/readerDb.ts` | IndexedDB store 和索引。 |
| `src/repositories/readerRepository.ts` | 数据读取、保存、级联删除。 |
| `src/services/epubImportService.ts` | EPUB 校验、元数据和封面提取。 |
| `src/services/epubReaderService.ts` | epub.js 生命周期、分页、目录、CFI、样式注入。 |
| `src/services/backgroundImageService.ts` | 背景图验证、替换、开关、蒙层和恢复默认。 |
| `src/hooks/useLibrary.ts`、`src/hooks/useReader.ts` | 服务状态、去抖阅读位置保存。 |
| `src/components/library/*` | 书架、导入、书籍卡片和删除确认。 |
| `src/components/reader/*` | 目录、工具栏、正文、书签、设置与背景设置。 |
| `src/test/*`、`e2e/*` | 自动化验证和真实 EPUB 场景。 |

## 实施约定

- 每项先写失败测试，运行确认失败，再实现最小行为，运行通过后提交。
- 使用原始 EPUB Blob，不保存用户文件句柄；所有 `bookId` 关联数据与书籍一起删除。
- CFI 是位置恢复的唯一权威值，`progression` 只显示进度。
- 背景图片仅接受 JPEG、PNG、WebP，非空且不超过 10 MB；每本书仅保留当前图片。

### Task 1: 初始化项目、测试和构建脚本

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`
- Create: `src/test/setup.ts`, `src/App.test.tsx`

- [ ] **Step 1: 写入口失败测试。**

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

it("renders the local library heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "本地书架" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL，因为 `App` 尚未存在。

- [ ] **Step 3: 创建 Vite 配置与最小入口。**

`package.json` 的 scripts 必须为：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src --max-warnings=0"
  }
}
```

安装 `react`、`react-dom`、`epubjs`、`idb`，以及 `vite`、`typescript`、`vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`fake-indexeddb`、`@playwright/test`、`@types/epubjs`。在 Vitest 配置 `environment: "jsdom"` 和 `setupFiles: ["./src/test/setup.ts"]`。`setup.ts` 导入 `@testing-library/jest-dom/vitest` 和 `fake-indexeddb/auto`。

```tsx
// src/App.tsx
export default function App() {
  return <main><h1>本地书架</h1></main>;
}
```

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/App.test.tsx && npm run build`

Expected: PASS，构建产物生成。

```powershell
git init
git add package.json vite.config.ts tsconfig.json tsconfig.app.json index.html src
git commit -m "chore: scaffold epub reader application"
```

### Task 2: 定义领域模型与 IndexedDB

**Files:**
- Create: `src/domain/models.ts`, `src/domain/models.test.ts`
- Create: `src/db/readerDb.ts`, `src/db/readerDb.test.ts`

- [ ] **Step 1: 写 schema 与默认值失败测试。**

```ts
it("uses a readable default overlay", () => {
  expect(DEFAULT_APPEARANCE).toEqual({ backgroundEnabled: false, overlayOpacity: 0.55 });
});

it("creates all reader stores", async () => {
  const db = await openReaderDb();
  expect([...db.objectStoreNames]).toEqual(expect.arrayContaining([
    "books", "readingStates", "bookmarks", "preferences", "bookReaderAppearances", "backgroundImages",
  ]));
  db.close();
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/domain/models.test.ts src/db/readerDb.test.ts`

Expected: FAIL，两个模块尚未存在。

- [ ] **Step 3: 实现所有持久化类型与 schema。**

```ts
export interface BookRecord { id: string; title: string; creator: string; language?: string; coverBlob?: Blob; fileBlob: Blob; importedAt: number; updatedAt: number; }
export interface ReadingState { bookId: string; cfi: string; progression: number; chapterLabel: string; updatedAt: number; }
export interface Bookmark { id: string; bookId: string; cfi: string; chapterLabel: string; excerpt: string; createdAt: number; }
export interface ReaderPreferences { key: "global"; fontFamily: string; fontSize: number; lineHeight: number; theme: "light" | "dark" | "sepia"; sidebarVisible: boolean; }
export interface BookReaderAppearance { bookId: string; backgroundImageId?: string; backgroundEnabled: boolean; overlayOpacity: number; }
export interface BackgroundImage { id: string; bookId: string; blob: Blob; mimeType: "image/jpeg" | "image/png" | "image/webp"; createdAt: number; }
export const DEFAULT_APPEARANCE = { backgroundEnabled: false, overlayOpacity: 0.55 } as const;
```

`openReaderDb()` 必须通过 `openDB("local-epub-reader", 1, ...)` 创建上述六个 stores，`bookmarks` 和 `backgroundImages` 都应创建 `bookId` 索引。

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/domain/models.test.ts src/db/readerDb.test.ts`

Expected: PASS。

```powershell
git add src/domain src/db
git commit -m "feat: define reader persistence schema"
```

### Task 3: 完成 repository 和级联清理

**Files:**
- Create: `src/repositories/readerRepository.ts`, `src/repositories/readerRepository.test.ts`

- [ ] **Step 1: 写保存、排序、去重和删除失败测试。**

```ts
it("lists books by most recent reading time", async () => {
  await repository.saveBook(book("old", 1));
  await repository.saveBook(book("new", 2));
  await repository.saveReadingState(state("old", 10));
  await repository.saveReadingState(state("new", 20));
  expect((await repository.listLibrary()).map((item) => item.book.id)).toEqual(["new", "old"]);
});

it("removes state bookmarks and backgrounds with its book", async () => {
  await seedBookWithStateBookmarkAndBackground(repository, "book-a");
  await repository.deleteBook("book-a");
  expect(await repository.getReaderBundle("book-a")).toEqual({ state: undefined, bookmarks: [], appearance: undefined, image: undefined });
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/repositories/readerRepository.test.ts`

Expected: FAIL，repository 不存在。

- [ ] **Step 3: 实现精确的 repository 接口。**

```ts
export interface ReaderRepository {
  saveBook(book: BookRecord): Promise<void>;
  listLibrary(): Promise<Array<{ book: BookRecord; state?: ReadingState }>>;
  getBook(bookId: string): Promise<BookRecord | undefined>;
  saveReadingState(state: ReadingState): Promise<void>;
  saveBookmark(bookmark: Bookmark): Promise<void>;
  deleteBookmark(bookmarkId: string): Promise<void>;
  getBookmarks(bookId: string): Promise<Bookmark[]>;
  getPreferences(): Promise<ReaderPreferences | undefined>;
  savePreferences(value: ReaderPreferences): Promise<void>;
  getReaderBundle(bookId: string): Promise<{ state?: ReadingState; bookmarks: Bookmark[]; appearance?: BookReaderAppearance; image?: BackgroundImage }>;
  replaceBackground(image: BackgroundImage, appearance: BookReaderAppearance): Promise<void>;
  clearBackground(bookId: string): Promise<void>;
  deleteBook(bookId: string): Promise<void>;
}
```

`saveBookmark` 必须通过 `bookId` 索引检查相同 CFI 并拒绝重复。`deleteBook` 用单个 `readwrite` transaction 删除书籍、`readingStates`、该书全部书签、外观记录和全部背景 Blob。`listLibrary` 先按 `state.updatedAt` 降序，再按 `book.importedAt` 降序。

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/repositories/readerRepository.test.ts`

Expected: PASS。

```powershell
git add src/repositories
git commit -m "feat: persist library reader state and backgrounds"
```

### Task 4: 解析 EPUB 并实现书架

**Files:**
- Create: `src/lib/id.ts`, `src/services/epubImportService.ts`, `src/services/epubImportService.test.ts`
- Create: `src/hooks/useLibrary.ts`
- Create: `src/components/library/LibraryPage.tsx`, `src/components/library/BookCard.tsx`, `src/components/library/ImportButton.tsx`, `src/components/library/LibraryPage.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/styles/library.css`

- [ ] **Step 1: 写导入和书架失败测试。**

```tsx
it("rejects non-epub files without changing the library", async () => {
  await expect(importer.importFile(new File(["x"], "book.txt", { type: "text/plain" }))).rejects.toThrow("请选择 EPUB 文件");
});

it("shows an import action for an empty library", () => {
  render(<LibraryPage library={[]} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: "导入 EPUB" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/services/epubImportService.test.ts src/components/library/LibraryPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现导入服务和 UI。**

`isEpubFile` 仅接受 `.epub` 扩展名或 `application/epub+zip` MIME。生产解析器以 `ePub(await file.arrayBuffer())` 获取 `loaded.metadata` 和可选封面 Blob，使用完立即销毁 EPUB 实例。标题缺失回退至文件名，作者缺失回退至“未知作者”，ID 用 `crypto.randomUUID()`。

`useLibrary` 暴露 `{ items, loading, error, importFiles, removeBook }`；一次导入多个文件时每个文件独立处理，失败不清除已导入书籍。`LibraryPage` 显示封面网格、标题、作者、百分比和最近阅读；没有封面时用标题文本封面。删除操作必须先执行：

```ts
window.confirm("删除后将移除这本书的阅读记录、书签和背景图。继续吗？")
```

`App` 以 `activeBookId: string | null` 在书架和阅读器之间切换。

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/services/epubImportService.test.ts src/components/library/LibraryPage.test.tsx && npm run build`

Expected: PASS。

```powershell
git add src/lib src/services/epubImportService.ts src/services/epubImportService.test.ts src/hooks/useLibrary.ts src/components/library src/App.tsx src/styles/library.css
git commit -m "feat: import and display local epub books"
```

### Task 5: 实现 epub.js 渲染、目录和进度恢复

**Files:**
- Create: `src/services/epubReaderService.ts`, `src/services/epubReaderService.test.ts`
- Create: `src/hooks/useReader.ts`
- Create: `src/components/reader/ReaderPage.tsx`, `src/components/reader/TableOfContents.tsx`, `src/components/reader/ReaderToolbar.tsx`, `src/components/reader/ReaderPage.test.tsx`
- Create: `src/styles/reader.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: 写渲染、目录和按键失败测试。**

```ts
it("restores the saved cfi and reports a relocation", async () => {
  await reader.open(book, target, "epubcfi(/6/2)", onLocation);
  expect(fakeRendition.display).toHaveBeenCalledWith("epubcfi(/6/2)");
  fakeRendition.emitRelocated({ cfi: "epubcfi(/6/4)", progression: 0.3, chapterLabel: "第一章" });
  expect(onLocation).toHaveBeenCalledWith({ cfi: "epubcfi(/6/4)", progression: 0.3, chapterLabel: "第一章" });
});
```

```tsx
it("uses PageDown to move to the next page", () => {
  render(<ReaderPage {...props} />);
  fireEvent.keyDown(window, { key: "PageDown" });
  expect(props.reader.next).toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/services/epubReaderService.test.ts src/components/reader/ReaderPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现 reader service 与阅读器布局。**

```ts
export interface ReaderLocation { cfi: string; progression: number; chapterLabel: string; }
export interface EpubReaderService {
  open(book: BookRecord, target: HTMLElement, initialCfi: string | undefined, onLocation: (value: ReaderLocation) => void): Promise<void>;
  previous(): Promise<void>; next(): Promise<void>; display(target: string): Promise<void>;
  getNavigation(): Promise<Array<{ label: string; href: string; subitems: unknown[] }>>;
  getCurrentCfi(): string | undefined; applyPreferences(value: ReaderPreferences, appearance: BookReaderAppearance): Promise<void>; close(): Promise<void>;
}
```

`open` 以 `book.fileBlob` 创建 epub.js Book 和 `renderTo(target, { width: "100%", height: "100%", flow: "paginated" })`；监听 relocated；CFI 不存在或显示失败时回退 `display()`。`useReader` 在 relocation 后 500 ms 去抖保存 `ReadingState`，卸载时立即写最后 CFI。`ReaderPage` 是桌面左侧固定 `aside` 和中间正文区域；点击目录调用 `display(href)`，当前章节高亮。仅当事件目标不是输入控件时，`ArrowLeft/PageUp` 调 previous，`ArrowRight/PageDown/Space` 调 next，`Esc` 关闭设置。`close` 必须销毁 rendition、Book 和监听器。

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/services/epubReaderService.test.ts src/components/reader/ReaderPage.test.tsx && npm run build`

Expected: PASS。

```powershell
git add src/services/epubReaderService.ts src/services/epubReaderService.test.ts src/hooks/useReader.ts src/components/reader src/styles/reader.css src/App.tsx
git commit -m "feat: render epub reading experience"
```

### Task 6: 增加书签和全局阅读设置

**Files:**
- Create: `src/components/reader/BookmarkPanel.tsx`, `src/components/reader/ReaderSettings.tsx`, `src/components/reader/ReaderSettings.test.tsx`
- Modify: `src/hooks/useReader.ts`, `src/services/epubReaderService.ts`, `src/styles/reader.css`

- [ ] **Step 1: 写设置和书签失败测试。**

```tsx
it("emits a changed font size immediately", async () => {
  render(<ReaderSettings preferences={defaults} onPreferencesChange={onChange} />);
  await userEvent.selectOptions(screen.getByLabelText("字号"), "22");
  expect(onChange).toHaveBeenCalledWith({ ...defaults, fontSize: 22 });
});

it("adds a bookmark at the current cfi", async () => {
  render(<BookmarkPanel bookmarks={[]} currentCfi="epubcfi(/6/4)" onCreate={onCreate} onJump={vi.fn()} onDelete={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "添加书签" }));
  expect(onCreate).toHaveBeenCalledWith("epubcfi(/6/4)");
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/components/reader/ReaderSettings.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现偏好与书签。**

默认偏好是 `{ key: "global", fontFamily: "system-ui", fontSize: 18, lineHeight: 1.7, theme: "light", sidebarVisible: true }`。设置变更立即 `savePreferences` 并经 `rendition.themes.override` 应用字体、字号、行高、文字色和浅色/深色/护眼主题。书签保存当前 CFI、章节名、正文开头最多 120 字符；点击书签调用 `display(cfi)`；同 CFI 由 repository 去重。

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/components/reader/ReaderSettings.test.tsx && npm run build`

Expected: PASS。

```powershell
git add src/components/reader/BookmarkPanel.tsx src/components/reader/ReaderSettings.tsx src/components/reader/ReaderSettings.test.tsx src/hooks/useReader.ts src/services/epubReaderService.ts src/styles/reader.css
git commit -m "feat: persist bookmarks and reader settings"
```

### Task 7: 支持每本书独立图片背景

**Files:**
- Create: `src/services/backgroundImageService.ts`, `src/services/backgroundImageService.test.ts`
- Create: `src/components/reader/BackgroundSettings.tsx`, `src/components/reader/BackgroundSettings.test.tsx`
- Modify: `src/hooks/useReader.ts`, `src/components/reader/ReaderPage.tsx`, `src/services/epubReaderService.ts`, `src/styles/reader.css`

- [ ] **Step 1: 写背景约束和隔离性失败测试。**

```ts
it.each([
  ["image/jpeg", 10 * 1024 * 1024, true],
  ["image/png", 10 * 1024 * 1024 + 1, false],
  ["image/gif", 100, false],
])("validates background files", (type, size, expected) => {
  expect(isAllowedBackgroundImage(new File([new Uint8Array(size)], "background", { type }))).toBe(expected);
});

it("does not change a different book appearance", async () => {
  await service.setBackground("book-a", pngFile);
  expect((await repository.getReaderBundle("book-a")).appearance?.backgroundEnabled).toBe(true);
  expect((await repository.getReaderBundle("book-b")).appearance).toBeUndefined();
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/services/backgroundImageService.test.ts src/components/reader/BackgroundSettings.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现验证、存储、预览和渲染层。**

```ts
export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
export const ALLOWED_BACKGROUND_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const isAllowedBackgroundImage = (file: File) => ALLOWED_BACKGROUND_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_BACKGROUND_BYTES;
```

`BackgroundImageService.setBackground` 验证文件、生成 ID，并用 `replaceBackground` 保存；`setEnabled` 保留已有 Blob；`setOverlayOpacity` 将值夹在 `0.2..0.9`；`reset` 调用 `clearBackground`。`BackgroundSettings` 的 file input 使用 `accept="image/jpeg,image/png,image/webp"`，滑块标签为“文字蒙层强度”、最小 `0.2`、最大 `0.9`、步长 `0.05`。关闭背景不删除图片，“恢复默认背景”才删除图片和 appearance。

阅读器以绝对定位的 `.reader-background-image`、`.reader-background-overlay`、`.reader-render-target` 三层渲染；图片使用 `URL.createObjectURL`，更换或卸载时 `URL.revokeObjectURL`。`applyPreferences` 注入 `html, body { background: transparent !important; }`，不修改 EPUB Blob；没有或无法加载背景时使用当前主题纯色。

- [ ] **Step 4: 验证并提交。**

Run: `npm test -- src/services/backgroundImageService.test.ts src/components/reader/BackgroundSettings.test.tsx && npm run build`

Expected: PASS。

```powershell
git add src/services/backgroundImageService.ts src/services/backgroundImageService.test.ts src/components/reader/BackgroundSettings.tsx src/components/reader/BackgroundSettings.test.tsx src/hooks/useReader.ts src/components/reader/ReaderPage.tsx src/services/epubReaderService.ts src/styles/reader.css
git commit -m "feat: add per-book reading backgrounds"
```

### Task 8: 处理异常、端到端测试与交付文档

**Files:**
- Create: `src/components/common/StatusMessage.tsx`, `src/components/common/StatusMessage.test.tsx`
- Modify: `src/components/library/LibraryPage.tsx`, `src/components/reader/ReaderPage.tsx`, `src/hooks/useLibrary.ts`, `src/hooks/useReader.ts`
- Create: `playwright.config.ts`, `e2e/reader.spec.ts`, `e2e/fixtures/sample.epub`, `e2e/fixtures/cover.png`
- Create: `README.md`

- [ ] **Step 1: 写错误状态失败测试。**

```tsx
it("shows an accessible import error without clearing books", () => {
  render(<LibraryPage library={[item]} error="无法解析该 EPUB 文件" onOpen={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("无法解析该 EPUB 文件");
  expect(screen.getByRole("button", { name: "打开 海边" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认失败。**

Run: `npm test -- src/components/common/StatusMessage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现降级、E2E 与 README。**

`StatusMessage` 使用 `role="alert"` 显示错误。文件错误显示“请选择 EPUB 文件”“无法解析该 EPUB 文件”“该 EPUB 受保护或无法打开”；IndexedDB 失败显示“浏览器存储空间不足”；CFI 恢复失败显示“无法恢复上次位置，已从开头打开”；背景失败显示“无法保存该背景图，请选择不超过 10 MB 的 JPEG、PNG 或 WebP 图片”。无封面显示文本封面，无目录隐藏章节树但保留翻页。

新增 Playwright 用例：导入样本 EPUB，打开、翻页、添加书签、调整字号、刷新后确认书签和字号仍在；导入两本书，设置不同背景后切换和刷新，确认不串用；删除一本后确认它的背景和书签不再存在。所有图标按钮都必须有可访问名称。

README 必须包含：`npm install`、`npm run dev`、`npm test`、`npm run build`、`npm run test:e2e`；说明仅支持无 DRM EPUB、背景格式和 10 MB 限制，以及清除浏览器站点数据会删除所有本地书籍与状态。

- [ ] **Step 4: 完整验证、手工矩阵与提交。**

Run: `npm test && npm run build && npm run test:e2e`

Expected: 三个命令全部退出码 0。

手工验证正常、无封面、无目录、超长目录与无效 EPUB；三种主题；最小/最大字号与行高；键盘翻页；关闭/重开浏览器后的进度、书签、偏好恢复；两本书背景隔离、关闭背景、恢复默认背景和删除级联清理。

```powershell
git add src/components/common src/components/library/LibraryPage.tsx src/components/reader/ReaderPage.tsx src/hooks e2e playwright.config.ts README.md
git commit -m "test: verify local epub reader workflows"
```

## 计划自检

| 规格要求 | 对应任务 |
| --- | --- |
| 本地 EPUB、书架和离线 Blob 持久化 | 2、3、4 |
| 固定目录栏、分页、CFI 恢复、键盘操作 | 5 |
| 书签、字体、行高和主题 | 6 |
| 每书背景、蒙层、替换、关闭与恢复默认 | 3、7 |
| 无封面、无目录、无效文件和存储失败 | 4、8 |
| 单元、组件、端到端和手工验收 | 1 至 8，重点为 8 |

类型一致性确认：`BookReaderAppearance.backgroundImageId` 对应 `BackgroundImage.id`；`ReadingState.cfi`、`Bookmark.cfi` 和 `ReaderLocation.cfi` 均为字符串；背景 MIME 只允许 JPEG、PNG、WebP。
