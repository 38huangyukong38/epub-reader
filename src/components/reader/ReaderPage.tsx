import { useEffect, useRef, useState } from "react";
import type { ReaderLocation, ReaderNavigationItem } from "../../services/epubReaderService";
import { ReaderToolbar } from "./ReaderToolbar";
import { TableOfContents } from "./TableOfContents";
import { BookmarkPanel } from "./BookmarkPanel";
import { ReaderSettings } from "./ReaderSettings";
import { BackgroundSettings } from "./BackgroundSettings";
import { StatusMessage } from "../common/StatusMessage";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { READER_THEMES } from "../../domain/readerThemes";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { TOGGLE_READER_CONTROLS } from "../../domain/readerInteractions";

export interface ReaderPageControls {
  targetRef: { current: HTMLDivElement | null };
  location?: ReaderLocation;
  navigation: ReaderNavigationItem[];
  previous(): void;
  next(): void;
  display(target: string): void;
  preferences?: import("../../domain/models").ReaderPreferences;
  bookmarks?: import("../../domain/models").Bookmark[];
  updatePreferences?(value: import("../../domain/models").ReaderPreferences): void;
  createBookmark?(cfi: string): void;
  deleteBookmark?(id: string): void;
  renameBookmark?(id: string, name: string): void;
  background?: { url: string; enabled: boolean; overlayOpacity: number };
  setBackground?(file: File): void;
  setBackgroundEnabled?(enabled: boolean): void;
  setOverlayOpacity?(opacity: number): void;
  resetBackground?(): void;
  error?: string;
}

interface ReaderPageProps {
  title: string;
  reader: ReaderPageControls;
  onBack(): void;
  children?: React.ReactNode;
}

export function ReaderPage({ title, reader, onBack, children }: ReaderPageProps) {
  const [pendingChapter, setPendingChapter] = useState<{ href: string; label: string }>();
  const mobile = useMobileLayout();
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsHidden = mobile && !controlsVisible;
  const sidebarRef = useRef<HTMLElement | null>(null);
  const theme = READER_THEMES[reader.preferences?.theme ?? "light"];
  // Preserve each book's existing overlay until the new preference is changed.
  const paperOpacity = reader.preferences?.paperOpacity ?? (reader.background?.enabled ? reader.background.overlayOpacity : 1);
  const sidebarVisible = mobile ? mobileSidebarVisible : (reader.preferences?.sidebarVisible ?? true);
  const updatePreferences = reader.updatePreferences;
  const toggleSidebar = mobile ? () => setMobileSidebarVisible(!mobileSidebarVisible) : reader.preferences && updatePreferences
    ? () => updatePreferences({ ...reader.preferences!, sidebarVisible: !sidebarVisible })
    : undefined;

  useEffect(() => {
    sidebarRef.current?.toggleAttribute("inert", !sidebarVisible);
    if (!mobile || !sidebarVisible) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    sidebarRef.current?.querySelector<HTMLButtonElement>(".reader-sidebar-close")?.focus();
    return () => previousFocus?.focus();
  }, [mobile, sidebarVisible]);

  const jumpTo = (target: string) => {
    reader.display(target);
    if (mobile) setMobileSidebarVisible(false);
  };

  useEffect(() => {
    const target = reader.targetRef.current;
    if (!target) return;
    const toggleControls = () => {
      if (mobile && !sidebarVisible && !pendingChapter) setControlsVisible((value) => !value);
    };
    target.addEventListener(TOGGLE_READER_CONTROLS, toggleControls);
    return () => target.removeEventListener(TOGGLE_READER_CONTROLS, toggleControls);
  }, [reader.targetRef, mobile, sidebarVisible, pendingChapter]);

  useEffect(() => {
    const onAndroidBack = (event: Event) => {
      event.preventDefault();
      if (pendingChapter) setPendingChapter(undefined);
      else if (mobile && sidebarVisible) setMobileSidebarVisible(false);
      else if (controlsHidden) setControlsVisible(true);
      else onBack();
    };
    window.addEventListener("reader-android-back", onAndroidBack);
    return () => window.removeEventListener("reader-android-back", onAndroidBack);
  }, [mobile, sidebarVisible, pendingChapter, controlsHidden, onBack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mobile && sidebarVisible) {
        if (event.key === "Escape") setMobileSidebarVisible(false);
        if (event.key === "Tab" && !pendingChapter) {
          const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
          const first = focusable?.[0];
          const last = focusable?.[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
        return;
      }
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") reader.previous();
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        reader.next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reader, mobile, sidebarVisible, pendingChapter]);

  const requestChapterNavigation = (href: string) => {
    const findLabel = (items: ReaderNavigationItem[]): string | undefined => {
      for (const item of items) {
        if (item.href === href) return item.label;
        const nested = findLabel(item.subitems);
        if (nested) return nested;
      }
      return undefined;
    };
    setPendingChapter({ href, label: findLabel(reader.navigation) ?? "所选章节" });
  };

  return (
    <main className={`reader-page${sidebarVisible ? "" : " reader-page--sidebar-hidden"}${controlsHidden ? " reader-page--controls-hidden" : ""}`} style={{ "--reader-content-margin": `${reader.preferences?.contentMargin ?? 24}px`, "--reader-background": theme.background, "--reader-surface": theme.surface, "--reader-color": theme.color, "--reader-border": theme.border } as React.CSSProperties}>
      {reader.background?.enabled && <div className="reader-page__background-image" style={{ backgroundImage: `url(${reader.background.url})` }} aria-hidden="true" />}
      <ReaderToolbar title={title} progression={reader.location?.progression ?? 0} chapterLabel={reader.location?.chapterLabel} chapterPage={reader.location?.chapterPage} chapterPageTotal={reader.location?.chapterPageTotal} onBack={onBack} onPrevious={reader.previous} onNext={reader.next} sidebarVisible={sidebarVisible} onToggleSidebar={toggleSidebar} />
      {mobile && sidebarVisible && <button className="reader-sidebar-backdrop" aria-label="关闭侧栏遮罩" tabIndex={-1} onClick={() => setMobileSidebarVisible(false)} />}
      <aside id="reader-sidebar" className="reader-page__sidebar" aria-hidden={!sidebarVisible} ref={sidebarRef}>
        <div className="reader-sidebar-heading"><h2>{title}</h2>{mobile && <button className="reader-sidebar-close" type="button" aria-label="关闭侧栏" onClick={() => setMobileSidebarVisible(false)}>×</button>}</div>
        <div className="reader-page__sidebar-scroll">
          <div className="reader-page__toc"><TableOfContents items={reader.navigation} activeHref={reader.location?.href} onSelect={requestChapterNavigation} /></div>
          {reader.bookmarks && reader.createBookmark && reader.deleteBookmark && <div className="reader-page__bookmarks"><BookmarkPanel bookmarks={reader.bookmarks} currentCfi={reader.location?.cfi} onCreate={reader.createBookmark} onJump={jumpTo} onDelete={reader.deleteBookmark} onRename={reader.renameBookmark} /></div>}
          {reader.preferences && reader.updatePreferences && <div className="reader-page__settings"><ReaderSettings preferences={{ ...reader.preferences, sidebarVisible }} paperOpacity={paperOpacity} onPreferencesChange={(value) => {
            if (mobile) setMobileSidebarVisible(value.sidebarVisible);
            reader.updatePreferences?.({ ...value, sidebarVisible: mobile ? reader.preferences!.sidebarVisible : value.sidebarVisible });
          }} /></div>}
          {reader.setBackground && reader.setBackgroundEnabled && reader.resetBackground && <div className="reader-page__background"><BackgroundSettings hasImage={Boolean(reader.background)} enabled={reader.background?.enabled ?? false} onFile={reader.setBackground} onEnabledChange={reader.setBackgroundEnabled} onReset={reader.resetBackground} /></div>}
          {children}
        </div>
      </aside>
      {!mobile && toggleSidebar && <button className="reader-sidebar-toggle" type="button" aria-label={sidebarVisible ? "收起侧栏" : "展开侧栏"} title={sidebarVisible ? "收起侧栏" : "展开侧栏"} aria-expanded={sidebarVisible} aria-controls="reader-sidebar" onClick={toggleSidebar}>{sidebarVisible ? "‹" : "›"}</button>}
      <section className="reader-page__content" aria-label="阅读正文">
        {reader.error && <StatusMessage tone="error">{reader.error}</StatusMessage>}
        <div className="reader-background-overlay" style={{ opacity: paperOpacity }} aria-hidden="true" />
        <div className="reader-paper"><div className="reader-render-target" ref={reader.targetRef} /></div>
      </section>
      {mobile && <nav className="reader-mobile-navigation" aria-label="翻页">
        <button type="button" aria-label="上一页" onClick={reader.previous}>‹ 上一页</button>
        <span>滑动/两侧翻页<br />点中间收起</span>
        <button type="button" aria-label="下一页" onClick={reader.next}>下一页 ›</button>
      </nav>}
      {pendingChapter && <ConfirmDialog
        title={`跳转到${pendingChapter.label}？`}
        message="将离开当前阅读位置。"
        onCancel={() => setPendingChapter(undefined)}
        onConfirm={() => { jumpTo(pendingChapter.href); setPendingChapter(undefined); }}
      />}
    </main>
  );
}



