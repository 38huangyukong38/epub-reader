import { installEpubMarkupCompatibility, repairMissingImageAlt } from "./epubMarkupCompatibility";

it("restores the complete XHTML chapter and image instead of an XML error panel", () => {
  const source = '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><p id="before">图前正文</p><img src="picture.jpg" alt class="illustration"/><p id="after">图后正文</p></body></html>';
  const archive = { handleResponse: (markup: string, type: string): unknown => type === "xhtml"
    ? new DOMParser().parseFromString(markup, "application/xhtml+xml") : markup };
  expect((archive.handleResponse(source, "xhtml") as Document).querySelector("parsererror")).not.toBeNull();
  const earlyLoader = (markup: string) => archive.handleResponse(markup, "xhtml");
  installEpubMarkupCompatibility({ archive });
  const restored = earlyLoader(source) as Document;
  expect(restored.querySelector("parsererror")).toBeNull();
  expect(restored.getElementById("after")?.textContent).toBe("图后正文");
  expect(restored.querySelector("img")?.getAttribute("alt")).toBe("");
  expect(restored.querySelector("img")?.getAttribute("src")).toBe("picture.jpg");
  expect(restored.querySelector("img")?.getAttribute("class")).toBe("illustration");
});

it("preserves valued attributes, quoted descriptions, valid markup and non-XHTML resources", () => {
  const valid = '<img src="picture.jpg" alt="original" title="an alt description" />';
  expect(repairMissingImageAlt(valid)).toBe(valid);
  expect(repairMissingImageAlt('<img title="an alt description" src="p.jpg" alt/>'))
    .toBe('<img title="an alt description" src="p.jpg" alt=""/>');
  const handleResponse = vi.fn<(markup: string, type: string) => string>((markup) => markup);
  const archive = { handleResponse };
  installEpubMarkupCompatibility({ archive });
  expect(archive.handleResponse(valid, "css")).toBe(valid);
  expect(handleResponse).toHaveBeenCalledWith(valid, "css");
});
