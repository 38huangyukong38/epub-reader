import { useEffect, useId, useState, type CSSProperties } from "react";
import type { ReaderNavigationItem } from "../../services/epubReaderService";

interface TableOfContentsProps {
  items: ReaderNavigationItem[];
  activeHref?: string;
  onSelect(href: string): void;
}

export function TableOfContents({ items, activeHref, onSelect }: TableOfContentsProps) {
  const id = useId();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    // Moving to another chapter reveals its ancestors without overriding a
    // reader's decision to collapse the current chapter's branch.
    const findAncestors = (entries: ReaderNavigationItem[], parentPath = ""): string[] | undefined => {
      for (const [index, item] of entries.entries()) {
        const path = `${parentPath}-${index}`;
        if (item.href === activeHref) return [];
        const ancestors = findAncestors(item.subitems, path);
        if (ancestors) return [path, ...ancestors];
      }
      return undefined;
    };
    const ancestors = findAncestors(items);
    if (!ancestors?.length) return;
    setCollapsed((current) => {
      if (!ancestors.some((path) => current.has(path))) return current;
      const next = new Set(current);
      for (const path of ancestors) next.delete(path);
      return next;
    });
  }, [items, activeHref]);

  if (!items.length) return null;

  const renderItems = (entries: ReaderNavigationItem[], depth = 0, parentPath = ""): React.ReactNode => entries.map((item, index) => {
    const path = `${parentPath}-${index}`;
    const expanded = !collapsed.has(path);
    const active = item.href === activeHref;
    const childrenId = `toc-${id}${path}`;
    return (
      <li className="table-of-contents__node" key={path}>
        <div className={`table-of-contents__row${active ? " table-of-contents__row--active" : ""}`} style={{ "--toc-depth": depth } as CSSProperties}>
          {item.subitems.length > 0 ? <button
            type="button"
            className="table-of-contents__toggle"
            aria-label={`${expanded ? "收起" : "展开"}${item.label}`}
            aria-expanded={expanded}
            aria-controls={childrenId}
            onClick={() => setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(path)) next.delete(path);
              else next.add(path);
              return next;
            })}
          >{expanded ? "▾" : "▸"}</button> : <span className="table-of-contents__spacer" aria-hidden="true" />}
          <button type="button" aria-current={active ? "true" : undefined} className={`table-of-contents__item${active ? " table-of-contents__item--active" : ""}`} onClick={() => onSelect(item.href)}>{item.label}</button>
        </div>
        {item.subitems.length > 0 && <ul id={childrenId} className="table-of-contents__list" hidden={!expanded}>{renderItems(item.subitems, depth + 1, path)}</ul>}
      </li>
    );
  });

  return (
    <nav className="table-of-contents" aria-label="目录">
      <ul className="table-of-contents__list">{renderItems(items)}</ul>
    </nav>
  );
}
