import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { BookRecord } from "../domain/models";
import type { ReaderRepository } from "../repositories/readerRepository";
import type { EpubReaderService } from "../services/epubReaderService";
import { useReader } from "./useReader";

const book: BookRecord = { id: "book-a", title: "测试书籍", creator: "作者", fileBlob: new Blob(["epub"]), importedAt: 1, updatedAt: 1 };

function repositoryWithFailedPreferenceSave(): ReaderRepository {
  return {
    saveBook: vi.fn(), listLibrary: vi.fn().mockResolvedValue([]), getBook: vi.fn(), saveReadingState: vi.fn(),
    saveBookmark: vi.fn(), deleteBookmark: vi.fn(), getBookmarks: vi.fn().mockResolvedValue([]),
    getPreferences: vi.fn(), savePreferences: vi.fn().mockRejectedValue(new Error("quota exceeded")), saveLibraryOrder: vi.fn(),
    getReaderBundle: vi.fn().mockResolvedValue({ bookmarks: [] }), replaceBackground: vi.fn(), clearBackground: vi.fn(), deleteBook: vi.fn(), renameBookmark: vi.fn(),
  };
}

const service: EpubReaderService = {
  open: vi.fn(), previous: vi.fn(), next: vi.fn(), display: vi.fn(), getNavigation: vi.fn().mockResolvedValue([]),
  getCurrentCfi: vi.fn(), getExcerpt: vi.fn().mockResolvedValue("摘录文本"), applyPreferences: vi.fn(), close: vi.fn(),
};

function BookmarkHarness({ repository, readerService }: { repository: ReaderRepository; readerService: EpubReaderService }) {
  const reader = useReader(book, repository, readerService);
  return <div ref={reader.targetRef}><button type="button" onClick={() => reader.createBookmark("epubcfi(/6/4)")}>add bookmark</button></div>;
}

it("reports preference persistence failures instead of silently swallowing them", async () => {
  const { result } = renderHook(() => useReader(book, repositoryWithFailedPreferenceSave(), service));

  act(() => result.current.updatePreferences({ ...result.current.preferences, fontSize: 22 }));

  await waitFor(() => expect(result.current.error).toMatch("无法保存阅读器数据"));
});

it("stores the reader excerpt with a new bookmark", async () => {
  const repository = repositoryWithFailedPreferenceSave();
  repository.saveBookmark = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useReader(book, repository, service));

  act(() => result.current.createBookmark("epubcfi(/6/4)"));

  await waitFor(() => expect(repository.saveBookmark).toHaveBeenCalledWith(expect.objectContaining({
    cfi: "epubcfi(/6/4)", excerpt: "摘录文本",
  })));
});

it("stores the active chapter pagination with a new bookmark", async () => {
  const repository = repositoryWithFailedPreferenceSave();
  repository.saveBookmark = vi.fn().mockResolvedValue(undefined);
  const readerService: EpubReaderService = {
    ...service,
    open: vi.fn(async (_book, _target, _cfi, onLocation) => {
      onLocation({ cfi: "epubcfi(/6/4)", progression: 0.3, chapterLabel: "雨夜来信", chapterPage: 3, chapterPageTotal: 12 });
    }),
  };
  render(<BookmarkHarness repository={repository} readerService={readerService} />);

  await waitFor(() => expect(readerService.open).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "add bookmark" }));

  await waitFor(() => expect(repository.saveBookmark).toHaveBeenCalledWith(expect.objectContaining({
    chapterLabel: "雨夜来信",
    chapterPage: 3,
    chapterPageTotal: 12,
  })));
});

it("reports the actual background persistence failure", async () => {
  const repository = repositoryWithFailedPreferenceSave();
  repository.replaceBackground = vi.fn().mockRejectedValue(new Error("backgroundImages store is missing"));
  const { result } = renderHook(() => useReader(book, repository, service));

  act(() => result.current.setBackground(new File(["image"], "background.png", { type: "image/png" })));

  await waitFor(() => expect(result.current.error).toContain("backgroundImages store is missing"));
});

it("flushes the current location immediately when the app goes into the background", async () => {
  const repository = repositoryWithFailedPreferenceSave();
  const readerService: EpubReaderService = {
    ...service,
    open: vi.fn(async (_book, _target, _cfi, onLocation) => {
      onLocation({ cfi: "epubcfi(/6/4)", progression: 0.3, chapterLabel: "手机阅读" });
    }),
  };
  render(<BookmarkHarness repository={repository} readerService={readerService} />);
  await waitFor(() => expect(readerService.open).toHaveBeenCalledOnce());
  expect(repository.saveReadingState).not.toHaveBeenCalled();
  fireEvent(window, new Event("pagehide"));
  expect(repository.saveReadingState).toHaveBeenCalledWith(expect.objectContaining({ cfi: "epubcfi(/6/4)" }));
});
