import type { LibraryItem } from "../../repositories/readerRepository";
import { BookCard } from "./BookCard";
import { ImportButton } from "./ImportButton";
import { StatusMessage } from "../common/StatusMessage";
import { ErrorDialog } from "../common/ErrorDialog";
import { isEpubFile } from "../../services/epubImportService";
import { useState } from "react";

interface LibraryPageProps {
  items: LibraryItem[];
  loading: boolean;
  error?: string;
  onImport(files: File[]): Promise<void> | void;
  onOpen(bookId: string): void;
  onRemove(bookId: string): void;
  onReorder(bookIds: string[]): void;
}

const deleteMessage = "删除后将移除这本书的阅读记录、书签和背景图。继续吗？";

export function LibraryPage({ items, loading, error, onImport, onOpen, onRemove, onReorder }: LibraryPageProps) {
  const [dropError, setDropError] = useState<string>();
  const [draggedBookId, setDraggedBookId] = useState<string>();
  const confirmRemove = (bookId: string) => {
    if (window.confirm(deleteMessage)) onRemove(bookId);
  };

  return (
    <main className="library-page" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files);
      if (!files.length) return;
      if (files.some((file) => !isEpubFile(file))) { setDropError("只能导入 EPUB 文件"); return; }
      setDropError(undefined);
      void onImport(files);
    }}>
      <header className="library-page__header">
        <div>
          <p className="library-page__eyebrow">本地 EPUB 阅读器</p>
          <h1>本地书架</h1>
        </div>
        <ImportButton onImport={onImport} />
      </header>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {loading ? (
        <p className="library-page__status">正在加载书架…</p>
      ) : items.length === 0 ? (
        <section className="library-page__empty" aria-label="空书架">
          <h2>书架还是空的</h2>
          <p>从页面顶部导入本地 EPUB 文件，开始离线阅读。</p>
        </section>
      ) : (
        <section className="library-page__grid" aria-label="图书列表">
          {items.map((item) => (
            <BookCard key={item.book.id} item={item} onOpen={onOpen} onRemove={confirmRemove} onDragStart={setDraggedBookId} onDrop={(targetId) => {
              if (!draggedBookId || draggedBookId === targetId) return;
              const ids = items.map((entry) => entry.book.id);
              const sourceIndex = ids.indexOf(draggedBookId);
              const targetIndex = ids.indexOf(targetId);
              ids.splice(sourceIndex, 1);
              ids.splice(targetIndex, 0, draggedBookId);
              onReorder(ids);
              setDraggedBookId(undefined);
            }} />
          ))}
        </section>
      )}
      {dropError && <ErrorDialog title="导入失败" message={dropError} onClose={() => setDropError(undefined)} />}
    </main>
  );
}
