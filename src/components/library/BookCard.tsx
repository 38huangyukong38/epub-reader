import { useEffect, useState } from "react";
import type { LibraryItem } from "../../repositories/readerRepository";

interface BookCardProps {
  item: LibraryItem;
  onOpen(bookId: string): void;
  onRemove(bookId: string): void;
  onDragStart?(bookId: string): void;
  onDrop?(bookId: string): void;
}

export function BookCard({ item, onOpen, onRemove, onDragStart, onDrop }: BookCardProps) {
  const { book, state } = item;
  const progress = Math.round((state?.progression ?? 0) * 100);
  const [coverUrl, setCoverUrl] = useState<string>();

  useEffect(() => {
    if (!book.coverBlob) {
      setCoverUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(book.coverBlob);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book.coverBlob]);

  return (
    <article className="book-card" draggable={Boolean(onDragStart)} onDragStart={() => onDragStart?.(book.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop?.(book.id); }}>
      <button className="book-card__open" type="button" aria-label={`打开 ${book.title}`} onClick={() => onOpen(book.id)}>
        {coverUrl ? (
          <img className="book-card__cover" src={coverUrl} alt={`${book.title} 封面`} />
        ) : (
          <span className="book-card__cover book-card__cover--fallback" aria-hidden="true">
            {book.title.slice(0, 1)}
          </span>
        )}
        <span className="book-card__title">{book.title}</span>
        <span className="book-card__creator">{book.creator}</span>
        <span className="book-card__progress">{state ? `${progress}% · ${state.chapterLabel}` : "尚未开始阅读"}</span>
      </button>
      <button className="book-card__remove" type="button" aria-label={`删除 ${book.title}`} onClick={() => onRemove(book.id)}>
        删除
      </button>
    </article>
  );
}
