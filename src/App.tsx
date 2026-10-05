import { useEffect, useRef, useState } from "react";
import { LibraryPage } from "./components/library/LibraryPage";
import { ReaderPage } from "./components/reader/ReaderPage";
import { useLibrary } from "./hooks/useLibrary";
import { useReader } from "./hooks/useReader";
import { subscribeExternalEpubs } from "./services/externalEpubOpen";
import { ErrorDialog } from "./components/common/ErrorDialog";
import "./styles/library.css";
import "./styles/reader.css";
import "./styles/mobile.css";

function ReadingView({ book, onBack }: { book: Parameters<typeof useReader>[0]; onBack(): void }) {
  const reader = useReader(book);
  return <ReaderPage title={book.title} reader={reader} onBack={onBack} />;
}

export default function App() {
  const library = useLibrary();
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [externalError, setExternalError] = useState<string>();
  const importExternalRef = useRef(library.importAndOpen);
  importExternalRef.current = library.importAndOpen;
  useEffect(() => subscribeExternalEpubs(async (file) => {
    const book = await importExternalRef.current(file);
    setActiveBookId(book.id);
  }, setExternalError), []);
  const activeBook = library.items.find((item) => item.book.id === activeBookId)?.book;

  return (
    <>
    {activeBook ? <ReadingView key={activeBook.id} book={activeBook} onBack={() => setActiveBookId(null)} /> : <LibraryPage
      items={library.items}
      loading={library.loading}
      error={library.error}
      onImport={library.importFiles}
      onOpen={setActiveBookId}
      onRemove={library.removeBook}
      onReorder={library.reorderBooks}
    />}
    {externalError && <ErrorDialog title="无法打开 EPUB" message={externalError} onClose={() => setExternalError(undefined)} />}
    </>
  );
}
