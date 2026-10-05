import { deleteDB, type IDBPDatabase } from "idb";
import { openReaderDb, type ReaderDbSchema } from "./readerDb";

const DATABASE_NAME = "local-epub-reader";

let db: IDBPDatabase<ReaderDbSchema> | undefined;

beforeEach(async () => {
  await deleteDB(DATABASE_NAME);
});

afterEach(async () => {
  db?.close();
  db = undefined;
  await deleteDB(DATABASE_NAME);
});

it("creates all reader stores with stable keys", async () => {
  db = await openReaderDb();

  expect([...db.objectStoreNames]).toEqual(
    expect.arrayContaining([
      "books",
      "readingStates",
      "bookmarks",
      "preferences",
      "bookReaderAppearances",
      "backgroundImages",
    ]),
  );
  expect(db.objectStoreNames).toHaveLength(6);

  expect(db.transaction("books").objectStore("books").keyPath).toBe("id");
  expect(db.transaction("readingStates").objectStore("readingStates").keyPath).toBe("bookId");
  expect(db.transaction("bookmarks").objectStore("bookmarks").keyPath).toBe("id");
  expect(db.transaction("preferences").objectStore("preferences").keyPath).toBe("key");
  expect(db.transaction("bookReaderAppearances").objectStore("bookReaderAppearances").keyPath).toBe("bookId");
  expect(db.transaction("backgroundImages").objectStore("backgroundImages").keyPath).toBe("id");
});

it("indexes bookmarks and background images by book", async () => {
  db = await openReaderDb();

  const transaction = db.transaction(["bookmarks", "backgroundImages"]);

  expect([...transaction.objectStore("bookmarks").indexNames]).toContain(
    "bookId",
  );
  expect([
    ...transaction.objectStore("backgroundImages").indexNames,
  ]).toContain("bookId");
  expect(transaction.objectStore("bookmarks").index("bookId").unique).toBe(false);
  expect(transaction.objectStore("backgroundImages").index("bookId").unique).toBe(false);
  await transaction.done;
});
