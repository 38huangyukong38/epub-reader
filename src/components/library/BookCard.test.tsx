import { render } from "@testing-library/react";
import { vi } from "vitest";
import { BookCard } from "./BookCard";

it("releases the generated cover URL on unmount", () => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const view = render(<BookCard item={{ book: { id: "book", title: "Title", creator: "Author", coverBlob: new Blob(["cover"]), fileBlob: new Blob(["epub"]), importedAt: 1, updatedAt: 1 } }} onOpen={vi.fn()} onRemove={vi.fn()} />);
  view.unmount();
  expect(create).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith("blob:cover");
});
