import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { ReaderPreferences } from "../../domain/models";
import { BookmarkPanel } from "./BookmarkPanel";
import { ReaderSettings } from "./ReaderSettings";

const preferences: ReaderPreferences = {
  key: "global", fontFamily: "system-ui", fontSize: 18, lineHeight: 1.7, theme: "light", sidebarVisible: true,
};

it("emits a changed font size immediately", () => {
  const onChange = vi.fn();
  render(<ReaderSettings preferences={preferences} onPreferencesChange={onChange} />);
  fireEvent.change(screen.getByLabelText("字号"), { target: { value: "22" } });
  expect(onChange).toHaveBeenCalledWith({ ...preferences, fontSize: 22 });
});

it("emits a sidebar visibility change", () => {
  const onChange = vi.fn();
  render(<ReaderSettings preferences={preferences} onPreferencesChange={onChange} />);
  fireEvent.click(screen.getByLabelText("显示目录栏"));
  expect(onChange).toHaveBeenCalledWith({ ...preferences, sidebarVisible: false });
});

it("emits a changed content margin", () => {
  const onChange = vi.fn();
  render(<ReaderSettings preferences={preferences} onPreferencesChange={onChange} />);
  fireEvent.change(screen.getByLabelText("正文边距"), { target: { value: "40" } });
  expect(onChange).toHaveBeenCalledWith({ ...preferences, contentMargin: 40 });
});

it("adds a bookmark at the current CFI", () => {
  const onCreate = vi.fn();
  render(<BookmarkPanel bookmarks={[]} currentCfi="epubcfi(/6/4)" onCreate={onCreate} onJump={vi.fn()} onDelete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "添加书签" }));
  expect(onCreate).toHaveBeenCalledWith("epubcfi(/6/4)");
});

it("shows the saved bookmark excerpt", () => {
  render(<BookmarkPanel bookmarks={[{
    id: "bookmark-a", bookId: "book-a", cfi: "epubcfi(/6/4)", chapterLabel: "第一章", excerpt: "这是保存的正文摘录。", createdAt: 1,
  }]} currentCfi="epubcfi(/6/4)" onCreate={vi.fn()} onJump={vi.fn()} onDelete={vi.fn()} />);

  expect(screen.getByText("这是保存的正文摘录。")).toBeInTheDocument();
});
