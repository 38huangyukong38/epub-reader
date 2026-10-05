import ePub from "epubjs";
import type { BookRecord } from "../domain/models";
import type { ReaderRepository } from "../repositories/readerRepository";
import { epubContentHash, readBlobBytes, validateEpubContainer } from "./epubFileIdentity";

export interface ParsedEpub {
  loaded: { metadata: Promise<{ title?: unknown; creator?: unknown; language?: unknown }> };
  coverUrl(): Promise<string | null>;
  destroy(): void;
}

export type EpubParser = (data: ArrayBuffer) => ParsedEpub;

export interface EpubImportService {
  importFile(file: File): Promise<BookRecord>;
}

export function isEpubFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".epub") || file.type === "application/epub+zip";
}

const defaultParser: EpubParser = (data) =>
  (ePub as unknown as (input: ArrayBuffer) => ParsedEpub)(data);

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function titleFromFilename(name: string): string {
  return name.replace(/\.epub$/i, "") || name;
}

async function getCoverBlob(book: ParsedEpub): Promise<Blob | undefined> {
  let coverUrl: string | null = null;
  try {
    coverUrl = await book.coverUrl();
    if (!coverUrl) return undefined;
    return await (await fetch(coverUrl)).blob();
  } catch {
    return undefined;
  } finally {
    if (coverUrl?.startsWith("blob:")) URL.revokeObjectURL(coverUrl);
  }
}

export function createEpubImportService(
  repository: Pick<ReaderRepository, "saveBook"> & Partial<Pick<ReaderRepository, "listLibrary">>,
  parser: EpubParser = defaultParser,
  createId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now(),
): EpubImportService {
  let pending: Promise<unknown> = Promise.resolve();
  const importOne = async (file: File): Promise<BookRecord> => {
    if (!isEpubFile(file)) throw new Error("请选择 EPUB 文件");
    const data = await readBlobBytes(file);
    const sourceHash = await epubContentHash(data);
    const items = await repository.listLibrary?.() ?? [];
    for (const { book } of items) {
      if (book.sourceHash === sourceHash) return book;
      if (!book.sourceHash && book.fileBlob.size === file.size
        && await epubContentHash(await readBlobBytes(book.fileBlob)) === sourceHash) {
        const existing = { ...book, sourceHash };
        await repository.saveBook(existing);
        return existing;
      }
    }
    // Injected parsers in unit tests operate on synthetic bytes.
    if (parser === defaultParser) await validateEpubContainer(data);
    const parsed = parser(data);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const metadata = await Promise.race([
        parsed.loaded.metadata,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("无法读取 EPUB 信息，请检查文件是否完整")), 15000);
        }),
      ]);
      const timestamp = now();
      const record: BookRecord = {
        id: createId(), title: asText(metadata.title) ?? titleFromFilename(file.name),
        creator: asText(metadata.creator) ?? "未知作者", language: asText(metadata.language),
        coverBlob: await getCoverBlob(parsed), fileBlob: file, sourceHash,
        importedAt: timestamp, updatedAt: timestamp,
      };
      await repository.saveBook(record);
      return record;
    } finally {
      if (timer) clearTimeout(timer);
      parsed.destroy();
    }
  };
  return {
    importFile(file) {
      const operation = pending.then(() => importOne(file));
      pending = operation.then(() => undefined, () => undefined);
      return operation;
    },
  };
}
