import type { IDBPDatabase } from "idb";
import type {
  BackgroundImage,
  Bookmark,
  BookReaderAppearance,
  BookRecord,
  ReaderPreferences,
  ReadingState,
} from "../domain/models";
import { openReaderDb, type ReaderDbSchema } from "../db/readerDb";

export interface LibraryItem {
  book: BookRecord;
  state?: ReadingState;
}

export interface ReaderBundle {
  state?: ReadingState;
  bookmarks: Bookmark[];
  appearance?: BookReaderAppearance;
  image?: BackgroundImage;
}

export interface ReaderRepository {
  saveBook(book: BookRecord): Promise<void>;
  listLibrary(): Promise<LibraryItem[]>;
  getBook(bookId: string): Promise<BookRecord | undefined>;
  saveReadingState(state: ReadingState): Promise<void>;
  saveBookmark(bookmark: Bookmark): Promise<void>;
  deleteBookmark(bookmarkId: string): Promise<void>;
  renameBookmark(bookmarkId: string, name: string): Promise<void>;
  getBookmarks(bookId: string): Promise<Bookmark[]>;
  getPreferences(): Promise<ReaderPreferences | undefined>;
  savePreferences(value: ReaderPreferences): Promise<void>;
  saveLibraryOrder(bookIds: string[]): Promise<void>;
  getReaderBundle(bookId: string): Promise<ReaderBundle>;
  replaceBackground(image: BackgroundImage, appearance: BookReaderAppearance): Promise<void>;
  clearBackground(bookId: string): Promise<void>;
  deleteBook(bookId: string): Promise<void>;
}

type DatabaseFactory = () => Promise<IDBPDatabase<ReaderDbSchema>>;

export function createReaderRepository(
  databaseFactory: DatabaseFactory = openReaderDb,
): ReaderRepository {
  async function withDb<T>(operation: (db: IDBPDatabase<ReaderDbSchema>) => Promise<T>) {
    const db = await databaseFactory();
    try {
      return await operation(db);
    } finally {
      db.close();
    }
  }

  return {
    saveBook: (book) => withDb(async (db) => {
      await db.put("books", book);
    }),

    listLibrary: () => withDb(async (db) => {
      const transaction = db.transaction(["books", "readingStates"]);
      const books = await transaction.objectStore("books").getAll();
      const states = await transaction.objectStore("readingStates").getAll();
      await transaction.done;
      const stateByBookId = new Map(states.map((state) => [state.bookId, state]));

      return books
        .map((book) => ({ book, state: stateByBookId.get(book.id) }))
        .sort((left, right) => {
          if (left.book.sortOrder !== undefined || right.book.sortOrder !== undefined) {
            return (left.book.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.book.sortOrder ?? Number.MAX_SAFE_INTEGER);
          }
          const rightTime = right.state?.updatedAt ?? right.book.importedAt;
          const leftTime = left.state?.updatedAt ?? left.book.importedAt;
          return rightTime - leftTime;
        });
    }),

    getBook: (bookId) => withDb((db) => db.get("books", bookId)),

    saveReadingState: (state) => withDb(async (db) => {
      await db.put("readingStates", state);
    }),

    saveBookmark: (bookmark) => withDb(async (db) => {
      const transaction = db.transaction("bookmarks", "readwrite");
      const store = transaction.objectStore("bookmarks");
      const existing = await store.index("bookId").getAll(bookmark.bookId);
      if (!existing.some((item) => item.cfi === bookmark.cfi)) {
        await store.put(bookmark);
      }
      await transaction.done;
    }),

    deleteBookmark: (bookmarkId) => withDb(async (db) => {
      await db.delete("bookmarks", bookmarkId);
    }),

    renameBookmark: (bookmarkId, name) => withDb(async (db) => {
      const bookmark = await db.get("bookmarks", bookmarkId);
      if (!bookmark) return;
      await db.put("bookmarks", { ...bookmark, name: name.trim() || undefined });
    }),

    getBookmarks: (bookId) => withDb(async (db) => {
      const bookmarks = await db.getAllFromIndex("bookmarks", "bookId", bookId);
      return bookmarks.sort((left, right) => left.createdAt - right.createdAt);
    }),

    getPreferences: () => withDb((db) => db.get("preferences", "global")),

    savePreferences: (value) => withDb(async (db) => {
      await db.put("preferences", value);
    }),

    saveLibraryOrder: (bookIds) => withDb(async (db) => {
      const transaction = db.transaction("books", "readwrite");
      for (const [sortOrder, id] of bookIds.entries()) {
        const book = await transaction.store.get(id);
        if (book) await transaction.store.put({ ...book, sortOrder });
      }
      await transaction.done;
    }),

    getReaderBundle: (bookId) => withDb(async (db) => {
      const transaction = db.transaction(
        ["readingStates", "bookmarks", "bookReaderAppearances", "backgroundImages"],
        "readonly",
      );
      const stateStore = transaction.objectStore("readingStates");
      const bookmarkStore = transaction.objectStore("bookmarks");
      const appearanceStore = transaction.objectStore("bookReaderAppearances");
      const imageStore = transaction.objectStore("backgroundImages");
      const [state, bookmarks, appearance] = await Promise.all([
        stateStore.get(bookId),
        bookmarkStore.index("bookId").getAll(bookId),
        appearanceStore.get(bookId),
      ]);
      const image = appearance?.backgroundImageId
        ? await imageStore.get(appearance.backgroundImageId)
        : undefined;
      await transaction.done;

      return {
        state,
        bookmarks: bookmarks.sort((left, right) => left.createdAt - right.createdAt),
        appearance,
        image,
      };
    }),

    replaceBackground: (image, appearance) => withDb(async (db) => {
      const transaction = db.transaction(
        ["backgroundImages", "bookReaderAppearances"],
        "readwrite",
      );
      const imageStore = transaction.objectStore("backgroundImages");
      const previousImageKeys = await imageStore.index("bookId").getAllKeys(image.bookId);
      await Promise.all(previousImageKeys.map((key) => imageStore.delete(key)));
      await imageStore.put(image);
      await transaction.objectStore("bookReaderAppearances").put(appearance);
      await transaction.done;
    }),

    clearBackground: (bookId) => withDb(async (db) => {
      const transaction = db.transaction(
        ["backgroundImages", "bookReaderAppearances"],
        "readwrite",
      );
      const imageStore = transaction.objectStore("backgroundImages");
      const imageKeys = await imageStore.index("bookId").getAllKeys(bookId);
      await Promise.all(imageKeys.map((key) => imageStore.delete(key)));
      await transaction.objectStore("bookReaderAppearances").delete(bookId);
      await transaction.done;
    }),

    deleteBook: (bookId) => withDb(async (db) => {
      const transaction = db.transaction(
        ["books", "readingStates", "bookmarks", "bookReaderAppearances", "backgroundImages"],
        "readwrite",
      );
      const bookmarkStore = transaction.objectStore("bookmarks");
      const backgroundStore = transaction.objectStore("backgroundImages");
      const [bookmarkKeys, backgroundKeys] = await Promise.all([
        bookmarkStore.index("bookId").getAllKeys(bookId),
        backgroundStore.index("bookId").getAllKeys(bookId),
      ]);
      await Promise.all([
        transaction.objectStore("books").delete(bookId),
        transaction.objectStore("readingStates").delete(bookId),
        transaction.objectStore("bookReaderAppearances").delete(bookId),
        ...bookmarkKeys.map((key) => bookmarkStore.delete(key)),
        ...backgroundKeys.map((key) => backgroundStore.delete(key)),
      ]);
      await transaction.done;
    }),
  };
}
