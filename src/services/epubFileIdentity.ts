import JSZip from "jszip";

export async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("无法读取文件"));
    reader.readAsArrayBuffer(blob);
  });
}

export async function epubContentHash(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateEpubContainer(data: ArrayBuffer): Promise<void> {
  try {
    const zip = await JSZip.loadAsync(data);
    const container = zip.file("META-INF/container.xml");
    if (!container) throw new Error("缺少 EPUB 容器信息");
    const xml = new DOMParser().parseFromString(await container.async("string"), "text/xml");
    const path = xml.getElementsByTagNameNS("*", "rootfile")[0]?.getAttribute("full-path");
    if (xml.getElementsByTagName("parsererror").length || !path || !zip.file(path)) throw new Error("EPUB 容器信息不完整");
  } catch {
    throw new Error("无法打开该文件：不是有效的 EPUB，或文件已损坏");
  }
}
