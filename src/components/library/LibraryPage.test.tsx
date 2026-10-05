import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { LibraryItem } from "../../repositories/readerRepository";
import { LibraryPage } from "./LibraryPage";

const book: LibraryItem = {
  book: {
    id: "book-a",
    title: "A Local Novel",
    creator: "Author Name",
    fileBlob: new Blob(["book"]),
    importedAt: 1,
    updatedAt: 1,
  },
  state: {
    bookId: "book-a",
    cfi: "epubcfi(/6/2)",
    progression: 0.25,
    chapterLabel: "Chapter 2",
    updatedAt: 2,
  },
};

it("shows an import action for an empty library", () => {
  render(
    <LibraryPage
      items={[]}
      loading={false}
      error={undefined}
      onImport={vi.fn()}
      onOpen={vi.fn()}
      onRemove={vi.fn()}
      onReorder={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "导入 EPUB" })).toBeInTheDocument();
  expect(screen.getByText("书架还是空的")).toBeInTheDocument();
});

it("opens a book and confirms before removal", () => {
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <LibraryPage
      items={[book]}
      loading={false}
      error={undefined}
      onImport={vi.fn()}
      onOpen={onOpen}
      onRemove={onRemove}
      onReorder={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开 A Local Novel" }));
  fireEvent.click(screen.getByRole("button", { name: "删除 A Local Novel" }));

  expect(screen.getByText("Author Name")).toBeInTheDocument();
  expect(screen.getByText("25% · Chapter 2")).toBeInTheDocument();
  expect(onOpen).toHaveBeenCalledWith("book-a");
  expect(confirm).toHaveBeenCalledWith(
    "删除后将移除这本书的阅读记录、书签和背景图。继续吗？",
  );
  expect(onRemove).toHaveBeenCalledWith("book-a");
});

it("rejects dropped files that are not EPUB books", () => {
  const onImport = vi.fn();
  render(<LibraryPage items={[]} loading={false} onImport={onImport} onOpen={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} />);

  fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } });

  expect(screen.getByRole("dialog", { name: "导入失败" })).toHaveTextContent("只能导入 EPUB 文件");
  expect(onImport).not.toHaveBeenCalled();
});

it("imports valid EPUB files dropped from the file system", () => {
  const onImport = vi.fn();
  render(<LibraryPage items={[]} loading={false} onImport={onImport} onOpen={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} />);

  const epub = new File(["book"], "novel.epub", { type: "application/epub+zip" });
  fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [epub] } });

  expect(onImport).toHaveBeenCalledWith([epub]);
});

it("persists the order produced by dragging a book card", () => {
  const onReorder = vi.fn();
  const secondBook: LibraryItem = { ...book, book: { ...book.book, id: "book-b", title: "Second book" } };
  render(<LibraryPage items={[book, secondBook]} loading={false} onImport={vi.fn()} onOpen={vi.fn()} onRemove={vi.fn()} onReorder={onReorder} />);

  const firstCard = screen.getByRole("button", { name: "打开 A Local Novel" }).closest("article")!;
  const secondCard = screen.getByRole("button", { name: "打开 Second book" }).closest("article")!;
  fireEvent.dragStart(firstCard);
  fireEvent.drop(secondCard);

  expect(onReorder).toHaveBeenCalledWith(["book-b", "book-a"]);
});
