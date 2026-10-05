export interface EpubMarkupBook {
  archive?: { handleResponse?(markup: string, type: string): unknown };
}

export function repairMissingImageAlt(markup: string): string {
  // Match whole attribute values, so text such as title="an alt description"
  // stays intact. Only malformed image alt attributes receive an empty value.
  return markup.replace(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, (tag) =>
    tag.replace(/(\s+)([^\s"'<>/=]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g,
      (attribute, space: string, name: string, value: string | undefined) =>
        name.toLowerCase() === "alt" && value === undefined ? `${space}${name}=""` : attribute));
}

function hasXmlError(value: unknown): value is Document {
  const document = value as Document | undefined;
  return Boolean(document?.getElementsByTagName?.("parsererror").length);
}

export function installEpubMarkupCompatibility(book: EpubMarkupBook): void {
  const archive = book.archive;
  if (!archive?.handleResponse) return;
  // Intercept the shared archive parser, so location generation and rendering
  // both see the same repaired chapter, even when their loaders were bound early.
  const originalResponse = archive.handleResponse.bind(archive);
  archive.handleResponse = (source, type) => {
    const document = originalResponse(source, type);
    if (type !== "xhtml" || !hasXmlError(document)) return document;
    const repaired = repairMissingImageAlt(source);
    if (repaired === source) return document;
    const compatible = new DOMParser().parseFromString(repaired, "application/xhtml+xml");
    return hasXmlError(compatible) ? document : compatible;
  };
}
