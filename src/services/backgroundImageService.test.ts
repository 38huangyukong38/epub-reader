import { deleteDB } from "idb";
import { createReaderRepository } from "../repositories/readerRepository";
import { BackgroundImageService, isAllowedBackgroundImage } from "./backgroundImageService";

it.each([
  ["image/jpeg", 10 * 1024 * 1024, true],
  ["image/png", 10 * 1024 * 1024 + 1, false],
  ["image/gif", 100, false],
])("validates background files", (type, size, expected) => {
  expect(isAllowedBackgroundImage(new File([new Uint8Array(size)], "background", { type }))).toBe(expected);
});

it("does not change a different book appearance", async () => {
  await deleteDB("local-epub-reader");
  const repository = createReaderRepository();
  const service = new BackgroundImageService(repository, () => "image-a");
  await service.setBackground("book-a", new File(["png"], "background.png", { type: "image/png" }));
  expect((await repository.getReaderBundle("book-a")).appearance?.backgroundEnabled).toBe(true);
  expect((await repository.getReaderBundle("book-b")).appearance).toBeUndefined();
});
