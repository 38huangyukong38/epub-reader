import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ReaderPage } from "./ReaderPage";
import { TOGGLE_READER_CONTROLS } from "../../domain/readerInteractions";

const reader = {
  targetRef: { current: null },
  location: { cfi: "epubcfi(/6/2)", progression: 0.25, chapterLabel: "第一章", chapterPage: 3, chapterPageTotal: 12 },
  navigation: [{ label: "第一章", href: "chapter-1.xhtml", subitems: [] }],
  previous: vi.fn(),
  next: vi.fn(),
  display: vi.fn(),
};

it("uses PageDown to move to the next page", () => {
  render(<ReaderPage title="Test Book" reader={reader} onBack={vi.fn()} />);
  expect(screen.getByText("第 3 / 12 页")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "PageDown" });
  expect(reader.next).toHaveBeenCalledOnce();
});

it("confirms before navigating to a selected table of contents item", () => {
  render(<ReaderPage title="Test Book" reader={reader} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "第一章" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(reader.display).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "跳转" }));
  expect(reader.display).toHaveBeenCalledWith("chapter-1.xhtml");
});

it("hides the sidebar when the saved preference disables it", () => {
  const updatePreferences = vi.fn();
  render(<ReaderPage title="Test Book" reader={{ ...reader, updatePreferences, preferences: { key: "global", fontFamily: "system-ui", fontSize: 18, lineHeight: 1.7, theme: "light", sidebarVisible: false } }} onBack={vi.fn()} />);
  expect(screen.queryByRole("navigation", { name: "目录" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "显示目录栏" }));
  expect(updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ sidebarVisible: true }));
});

it("keeps reader content separate from independently scrollable sidebar tools", () => {
  const { container } = render(<ReaderPage title="Test Book" reader={{
    ...reader,
    preferences: { key: "global", fontFamily: "system-ui", fontSize: 18, lineHeight: 1.7, theme: "light", sidebarVisible: true },
    bookmarks: [{ id: "bookmark-1", bookId: "book-1", cfi: "epubcfi(/6/2)", chapterLabel: "第一章", excerpt: "", createdAt: 1 }],
    updatePreferences: vi.fn(), createBookmark: vi.fn(), deleteBookmark: vi.fn(),
    setBackground: vi.fn(), setBackgroundEnabled: vi.fn(), setOverlayOpacity: vi.fn(), resetBackground: vi.fn(),
    background: { url: "blob:background", enabled: true, overlayOpacity: 0.55 },
  }} onBack={vi.fn()} />);

  expect(container.querySelector(".reader-page__sidebar-scroll")).toBeInTheDocument();
  expect(container.querySelector(".reader-page__toc")).toBeInTheDocument();
  expect(container.querySelector(".reader-page__bookmarks")).toBeInTheDocument();
  expect(container.querySelector(".reader-page__settings")).toBeInTheDocument();
  expect(container.querySelector(".reader-page__background")).toBeInTheDocument();
  expect(container.querySelector(".reader-page__content .reader-render-target")).toBeInTheDocument();
  expect(container.querySelector(".reader-page > .reader-page__background-image")).toBeInTheDocument();
  expect(container.querySelector(".reader-page > .reader-page__background-overlay")).not.toBeInTheDocument();
  expect(container.querySelector(".reader-page__content .reader-background-overlay")).toBeInTheDocument();
});

it("handles Android back by closing the mobile drawer before returning to the library", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  try {
    const onBack = vi.fn();
    const { unmount } = render(<ReaderPage title="手机阅读" reader={reader} onBack={onBack} />);
    expect(screen.queryByRole("navigation", { name: "目录" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "显示目录栏" }));
    expect(screen.getByRole("navigation", { name: "目录" })).toBeInTheDocument();
    const closeDrawer = new Event("reader-android-back", { cancelable: true });
    fireEvent(window, closeDrawer);
    expect(closeDrawer.defaultPrevented).toBe(true);
    expect(screen.queryByRole("navigation", { name: "目录" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent(window, new Event("reader-android-back", { cancelable: true }));
    expect(onBack).toHaveBeenCalledOnce();
    unmount();
    expect(window.dispatchEvent(new Event("reader-android-back", { cancelable: true }))).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("toggles mobile reading controls and reveals them before Android back leaves the book", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  try {
    const onBack = vi.fn();
    const mobileReader = { ...reader, targetRef: { current: null as HTMLDivElement | null } };
    const { container } = render(<ReaderPage title="手机阅读" reader={mobileReader} onBack={onBack} />);
    fireEvent(mobileReader.targetRef.current!, new Event(TOGGLE_READER_CONTROLS));
    expect(container.querySelector(".reader-page")).toHaveClass("reader-page--controls-hidden");
    fireEvent(mobileReader.targetRef.current!, new Event(TOGGLE_READER_CONTROLS));
    expect(container.querySelector(".reader-page")).not.toHaveClass("reader-page--controls-hidden");
    fireEvent(mobileReader.targetRef.current!, new Event(TOGGLE_READER_CONTROLS));
    fireEvent(window, new Event("reader-android-back", { cancelable: true }));
    expect(container.querySelector(".reader-page")).not.toHaveClass("reader-page--controls-hidden");
    expect(onBack).not.toHaveBeenCalled();
    fireEvent(window, new Event("reader-android-back", { cancelable: true }));
    expect(onBack).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
