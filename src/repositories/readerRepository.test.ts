import { deleteDB, openDB } from "idb";
import type {
  BackgroundImage,
  Bookmark,
  BookReaderAppearance,
  BookRecord,
  ReadingState,
} from "../domain/models";
import { createReaderRepository } from "./readerRepository";

const DATABASE_NAME = "local-epub-reader";

const book = (id: string, importedAt: number): BookRecord => ({
  id,
  title: `Title ${id}`,
  creator: "Author",
  fileBlob: new Blob([id], { type: "application/epub+zip" }),
  importedAt,
  updatedAt: importedAt,
});

const state = (bookId: string, updatedAt: number): ReadingState => ({
  bookId,
  cfi: "epubcfi(/6/2)",
  progression: 0.4,
  chapterLabel: "Chapter 1",
  updatedAt,
});

const bookmark = (
  id: string,
  bookId: string,
  cfi = "epubcfi(/6/4)",
  createdAt = 1,
): Bookmark => ({
  id,
  bookId,
  cfi,
  chapterLabel: "Chapter 1",
  excerpt: "Saved passage",
  createdAt,
});

const appearance = (bookId: string, backgroundImageId?: string): BookReaderAppearance => ({
  bookId,
  backgroundImageId,
  backgroundEnabled: Boolean(backgroundImageId),
  overlayOpacity: 0.55,
});

const image = (id: string, bookId: string): BackgroundImage => ({
  id,
  bookId,
  blob: new Blob([id], { type: "image/png" }),
  mimeType: "image/png",
  createdAt: 1,
});

beforeEach(async () => {
  await deleteDB(DATABASE_NAME);
});

afterEach(async () => {
  await deleteDB(DATABASE_NAME);
});

it("lists books by most recent reading time, then import time", async () => {
  const repository = createReaderRepository();
  await repository.saveBook(book("old", 20));
  await repository.saveBook(book("recent", 10));
  await repository.saveBook(book("unread", 30));
  await repository.saveReadingState(state("old", 40));
  await repository.saveReadingState(state("recent", 50));

  expect((await repository.listLibrary()).map((item) => item.book.id)).toEqual([
    "recent",
    "old",
    "unread",
  ]);
});

it("persists an explicit library order", async () => {
  const repository = createReaderRepository();
  await repository.saveBook(book("first", 1));
  await repository.saveBook(book("second", 2));
  await repository.saveBook(book("third", 3));

  await repository.saveLibraryOrder(["second", "third", "first"]);

  expect((await repository.listLibrary()).map((item) => item.book.id)).toEqual(["second", "third", "first"]);
  expect((await repository.getBook("second"))?.sortOrder).toBe(0);
});

it("renames a bookmark and clears the custom name when blank", async () => {
  const repository = createReaderRepository();
  await repository.saveBookmark(bookmark("mark", "book-a"));

  await repository.renameBookmark("mark", "Important passage");
  expect((await repository.getBookmarks("book-a"))[0].name).toBe("Important passage");

  await repository.renameBookmark("mark", "   ");
  expect((await repository.getBookmarks("book-a"))[0].name).toBeUndefined();
});

it("keeps only one bookmark at a book CFI", async () => {
  const repository = createReaderRepository();
  await repository.saveBook(book("book-a", 1));
  await repository.saveBookmark(bookmark("first", "book-a", undefined, 1));
  await repository.saveBookmark(bookmark("duplicate", "book-a", undefined, 2));
  await repository.saveBookmark(bookmark("different", "book-a", "epubcfi(/6/6)", 3));

  expect((await repository.getBookmarks("book-a")).map((item) => item.id)).toEqual([
    "first",
    "different",
  ]);
});

it("replaces the previous background image for a book", async () => {
  const repository = createReaderRepository();
  await repository.saveBook(book("book-a", 1));
  await repository.replaceBackground(image("old-image", "book-a"), appearance("book-a", "old-image"));
  await repository.replaceBackground(image("new-image", "book-a"), appearance("book-a", "new-image"));

  const bundle = await repository.getReaderBundle("book-a");
  expect(bundle.appearance).toEqual(appearance("book-a", "new-image"));
  expect(bundle.image).toMatchObject({
    id: "new-image",
    bookId: "book-a",
    mimeType: "image/png",
  });
});

it("removes state, bookmarks, appearance, and backgrounds with its book", async () => {
  const repository = createReaderRepository();
  await repository.saveBook(book("book-a", 1));
  await repository.saveReadingState(state("book-a", 2));
  await repository.saveBookmark(bookmark("bookmark-a", "book-a"));
  await repository.replaceBackground(image("image-a", "book-a"), appearance("book-a", "image-a"));

  await repository.deleteBook("book-a");

  expect(await repository.getBook("book-a")).toBeUndefined();
  expect(await repository.getReaderBundle("book-a")).toEqual({
    state: undefined,
    bookmarks: [],
    appearance: undefined,
    image: undefined,
  });
});

it("clears a background without changing reading data", async () => {
  const repository = createReaderRepository();
  await repository.saveBook(book("book-a", 1));
  await repository.saveReadingState(state("book-a", 2));
  await repository.replaceBackground(image("image-a", "book-a"), appearance("book-a", "image-a"));

  await repository.clearBackground("book-a");

  expect(await repository.getReaderBundle("book-a")).toEqual({
    state: state("book-a", 2),
    bookmarks: [],
    appearance: undefined,
    image: undefined,
  });
});

it("upgrades legacy reader data without removing books", async () => {
  const legacy = await openDB(DATABASE_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("books", { keyPath: "id" });
      db.createObjectStore("readingStates", { keyPath: "bookId" });
      const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
      bookmarks.createIndex("bookId", "bookId");
      db.createObjectStore("preferences", { keyPath: "key" });
    },
  });
  await legacy.put("books", book("legacy", 1));
  legacy.close();

  const repository = createReaderRepository();

  expect((await repository.listLibrary()).map((item) => item.book.id)).toEqual(["legacy"]);
  await expect(repository.replaceBackground(image("background", "legacy"), appearance("legacy", "background"))).resolves.toBeUndefined();
});

it("persists optional chapter pagination with a bookmark", async () => {
  const repository = createReaderRepository();
  const positionedBookmark = { ...bookmark("mark", "book-a"), chapterPage: 2, chapterPageTotal: 14 };

  await repository.saveBookmark(positionedBookmark);

  await expect(repository.getBookmarks("book-a")).resolves.toEqual([positionedBookmark]);
});
