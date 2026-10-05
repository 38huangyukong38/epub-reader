interface ReaderToolbarProps {
  title: string;
  progression: number;
  chapterLabel?: string;
  chapterPage?: number;
  chapterPageTotal?: number;
  onBack(): void;
  onPrevious(): void;
  onNext(): void;
  sidebarVisible?: boolean;
  onToggleSidebar?(): void;
}

export function ReaderToolbar({ title, progression, chapterLabel, chapterPage, chapterPageTotal, onBack, onPrevious, onNext, sidebarVisible = true, onToggleSidebar }: ReaderToolbarProps) {
  return (
    <header className="reader-toolbar">
      <button type="button" className="reader-toolbar__back" aria-label="返回书架" onClick={onBack}>←</button>
      <strong className="reader-toolbar__title">{title}</strong>
      {chapterLabel && <span className="reader-toolbar__chapter">{chapterLabel}</span>}
      {chapterPage && chapterPageTotal && <span className="reader-toolbar__page">第 {chapterPage} / {chapterPageTotal} 页</span>}
      <span className="reader-toolbar__progress">{Math.round(progression * 100)}%</span>
      {onToggleSidebar && <button type="button" className="reader-toolbar__sidebar-toggle" aria-expanded={sidebarVisible} aria-controls="reader-sidebar" aria-label={sidebarVisible ? "隐藏目录栏" : "显示目录栏"} title={sidebarVisible ? "隐藏目录栏" : "显示目录栏"} onClick={onToggleSidebar}>☰</button>}
      <button type="button" className="reader-toolbar__previous" aria-label="上一页" onClick={onPrevious}>‹</button>
      <button type="button" className="reader-toolbar__next" aria-label="下一页" onClick={onNext}>›</button>
    </header>
  );
}

