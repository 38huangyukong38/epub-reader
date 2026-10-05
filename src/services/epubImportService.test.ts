import { vi } from "vitest";
import type { BookRecord } from "../domain/models";
import { createEpubImportService, isEpubFile, type EpubParser } from "./epubImportService";

const saveBook = vi.fn<(book: BookRecord) => Promise<void>>().mockResolvedValue(undefined);

beforeEach(() => {
  saveBook.mockClear();
});

it("recognizes EPUB files by extension or MIME type", () => {
  expect(isEpubFile(new File(["x"], "novel.epub", { type: "text/plain" }))).toBe(true);
  expect(isEpubFile(new File(["x"], "novel", { type: "application/epub+zip" }))).toBe(true);
  expect(isEpubFile(new File(["x"], "novel.txt", { type: "text/plain" }))).toBe(false);
});

it("rejects non-EPUB files without changing the library", async () => {
  const importer = createEpubImportService({ saveBook });

  await expect(
    importer.importFile(new File(["x"], "book.txt", { type: "text/plain" })),
  ).rejects.toThrow("请选择 EPUB 文件");
  expect(saveBook).not.toHaveBeenCalled();
});

it("imports EPUB metadata with fallbacks and releases the parser", async () => {
  const destroy = vi.fn();
  const parser: EpubParser = vi.fn().mockReturnValue({
    loaded: { metadata: Promise.resolve({ title: "", creator: "" }) },
    coverUrl: vi.fn().mockResolvedValue(null),
    destroy,
  });
  const importer = createEpubImportService({ saveBook }, parser, () => "book-id");
  const file = Object.assign(new File(["epub-bytes"], "fallback-title.epub", {
    type: "application/epub+zip",
  }), { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1)) });

  const imported = await importer.importFile(file);

  expect(imported).toMatchObject({
    id: "book-id",
    title: "fallback-title",
    creator: "未知作者",
    fileBlob: file,
  });
  expect(saveBook).toHaveBeenCalledWith(imported);
  expect(destroy).toHaveBeenCalledOnce();
});

it("reuses an older imported book after rename without changing identity or timestamps", async () => {
  const original = new File(["same book bytes"], "old.epub", { type: "application/epub+zip" });
  const existing: BookRecord = { id: "existing", title: "已有图书", creator: "作者", fileBlob: original, importedAt: 10, updatedAt: 20, sortOrder: 3 };
  const parser = vi.fn();
  const importer = createEpubImportService({ saveBook, listLibrary: async () => [{ book: existing }] }, parser);
  const result = await importer.importFile(new File(["same book bytes"], "renamed.epub", { type: "application/epub+zip" }));
  expect(result).toMatchObject({ id: "existing", title: "已有图书", importedAt: 10, updatedAt: 20, sortOrder: 3 });
  expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(parser).not.toHaveBeenCalled();
  expect(result.fileBlob).toBe(original);
});

it("serializes simultaneous imports of identical content into one saved book", async () => {
  const books: BookRecord[] = [];
  const parser = vi.fn().mockImplementation(() => ({ loaded: { metadata: Promise.resolve({ title: "同一本书" }) }, coverUrl: async () => null, destroy: vi.fn() }));
  const importer = createEpubImportService({ saveBook: async (book) => { books.push(book); }, listLibrary: async () => books.map((book) => ({ book })) }, parser);
  const [first, second] = await Promise.all([
    importer.importFile(new File(["identical"], "first.epub")),
    importer.importFile(new File(["identical"], "copy.epub")),
  ]);
  expect(first.id).toBe(second.id);
  expect(books).toHaveLength(1);
  expect(parser).toHaveBeenCalledOnce();
});
