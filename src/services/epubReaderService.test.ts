import { vi } from "vitest";
import type { BookRecord, ReaderPreferences } from "../domain/models";
import { createEpubReaderService, type EpubBookFactory, type ReaderLocation } from "./epubReaderService";

const book: BookRecord = {
  id: "book-a",
  title: "Test Book",
  creator: "Author",
  fileBlob: new Blob(["epub"]),
  importedAt: 1,
  updatedAt: 1,
};

const preferences: ReaderPreferences = {
  key: "global",
  fontFamily: "system-ui",
  fontSize: 18,
  lineHeight: 1.7,
  theme: "light",
  sidebarVisible: true,
};

it("restores the saved CFI and reports a relocation", async () => {
  let relocated: ((location: unknown) => void) | undefined;
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined),
    prev: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event, callback) => { if (event === "relocated") relocated = callback; }),
    off: vi.fn(),
    destroy: vi.fn(),
    themes: { override: vi.fn() },
  };
  const factory: EpubBookFactory = vi.fn().mockReturnValue({
    renderTo: vi.fn().mockReturnValue(rendition),
    navigation: { toc: [{ label: "第一章", href: "chapter-1.xhtml", subitems: [] }] },
    loaded: { navigation: Promise.resolve({ toc: [{ label: "第一章", href: "chapter-1.xhtml", subitems: [] }] }) },
    destroy: vi.fn(),
  });
  const reader = createEpubReaderService(factory);
  const onLocation = vi.fn<(location: ReaderLocation) => void>();

  await reader.open(book, document.createElement("div"), "epubcfi(/6/2)", onLocation);
  relocated?.({ start: { cfi: "epubcfi(/6/4)", percentage: 0.3, href: "chapter-1.xhtml" } });

  expect(rendition.display).toHaveBeenCalledWith("epubcfi(/6/2)");
  expect(onLocation).toHaveBeenCalledWith({
    cfi: "epubcfi(/6/4)",
    progression: 0.3,
    chapterLabel: "第一章",
    href: "chapter-1.xhtml",
  });
});

it("reports the current page and total pages within the active chapter", async () => {
  let relocated: ((location: unknown) => void) | undefined;
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined), prev: vi.fn(), next: vi.fn(),
    on: vi.fn((event, callback) => { if (event === "relocated") relocated = callback; }),
    off: vi.fn(), destroy: vi.fn(),
  };
  const reader = createEpubReaderService(vi.fn().mockReturnValue({
    renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, destroy: vi.fn(),
  }));
  const onLocation = vi.fn<(location: ReaderLocation) => void>();

  await reader.open(book, document.createElement("div"), undefined, onLocation);
  relocated?.({ start: { cfi: "epubcfi(/6/4)", percentage: 0.3, href: "chapter.xhtml", displayed: { page: 3, total: 12 } } });

  expect(onLocation).toHaveBeenCalledWith(expect.objectContaining({ chapterPage: 3, chapterPageTotal: 12 }));
});

it("derives reading progress from the generated EPUB locations", async () => {
  let relocated: ((location: unknown) => void) | undefined;
  const locations = { generate: vi.fn().mockResolvedValue(undefined), percentageFromCfi: vi.fn().mockReturnValue(0.42) };
  const rendition = { display: vi.fn().mockResolvedValue(undefined), prev: vi.fn(), next: vi.fn(), on: vi.fn((_event, callback) => { relocated = callback; }), off: vi.fn(), destroy: vi.fn() };
  const reader = createEpubReaderService(vi.fn().mockReturnValue({ renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, locations, destroy: vi.fn() }));
  const onLocation = vi.fn<(location: ReaderLocation) => void>();

  await reader.open(book, document.createElement("div"), undefined, onLocation);
  relocated?.({ start: { cfi: "epubcfi(/6/4)", percentage: 0, href: "chapter.xhtml" } });
  await Promise.resolve();

  expect(onLocation).toHaveBeenLastCalledWith(expect.objectContaining({ progression: 0.42 }));
});

it("falls back to the beginning and destroys resources on close", async () => {
  const rendition = {
    display: vi.fn().mockRejectedValueOnce(new Error("bad CFI")).mockResolvedValue(undefined),
    prev: vi.fn(), next: vi.fn(), on: vi.fn(), off: vi.fn(), destroy: vi.fn(),
    themes: { override: vi.fn() },
  };
  const parsedBook = { renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [{ label: "开始", href: "start.xhtml", subitems: [] }] }) }, destroy: vi.fn() };
  const reader = createEpubReaderService(vi.fn().mockReturnValue(parsedBook));
  const onFallback = vi.fn();

  await reader.open(book, document.createElement("div"), "bad-cfi", vi.fn(), onFallback);
  await reader.applyPreferences(preferences, { bookId: "book-a", backgroundImageId: "background-a", backgroundEnabled: true, overlayOpacity: 0.55 });
  expect(await reader.getNavigation()).toEqual([{ label: "开始", href: "start.xhtml", subitems: [] }]);
  await reader.close();

  expect(rendition.display).toHaveBeenNthCalledWith(1, "bad-cfi");
  expect(rendition.display).toHaveBeenNthCalledWith(2);
  expect(onFallback).toHaveBeenCalledOnce();
  expect(rendition.themes.override).toHaveBeenCalledWith("font-size", "18px");
  expect(rendition.themes.override).toHaveBeenCalledWith("background", "transparent");
  expect(rendition.destroy).toHaveBeenCalledOnce();
  expect(parsedBook.destroy).toHaveBeenCalledOnce();
});

it("extracts a compact bookmark excerpt from the CFI paragraph", async () => {
  const text = document.createTextNode("  A compact passage   with repeated whitespace.  ");
  const range = document.createRange();
  range.setStart(text, 12);
  range.collapse(true);
  const rendition = { display: vi.fn(), prev: vi.fn(), next: vi.fn(), on: vi.fn(), off: vi.fn(), destroy: vi.fn() };
  const parsedBook = {
    renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) },
    getRange: vi.fn().mockResolvedValue(range), destroy: vi.fn(),
  };
  const reader = createEpubReaderService(vi.fn().mockReturnValue(parsedBook));

  await reader.open(book, document.createElement("div"), undefined, vi.fn());

  await expect(reader.getExcerpt("epubcfi(/6/4)")).resolves.toBe("A compact passage with repeated whitespace.");
});

it("binds mouse pagination to the reader target and EPUB document", async () => {
  const target = document.createElement("div");
  const contentDocument = document.implementation.createHTMLDocument("chapter");
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined),
    prev: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(), off: vi.fn(), destroy: vi.fn(),
    getContents: vi.fn().mockReturnValue([{ document: contentDocument }]),
  };
  const parsedBook = { renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, destroy: vi.fn() };
  const reader = createEpubReaderService(vi.fn().mockReturnValue(parsedBook));

  await reader.open(book, target, undefined, vi.fn());
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await reader.next();
  contentDocument.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

  expect(rendition.next).toHaveBeenCalledOnce();
  expect(rendition.prev).toHaveBeenCalledOnce();
  await reader.close();
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(rendition.next).toHaveBeenCalledOnce();
});

it("keeps narrow viewports on one page and binds new EPUB documents after touch navigation", async () => {
  const firstDocument = document.implementation.createHTMLDocument("chapter 1");
  const secondDocument = document.implementation.createHTMLDocument("chapter 2");
  let activeDocument = firstDocument;
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined),
    prev: vi.fn().mockResolvedValue(undefined),
    next: vi.fn(async () => { activeDocument = secondDocument; }),
    on: vi.fn(), off: vi.fn(), destroy: vi.fn(),
    getContents: vi.fn(() => [{ document: activeDocument }]),
  };
  const parsedBook = { renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, destroy: vi.fn() };
  const reader = createEpubReaderService(vi.fn().mockReturnValue(parsedBook));
  await reader.open(book, document.createElement("div"), undefined, vi.fn());

  swipeDocument(firstDocument);
  await reader.next();
  swipeDocument(secondDocument);
  await reader.next();

  expect(rendition.next).toHaveBeenCalledTimes(2);
  expect(parsedBook.renderTo).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ spread: "auto", minSpreadWidth: 901 }));
  await reader.close();
  swipeDocument(firstDocument);
  swipeDocument(secondDocument);
  expect(rendition.next).toHaveBeenCalledTimes(2);
});

it("shares a pagination lock across iframe gestures, host events, and reader buttons", async () => {
  const target = document.createElement("div");
  const contentDocument = document.implementation.createHTMLDocument("chapter");
  let finishPage: () => void = () => undefined;
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined), prev: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockReturnValueOnce(new Promise<void>((resolve) => { finishPage = resolve; })).mockResolvedValue(undefined),
    on: vi.fn(), off: vi.fn(), destroy: vi.fn(),
    getContents: vi.fn(() => [{ document: contentDocument }]),
  };
  const reader = createEpubReaderService(vi.fn().mockReturnValue({
    renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, destroy: vi.fn(),
  }));
  await reader.open(book, target, undefined, vi.fn());

  const pending = reader.next();
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  swipeDocument(contentDocument);
  const repeated = reader.previous();
  expect(rendition.next).toHaveBeenCalledOnce();
  expect(rendition.prev).not.toHaveBeenCalled();

  finishPage();
  await Promise.all([pending, repeated]);
  await reader.previous();
  expect(rendition.prev).toHaveBeenCalledOnce();
  await reader.close();
});

it("binds documents opened by internal EPUB links when relocation fires", async () => {
  const linkedDocument = document.implementation.createHTMLDocument("footnote");
  let relocated: ((location: unknown) => void) | undefined;
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined), prev: vi.fn().mockResolvedValue(undefined), next: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event, callback) => { relocated = callback; }), off: vi.fn(), destroy: vi.fn(),
    getContents: vi.fn().mockReturnValue([]),
  };
  const reader = createEpubReaderService(vi.fn().mockReturnValue({
    renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, destroy: vi.fn(),
  }));
  await reader.open(book, document.createElement("div"), undefined, vi.fn());
  rendition.getContents.mockReturnValue([{ document: linkedDocument }]);
  relocated?.({ start: { cfi: "epubcfi(/6/6)" } });
  relocated?.({ start: { cfi: "epubcfi(/6/6)" } });
  swipeDocument(linkedDocument);
  await reader.next();

  expect(rendition.next).toHaveBeenCalledOnce();
  await reader.close();
});

it("binds new chapter documents before relocation and releases unloaded chapters", async () => {
  const first = { document: document.implementation.createHTMLDocument("first chapter") };
  const second = { document: document.implementation.createHTMLDocument("second chapter") };
  let contentHook: ((content: typeof first) => void) | undefined;
  let unloadHook: ((view: { contents?: typeof first }) => void) | undefined;
  const hooks = {
    content: { register: vi.fn((callback) => { contentHook = callback; }), deregister: vi.fn() },
    unloaded: { register: vi.fn((callback) => { unloadHook = callback; }), deregister: vi.fn() },
  };
  const rendition = {
    display: vi.fn().mockResolvedValue(undefined), prev: vi.fn().mockResolvedValue(undefined), next: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(), off: vi.fn(), destroy: vi.fn(), getContents: vi.fn(() => []), hooks,
  };
  const reader = createEpubReaderService(vi.fn().mockReturnValue({
    renderTo: vi.fn().mockReturnValue(rendition), navigation: { toc: [] }, loaded: { navigation: Promise.resolve({ toc: [] }) }, destroy: vi.fn(),
  }));
  await reader.open(book, document.createElement("div"), undefined, vi.fn());
  contentHook?.(first);
  first.document.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
  await reader.next();
  expect(rendition.next).toHaveBeenCalledTimes(1);
  rendition.next.mockClear();

  unloadHook?.({ contents: first });
  contentHook?.(second);
  contentHook?.(second);
  first.document.dispatchEvent(new MouseEvent("click", { button: 0 }));
  expect(rendition.next).not.toHaveBeenCalled();
  second.document.dispatchEvent(new MouseEvent("click", { button: 0 }));
  await reader.next();
  expect(rendition.next).toHaveBeenCalledTimes(1);
  second.document.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, cancelable: true }));
  await reader.previous();
  expect(rendition.prev).toHaveBeenCalledTimes(1);

  await reader.close();
  expect(hooks.content.deregister).toHaveBeenCalledWith(contentHook);
  expect(hooks.unloaded.deregister).toHaveBeenCalledWith(unloadHook);
  second.document.dispatchEvent(new MouseEvent("click", { button: 0 }));
  expect(rendition.next).toHaveBeenCalledTimes(1);
});

function swipeDocument(target: Document) {
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: [{ identifier: 0, clientX: 300, clientY: 100 }] });
  target.dispatchEvent(start);
  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperties(end, {
    touches: { value: [] },
    changedTouches: { value: [{ identifier: 0, clientX: 50, clientY: 100 }] },
  });
  target.dispatchEvent(end);
}
