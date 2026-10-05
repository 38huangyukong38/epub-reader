export interface BookRecord {
  id: string;
  title: string;
  creator: string;
  language?: string;
  coverBlob?: Blob;
  fileBlob: Blob;
  importedAt: number;
  updatedAt: number;
  sortOrder?: number;
  sourceHash?: string;
}

export interface ReadingState {
  bookId: string;
  cfi: string;
  progression: number;
  chapterLabel: string;
  chapterPage?: number;
  chapterPageTotal?: number;
  layoutKey?: string;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  cfi: string;
  chapterLabel: string;
  chapterPage?: number;
  chapterPageTotal?: number;
  layoutKey?: string;
  name?: string;
  excerpt: string;
  createdAt: number;
}

export interface ReaderPreferences {
  key: "global";
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  theme: "light" | "dark" | "sepia";
  sidebarVisible: boolean;
  contentMargin?: number;
  paperOpacity?: number;
}

export interface BookReaderAppearance {
  bookId: string;
  backgroundImageId?: string;
  backgroundEnabled: boolean;
  overlayOpacity: number;
}

export interface BackgroundImage {
  id: string;
  bookId: string;
  blob: Blob;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  createdAt: number;
}

export const DEFAULT_APPEARANCE = {
  backgroundEnabled: false,
  overlayOpacity: 0.55,
} as const;

