import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { BookmarkPanel } from "./BookmarkPanel";

it("shows the EPUB chapter title and its page location", () => {
  render(<BookmarkPanel
    bookmarks={[{ id: "mark-1", bookId: "book-1", cfi: "epubcfi(/6/4)", chapterLabel: "雨夜来信", chapterPage: 3, chapterPageTotal: 12, excerpt: "", createdAt: 1 }]}
    currentCfi="epubcfi(/6/4)"
    onCreate={vi.fn()}
    onJump={vi.fn()}
    onDelete={vi.fn()}
  />);

  expect(screen.getByText("雨夜来信 · 第 3 / 12 页")).toBeInTheDocument();
});

it("allows a saved bookmark name to replace the default chapter label", () => {
  const onRename = vi.fn();
  render(<BookmarkPanel
    bookmarks={[{ id: "mark-1", bookId: "book-1", cfi: "epubcfi(/6/4)", chapterLabel: "雨夜来信", chapterPage: 3, chapterPageTotal: 12, excerpt: "", createdAt: 1 }]}
    currentCfi="epubcfi(/6/4)"
    onCreate={vi.fn()}
    onJump={vi.fn()}
    onDelete={vi.fn()}
    onRename={onRename}
  />);

  fireEvent.click(screen.getByRole("button", { name: "重命名书签 雨夜来信" }));
  fireEvent.change(screen.getByLabelText("书签名称"), { target: { value: "重要线索" } });
  fireEvent.click(screen.getByRole("button", { name: "保存书签名称" }));
  expect(onRename).toHaveBeenCalledWith("mark-1", "重要线索");
});
