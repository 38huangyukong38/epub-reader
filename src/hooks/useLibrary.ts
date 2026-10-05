import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createReaderRepository, type LibraryItem, type ReaderRepository } from "../repositories/readerRepository";
import { createEpubImportService } from "../services/epubImportService";
import type { BookRecord } from "../domain/models";

export interface UseLibraryResult {
  items: LibraryItem[];
  loading: boolean;
  error?: string;
  importFiles(files: File[]): Promise<void>;
  importAndOpen(file: File): Promise<BookRecord>;
  removeBook(bookId: string): Promise<void>;
  reorderBooks(bookIds: string[]): Promise<void>;
}

export function useLibrary(repository?: ReaderRepository): UseLibraryResult {
  const repositoryRef = useRef(repository ?? createReaderRepository());
  const activeRepository = repositoryRef.current;
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await activeRepository.listLibrary());
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取本地书架");
    } finally {
      setLoading(false);
    }
  }, [activeRepository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const importer = useMemo(() => createEpubImportService(activeRepository), [activeRepository]);

  const importFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    const results = await Promise.allSettled(files.map((file) => importer.importFile(file)));
    const failed = results.find((result) => result.status === "rejected");
    await reload();
    if (failed?.status === "rejected") {
      setError(failed.reason instanceof Error ? failed.reason.message : "导入 EPUB 失败");
    }
  }, [importer, reload]);

  const removeBook = useCallback(async (bookId: string) => {
    try {
      await activeRepository.deleteBook(bookId);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除图书失败");
    }
  }, [activeRepository, reload]);

  const importAndOpen = useCallback(async (file: File) => {
    const book = await importer.importFile(file);
    await reload();
    return book;
  }, [importer, reload]);

  const reorderBooks = useCallback(async (bookIds: string[]) => {
    try {
      await activeRepository.saveLibraryOrder(bookIds);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法保存书架顺序");
    }
  }, [activeRepository, reload]);

  return { items, loading, error, importFiles, importAndOpen, removeBook, reorderBooks };
}
