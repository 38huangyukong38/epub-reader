import type { BackgroundImage, BookReaderAppearance } from "../domain/models";
import type { ReaderRepository } from "../repositories/readerRepository";

export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
export const ALLOWED_BACKGROUND_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAllowedBackgroundImage(file: File): boolean {
  return ALLOWED_BACKGROUND_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_BACKGROUND_BYTES;
}

export class BackgroundImageService {
  constructor(private readonly repository: ReaderRepository, private readonly createId: () => string = () => crypto.randomUUID()) {}

  async setBackground(bookId: string, file: File): Promise<void> {
    if (!isAllowedBackgroundImage(file)) throw new Error("请选择不超过 10 MB 的 JPEG、PNG 或 WebP 图片");
    const image: BackgroundImage = { id: this.createId(), bookId, blob: file, mimeType: file.type as BackgroundImage["mimeType"], createdAt: Date.now() };
    const appearance: BookReaderAppearance = { bookId, backgroundImageId: image.id, backgroundEnabled: true, overlayOpacity: 0.55 };
    await this.repository.replaceBackground(image, appearance);
  }

  async setEnabled(bookId: string, enabled: boolean): Promise<void> {
    const bundle = await this.repository.getReaderBundle(bookId);
    if (!bundle.image) return;
    await this.repository.replaceBackground(bundle.image, { ...(bundle.appearance ?? { bookId, overlayOpacity: 0.55 }), backgroundImageId: bundle.image.id, backgroundEnabled: enabled });
  }

  async setOverlayOpacity(bookId: string, overlayOpacity: number): Promise<void> {
    const bundle = await this.repository.getReaderBundle(bookId);
    if (!bundle.image) return;
    await this.repository.replaceBackground(bundle.image, { ...(bundle.appearance ?? { bookId, backgroundEnabled: true }), backgroundImageId: bundle.image.id, overlayOpacity: Math.min(0.9, Math.max(0.2, overlayOpacity)) });
  }

  async reset(bookId: string): Promise<void> { await this.repository.clearBackground(bookId); }
}
