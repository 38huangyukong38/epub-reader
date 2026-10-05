import { useCallback, useEffect, useRef, useState } from "react";
import type { BackgroundImage, Bookmark, BookRecord, ReaderPreferences, ReadingState } from "../domain/models";
import { createReaderRepository, type ReaderRepository } from "../repositories/readerRepository";
import { createEpubReaderService, type EpubReaderService, type ReaderLocation, type ReaderNavigationItem } from "../services/epubReaderService";
import { BackgroundImageService } from "../services/backgroundImageService";

export interface UseReaderResult {
  targetRef: React.MutableRefObject<HTMLDivElement | null>;
  location?: ReaderLocation;
  navigation: ReaderNavigationItem[];
  loading: boolean;
  error?: string;
  preferences: ReaderPreferences;
  bookmarks: Bookmark[];
  previous(): void;
  next(): void;
  display(target: string): void;
  updatePreferences(value: ReaderPreferences): void;
  createBookmark(cfi: string): void;
  deleteBookmark(id: string): void;
  renameBookmark(id: string, name: string): void;
  background?: { url: string; imageId: string; enabled: boolean; overlayOpacity: number };
  setBackground(file: File): void;
  setBackgroundEnabled(enabled: boolean): void;
  setOverlayOpacity(opacity: number): void;
  resetBackground(): void;
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  key: "global", fontFamily: "system-ui", fontSize: 18, lineHeight: 1.7, theme: "light", sidebarVisible: true, contentMargin: 24,
};

export function useReader(
  book: BookRecord,
  repository: ReaderRepository = createReaderRepository(),
  service: EpubReaderService = createEpubReaderService(),
): UseReaderResult {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const serviceRef = useRef(service);
  const repositoryRef = useRef(repository);
  const latestLocationRef = useRef<ReaderLocation>();
  const [location, setLocation] = useState<ReaderLocation>();
  const [navigation, setNavigation] = useState<ReaderNavigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [background, setBackground] = useState<UseReaderResult["background"]>();
  const backgroundUrlRef = useRef<string>();

  const runMutation = useCallback((operation: Promise<unknown>) => {
    void operation.catch((reason: unknown) => {
      const detail = reason instanceof Error && reason.message ? `：${reason.message}` : "，请重试";
      setError(`无法保存阅读器数据${detail}`);
    });
  }, []);

  const updateBackground = useCallback((image?: BackgroundImage, appearance?: { backgroundEnabled: boolean; overlayOpacity: number }) => {
    if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
    if (!image) {
      backgroundUrlRef.current = undefined;
      setBackground(undefined);
      return;
    }
    const url = URL.createObjectURL(image.blob);
    backgroundUrlRef.current = url;
    setBackground({ url, imageId: image.id, enabled: appearance?.backgroundEnabled ?? false, overlayOpacity: appearance?.overlayOpacity ?? 0.55 });
  }, []);

  useEffect(() => () => {
    if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
  }, []);

  const saveLocation = useCallback(async (value: ReaderLocation) => {
    const state: ReadingState = { bookId: book.id, ...value, updatedAt: Date.now() };
    await repositoryRef.current.saveReadingState(state);
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reader = serviceRef.current;
    const target = targetRef.current;
    if (!target) return;

    const flushLocation = () => {
      if (timer) clearTimeout(timer);
      const latest = latestLocationRef.current;
      if (latest) runMutation(saveLocation(latest));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushLocation();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushLocation);

    const open = async () => {
      setLoading(true);
      try {
        const bundle = await repositoryRef.current.getReaderBundle(book.id);
        const savedPreferences = await repositoryRef.current.getPreferences();
        const activePreferences = savedPreferences ?? DEFAULT_PREFERENCES;
        if (!cancelled) {
          setPreferences(activePreferences);
          setBookmarks(bundle.bookmarks);
          updateBackground(bundle.image, bundle.appearance);
        }
        await reader.open(book, target, bundle.state?.cfi, (nextLocation) => {
          latestLocationRef.current = nextLocation;
          setLocation(nextLocation);
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => runMutation(saveLocation(nextLocation)), 500);
        }, () => {
          if (!cancelled) setError("上次阅读位置不可用，已从本书开头打开");
        }, activePreferences, bundle.state);
        if (!cancelled) setNavigation(await reader.getNavigation());
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "无法打开该 EPUB 文件");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void open();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushLocation);
      flushLocation();
      void reader.close();
    };
  }, [book, runMutation, saveLocation, updateBackground]);

  return {
    targetRef,
    location,
    navigation,
    loading,
    error,
    previous: () => void serviceRef.current.previous(),
    next: () => void serviceRef.current.next(),
    display: (target) => runMutation(serviceRef.current.display(target, bookmarks.find((bookmark) => bookmark.cfi === target))),
    preferences,
    bookmarks,
    updatePreferences: (value) => {
      setPreferences(value);
      runMutation(Promise.all([
        repositoryRef.current.savePreferences(value),
        serviceRef.current.applyPreferences(value, { bookId: book.id, backgroundImageId: background?.imageId, backgroundEnabled: background?.enabled ?? false, overlayOpacity: background?.overlayOpacity ?? 0.55 }),
      ]));
    },
    createBookmark: (cfi) => {
      runMutation((async () => {
        const excerpt = await serviceRef.current.getExcerpt(cfi);
        const bookmark: Bookmark = {
          id: crypto.randomUUID(),
          bookId: book.id,
          cfi,
          chapterLabel: location?.chapterLabel ?? "当前位置",
          chapterPage: location?.chapterPage,
          chapterPageTotal: location?.chapterPageTotal,
          layoutKey: location?.layoutKey,
          excerpt,
          createdAt: Date.now(),
        };
        await repositoryRef.current.saveBookmark(bookmark);
        setBookmarks(await repositoryRef.current.getBookmarks(book.id));
      })());
    },
    deleteBookmark: (id) => runMutation(repositoryRef.current.deleteBookmark(id).then(async () => setBookmarks(await repositoryRef.current.getBookmarks(book.id)))),
    renameBookmark: (id, name) => runMutation(repositoryRef.current.renameBookmark(id, name).then(async () => setBookmarks(await repositoryRef.current.getBookmarks(book.id)))),
    background,
    setBackground: (file) => runMutation(new BackgroundImageService(repositoryRef.current).setBackground(book.id, file).then(async () => { const bundle = await repositoryRef.current.getReaderBundle(book.id); updateBackground(bundle.image, bundle.appearance); })),
    setBackgroundEnabled: (enabled) => runMutation(new BackgroundImageService(repositoryRef.current).setEnabled(book.id, enabled).then(() => setBackground((value) => value && { ...value, enabled }))),
    setOverlayOpacity: (overlayOpacity) => runMutation(new BackgroundImageService(repositoryRef.current).setOverlayOpacity(book.id, overlayOpacity).then(() => setBackground((value) => value && { ...value, overlayOpacity: Math.min(0.9, Math.max(0.2, overlayOpacity)) }))),
    resetBackground: () => runMutation(new BackgroundImageService(repositoryRef.current).reset(book.id).then(() => updateBackground())),
  };
}
