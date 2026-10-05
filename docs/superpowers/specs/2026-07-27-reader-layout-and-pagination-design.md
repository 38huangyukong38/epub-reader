# Reader Layout and Pagination Design

## Scope

Improve the Windows reader page with a centered chapter-navigation confirmation dialog, a window-wide reading background, dynamic book pagination, and richer bookmark location labels. Preserve existing books, reading state, bookmarks, and background images.

## Layout

- Render the chapter-navigation confirmation dialog through a fixed, full-window overlay. Its dialog is centered in the visible application window and is unaffected by document or sidebar scrolling.
- Put an enabled reading background image on the reader-page root, behind the header, sidebar, and content area.
- Use translucent surfaces for the toolbar, sidebar, and rendered reading page so the image remains visible without reducing navigation or text legibility.
- Keep the existing independent sidebar scrolling and fixed reading area.

## Pagination

- Display `第 X / Y 页` in the toolbar before the navigation controls. X and Y describe the current chapter, not an invented whole-book total.
- Derive X and Y from the current EPUB rendition and current layout, rather than from a fixed percentage.
- Recalculate pagination after a font, line-height, or viewport change. The UI may show a short calculating state while the reader retains its current CFI location.
- If the EPUB engine cannot calculate pagination for a document, omit the page label rather than showing invented values.

## Bookmarks

- Persist the current chapter page number and chapter total page count with every new bookmark when available.
- Render the actual EPUB table-of-contents title, followed by the page label. Example: `雨夜来信 · 第 18 / 342 页`.
- Existing bookmarks retain their chapter title and excerpt. They have no page label until a newly created bookmark supplies pagination data.

## Storage Migration

- Increment the IndexedDB schema version and create missing background-image stores during upgrade.
- Do not recreate the database or clear existing stores.
- Surface a specific save error to the user instead of presenting every write failure as a storage-capacity problem.

## Verification

- Unit test the pagination mapping and bookmark location formatting.
- Unit test schema upgrade from the pre-background-image store layout.
- Component test the centered confirmation dialog and toolbar/bookmark labels.
- Build the web app and Tauri portable executable, then manually verify an EPUB at two font sizes and after a window resize.
