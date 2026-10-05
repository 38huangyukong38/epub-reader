import ePub from "epubjs";
import type { BookReaderAppearance, BookRecord, ReaderPreferences } from "../domain/models";
import { bindReaderMouseNavigation } from "./readerMouseNavigation";
import { READER_THEMES } from "../domain/readerThemes";
import { MOBILE_READER_QUERY, READER_TAP_LEFT_EDGE, READER_TAP_RIGHT_EDGE, TOGGLE_READER_CONTROLS } from "../domain/readerInteractions";
import { installEpubMarkupCompatibility, type EpubMarkupBook } from "./epubMarkupCompatibility";

export interface ReaderLocation {
  cfi: string;
  progression: number;
  chapterLabel: string;
  href?: string;
  chapterPage?: number;
  chapterPageTotal?: number;
  layoutKey?: string;
}

export type ReaderPageHint = Pick<ReaderLocation, "chapterPage" | "chapterPageTotal" | "layoutKey">;

export interface ReaderNavigationItem {
  label: string;
  href: string;
  subitems: ReaderNavigationItem[];
}

interface ReaderContents {
  document: Document;
}

interface ReaderView {
  contents?: ReaderContents;
}

interface RenditionHook<T> {
  register(callback: (value: T) => void): void;
  deregister(callback: (value: T) => void): void;
}

interface Rendition {
  display(target?: string): Promise<void>;
  prev(): Promise<void>;
  next(): Promise<void>;
  on(event: "relocated", callback: (location: unknown) => void): void;
  off(event: "relocated", callback: (location: unknown) => void): void;
  destroy(): void;
  resize?(width: number, height: number, cfi?: string): void;
  getContents?(): ReaderContents[];
  hooks?: {
    content?: RenditionHook<ReaderContents>;
    unloaded?: RenditionHook<ReaderView>;
  };
  themes?: { override(property: string, value: string): void };
}

interface ParsedBook extends EpubMarkupBook {
  renderTo(target: HTMLElement, options: { width: string; height: string; flow: "paginated"; spread: "auto"; minSpreadWidth: number }): Rendition;
  navigation: { toc: ReaderNavigationItem[] };
  loaded: { navigation: Promise<{ toc: ReaderNavigationItem[] }> };
  getRange?(cfi: string): Promise<Range>;
  locations?: {
    generate(chars: number): Promise<unknown>;
    percentageFromCfi(cfi: string): number | null;
  };
  destroy(): void;
}

export type EpubBookFactory = (source: Blob) => ParsedBook;

export interface EpubReaderService {
  open(book: BookRecord, target: HTMLElement, initialCfi: string | undefined, onLocation: (location: ReaderLocation) => void, onCfiFallback?: () => void, preferences?: ReaderPreferences, pageHint?: ReaderPageHint): Promise<void>;
  previous(): Promise<void>;
  next(): Promise<void>;
  display(target: string, pageHint?: ReaderPageHint): Promise<void>;
  getNavigation(): Promise<ReaderNavigationItem[]>;
  getCurrentCfi(): string | undefined;
  getExcerpt(cfi: string): Promise<string>;
  applyPreferences(value: ReaderPreferences, appearance: BookReaderAppearance): Promise<void>;
  close(): Promise<void>;
}

const defaultFactory: EpubBookFactory = (source) => {
  const book = (ePub as unknown as (input: Blob) => ParsedBook)(source);
  installEpubMarkupCompatibility(book);
  return book;
};

function findChapterLabel(items: ReaderNavigationItem[], href: string | undefined): string | undefined {
  for (const item of items) {
    if (item.href === href) return item.label;
    const childLabel = findChapterLabel(item.subitems ?? [], href);
    if (childLabel) return childLabel;
  }
  return undefined;
}

function toLocation(value: unknown, navigation: ReaderNavigationItem[]): ReaderLocation | undefined {
  const start = (value as {
    start?: {
      cfi?: unknown;
      percentage?: unknown;
      href?: unknown;
      displayed?: { page?: unknown; total?: unknown };
    };
  }).start;
  const cfi = typeof start?.cfi === "string" ? start.cfi : undefined;
  if (!cfi) return undefined;
  const progression = typeof start?.percentage === "number" ? start.percentage : 0;
  const href = typeof start?.href === "string" ? start.href : undefined;
  const chapterPage = typeof start?.displayed?.page === "number" && start.displayed.page > 0
    ? start.displayed.page
    : undefined;
  const chapterPageTotal = typeof start?.displayed?.total === "number" && start.displayed.total > 0
    ? start.displayed.total
    : undefined;
  return { cfi, progression, chapterLabel: findChapterLabel(navigation, href) ?? "当前位置", href, chapterPage, chapterPageTotal };
}

export function createEpubReaderService(factory: EpubBookFactory = defaultFactory): EpubReaderService {
  let parsedBook: ParsedBook | undefined;
  let rendition: Rendition | undefined;
  let navigation: ReaderNavigationItem[] = [];
  let currentCfi: string | undefined;
  let relocatedHandler: ((location: unknown) => void) | undefined;
  let locationsReady = false;
  let latestRelocation: unknown;
  let resizeObserver: ResizeObserver | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingPagination: Promise<void> | undefined;
  let renderTarget: HTMLElement | undefined;
  let hostInputTarget: HTMLElement | undefined;
  let activePreferences: ReaderPreferences | undefined;
  const locationWaiters = new Set<(location?: ReaderLocation) => void>();
  const mouseNavigationCleanups = new Map<EventTarget, () => void>();
  const mobileInput = () => window.matchMedia?.(MOBILE_READER_QUERY).matches ?? false;

  const handleTap = (clientX: number, event: Event) => {
    if (!renderTarget) return;
    const bounds = (renderTarget.closest<HTMLElement>(".reader-page__content") ?? renderTarget).getBoundingClientRect();
    if (!bounds.width) return;
    const node = event.target as Node | null;
    const document = node?.nodeType === 9 ? node as Document : node?.ownerDocument;
    // EPUB iframes span all chapter columns. Convert their local coordinates
    // into the visible reading viewport before classifying the tap.
    const frame = document?.defaultView?.frameElement;
    const screenX = clientX + (frame?.getBoundingClientRect().left ?? 0);
    const fraction = (screenX - bounds.left) / bounds.width;
    if (fraction < READER_TAP_LEFT_EDGE) return paginate("prev");
    if (fraction > READER_TAP_RIGHT_EDGE) return paginate("next");
    renderTarget.dispatchEvent(new Event(TOGGLE_READER_CONTROLS));
  };

  const bindMouseNavigation = (target: EventTarget) => {
    if (mouseNavigationCleanups.has(target)) return;
    mouseNavigationCleanups.set(target, bindReaderMouseNavigation(target, {
      previous: () => paginate("prev"),
      next: () => paginate("next"),
      tap: handleTap,
      tapEnabled: mobileInput,
    }));
  };

  // Chapter iframes are replaced independently of the pagination promise and
  // location notification. Bind each document as soon as EPUB.js loads it.
  const bindContentNavigation = (content: ReaderContents) => bindMouseNavigation(content.document);
  const unbindContentNavigation = (view: ReaderView) => {
    const target = view.contents?.document;
    if (!target) return;
    mouseNavigationCleanups.get(target)?.();
    mouseNavigationCleanups.delete(target);
  };

  const bindRenditionContents = () => {
    if (renderTarget) {
      const nextHost = mobileInput() ? renderTarget.closest<HTMLElement>(".reader-page__content") ?? renderTarget : renderTarget;
      if (hostInputTarget !== nextHost) {
        if (hostInputTarget) {
          mouseNavigationCleanups.get(hostInputTarget)?.();
          mouseNavigationCleanups.delete(hostInputTarget);
        }
        hostInputTarget = nextHost;
        bindMouseNavigation(nextHost);
      }
    }
    for (const content of rendition?.getContents?.() ?? []) bindMouseNavigation(content.document);
  };

  const paginate = (direction: "prev" | "next"): Promise<void> => {
    if (pendingPagination) return pendingPagination;
    const activeRendition = rendition;
    if (!activeRendition) return Promise.resolve();
    const operation = (async () => {
      await activeRendition[direction]();
      if (rendition === activeRendition) bindRenditionContents();
    })();
    pendingPagination = operation;
    const release = () => {
      if (pendingPagination === operation) pendingPagination = undefined;
    };
    void operation.then(release, release);
    return operation;
  };

  const waitForLocation = () => new Promise<ReaderLocation | undefined>((resolve) => {
    const done = (location?: ReaderLocation) => { clearTimeout(timer); locationWaiters.delete(done); resolve(location); };
    const timer = setTimeout(() => done(), 1500);
    locationWaiters.add(done);
  });

  const displayPosition = async (target?: string, hint?: ReaderPageHint) => {
    const activeRendition = rendition;
    const relocated = hint?.layoutKey ? waitForLocation() : undefined;
    await activeRendition?.display(target);
    if (!relocated) return;
    const location = await relocated;
    // Chinese text can span a page boundary inside a single EPUB CFI word.
    // Correct that one-page rounding only when the exact layout still matches.
    if (rendition !== activeRendition || !location || !hint || location.layoutKey !== hint.layoutKey
      || location.chapterPageTotal !== hint.chapterPageTotal || !location.chapterPage || !hint.chapterPage) return;
    const difference = hint.chapterPage - location.chapterPage;
    if (Math.abs(difference) === 1) {
      const corrected = waitForLocation();
      await paginate(difference > 0 ? "next" : "prev");
      await corrected;
    }
  };

  return {
    async open(book, target, initialCfi, onLocation, onCfiFallback, preferences, pageHint) {
      await this.close();
      renderTarget = target;
      parsedBook = factory(book.fileBlob);
      try {
        navigation = (await parsedBook.loaded.navigation).toc ?? [];
      } catch {
        navigation = parsedBook.navigation?.toc ?? [];
      }
      rendition = parsedBook.renderTo(target, { width: "100%", height: "100%", flow: "paginated", spread: "auto", minSpreadWidth: 901 });
      rendition.hooks?.content?.register(bindContentNavigation);
      rendition.hooks?.unloaded?.register(unbindContentNavigation);
      if (preferences) await this.applyPreferences(preferences, { bookId: book.id, backgroundEnabled: false, overlayOpacity: 0.55 });
      relocatedHandler = (value) => {
        // Internal EPUB links and resize operations may create a fresh iframe too.
        bindRenditionContents();
        latestRelocation = value;
        const location = toLocation(value, navigation);
        if (!location) return;
        if (activePreferences && renderTarget) location.layoutKey = JSON.stringify([
          renderTarget.clientWidth, renderTarget.clientHeight,
          activePreferences.fontFamily, activePreferences.fontSize, activePreferences.lineHeight,
        ]);
        if (locationsReady && location.progression === 0) {
          const calculated = parsedBook?.locations?.percentageFromCfi(location.cfi);
          if (typeof calculated === "number" && calculated >= 0) location.progression = calculated;
        }
        currentCfi = location.cfi;
        onLocation(location);
        for (const done of locationWaiters) done(location);
      };
      rendition.on("relocated", relocatedHandler);
      try {
        await displayPosition(initialCfi, pageHint);
      } catch {
        if (initialCfi) onCfiFallback?.();
        await rendition.display();
      }
      if (parsedBook.locations) {
        void parsedBook.locations.generate(1024).then(() => {
          locationsReady = true;
          if (latestRelocation) relocatedHandler?.(latestRelocation);
        }).catch(() => undefined);
      }
      bindRenditionContents();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (target.clientWidth && target.clientHeight) rendition?.resize?.(target.clientWidth, target.clientHeight, currentCfi);
          }, 120);
        });
        resizeObserver.observe(target);
      }
    },

    async previous() { await paginate("prev"); },
    async next() { await paginate("next"); },
    async display(target, pageHint) {
      const activeRendition = rendition;
      await pendingPagination;
      if (!activeRendition || rendition !== activeRendition) return;
      await displayPosition(target, pageHint);
      if (rendition === activeRendition) bindRenditionContents();
    },
    async getNavigation() { return navigation; },
    getCurrentCfi() { return currentCfi; },
    async getExcerpt(cfi) {
      if (!parsedBook?.getRange) return "";
      try {
        const range = await parsedBook.getRange(cfi);
        const excerpt = (range.startContainer.parentElement?.textContent ?? range.startContainer.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        return excerpt.slice(0, 180);
      } catch {
        return "";
      }
    },

    async applyPreferences(value) {
      activePreferences = value;
      const themeColors = READER_THEMES[value.theme];
      rendition?.themes?.override("font-family", value.fontFamily);
      rendition?.themes?.override("font-size", `${value.fontSize}px`);
      rendition?.themes?.override("line-height", String(value.lineHeight));
      rendition?.themes?.override("color", themeColors.color);
      rendition?.themes?.override(
        "background",
        "transparent",
      );
    },

    async close() {
      for (const done of locationWaiters) done();
      renderTarget = undefined;
      hostInputTarget = undefined;
      activePreferences = undefined;
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = undefined;
      pendingPagination = undefined;
      if (rendition && relocatedHandler) rendition.off("relocated", relocatedHandler);
      rendition?.hooks?.content?.deregister(bindContentNavigation);
      rendition?.hooks?.unloaded?.deregister(unbindContentNavigation);
      for (const cleanup of mouseNavigationCleanups.values()) cleanup();
      mouseNavigationCleanups.clear();
      rendition?.destroy();
      parsedBook?.destroy();
      rendition = undefined;
      parsedBook = undefined;
      relocatedHandler = undefined;
      navigation = [];
      currentCfi = undefined;
      locationsReady = false;
      latestRelocation = undefined;
    },
  };
}

