import { useState } from "react";
import type { Bookmark } from "../../domain/models";

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  currentCfi?: string;
  onCreate(cfi: string): void;
  onJump(cfi: string): void;
  onDelete(id: string): void;
  onRename?(id: string, name: string): void;
}

export function BookmarkPanel({ bookmarks, currentCfi, onCreate, onJump, onDelete, onRename }: BookmarkPanelProps) {
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  return (
    <section className="bookmark-panel" aria-label="书签">
      <div className="bookmark-panel__header"><h3>书签</h3><button type="button" disabled={!currentCfi} onClick={() => currentCfi && onCreate(currentCfi)}>添加书签</button></div>
      {bookmarks.map((bookmark) => (
        <div className="bookmark-panel__item" key={bookmark.id}>
          {editingId === bookmark.id && onRename ? <>
            <input aria-label="书签名称" value={name} onChange={(event) => setName(event.target.value)} />
            <button type="button" aria-label="保存书签名称" onClick={() => { onRename(bookmark.id, name); setEditingId(undefined); }}>保存</button>
          </> : <button type="button" onClick={() => onJump(bookmark.cfi)}>{bookmark.name || (bookmark.chapterPage && bookmark.chapterPageTotal ? `${bookmark.chapterLabel} · 第 ${bookmark.chapterPage} / ${bookmark.chapterPageTotal} 页` : bookmark.chapterLabel)}</button>}
          {onRename && <button type="button" aria-label={`重命名书签 ${bookmark.name ?? bookmark.chapterLabel}`} onClick={() => { setEditingId(bookmark.id); setName(bookmark.name ?? ""); }}>✎</button>}
          <button type="button" aria-label={`删除书签 ${bookmark.chapterLabel}`} onClick={() => onDelete(bookmark.id)}>×</button>
          {bookmark.excerpt && <p className="bookmark-panel__excerpt">{bookmark.excerpt}</p>}
        </div>
      ))}
    </section>
  );
}
