import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  BackgroundImage,
  Bookmark,
  BookReaderAppearance,
  BookRecord,
  ReaderPreferences,
  ReadingState,
} from "../domain/models";

export interface ReaderDbSchema extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
  };
  readingStates: {
    key: string;
    value: ReadingState;
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: { bookId: string };
  };
  preferences: {
    key: "global";
    value: ReaderPreferences;
  };
  bookReaderAppearances: {
    key: string;
    value: BookReaderAppearance;
  };
  backgroundImages: {
    key: string;
    value: BackgroundImage;
    indexes: { bookId: string };
  };
}

const DATABASE_NAME = "local-epub-reader";
const DATABASE_VERSION = 2;

export function openReaderDb(): Promise<IDBPDatabase<ReaderDbSchema>> {
  return openDB<ReaderDbSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("readingStates")) {
        db.createObjectStore("readingStates", { keyPath: "bookId" });
      }

      if (!db.objectStoreNames.contains("bookmarks")) {
        const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
        bookmarks.createIndex("bookId", "bookId");
      }

      if (!db.objectStoreNames.contains("preferences")) {
        db.createObjectStore("preferences", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("bookReaderAppearances")) {
        db.createObjectStore("bookReaderAppearances", { keyPath: "bookId" });
      }

      if (!db.objectStoreNames.contains("backgroundImages")) {
        const backgroundImages = db.createObjectStore("backgroundImages", {
          keyPath: "id",
        });
        backgroundImages.createIndex("bookId", "bookId");
      }
    },
  });
}
