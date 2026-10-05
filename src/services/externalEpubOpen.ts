import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ExternalEpubRequest { id: string; name: string; size?: number; error?: string | null }
export interface ExternalEpubTransport {
  take(): Promise<ExternalEpubRequest[]>;
  read(request: ExternalEpubRequest): Promise<Uint8Array>;
  complete(request: ExternalEpubRequest): Promise<void>;
  listen(available: () => void): Promise<() => void>;
  close?(): void;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __readerExternalFilesReady?: boolean;
    __readerExternalPortToken?: string;
    __readerExternalPortConnected?: boolean;
  }
}

function androidTransport(): ExternalEpubTransport {
  let port: MessagePort | undefined;
  let nextId = 0;
  let available: () => void = () => undefined;
  let connect: (port: MessagePort) => void = () => undefined;
  const connected = new Promise<MessagePort>((resolve) => { connect = resolve; });
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  const receivePort = (event: MessageEvent) => {
    const token = window.__readerExternalPortToken;
    if (!token || event.data !== `reader-external-port:${token}` || event.ports.length !== 1) return;
    port?.close();
    port = event.ports[0];
    port.onmessage = (message) => {
      try {
        const reply = JSON.parse(message.data);
        if (reply.kind === "available") { available(); return; }
        const callback = pending.get(reply.requestId);
        if (!callback) return;
        pending.delete(reply.requestId);
        if (reply.error) callback.reject(new Error(reply.error));
        else callback.resolve(reply.result);
      } catch { /* Ignore unrelated channel messages. */ }
    };
    port.start();
    window.__readerExternalPortConnected = true;
    connect(port);
    available();
  };

  const request = async <T>(op: string, values: Record<string, unknown> = {}): Promise<T> => {
    const active = port ?? await connected;
    const requestId = ++nextId;
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: (value) => resolve(value as T), reject });
      active.postMessage(JSON.stringify({ requestId, op, ...values }));
    });
  };

  return {
    take: () => request<ExternalEpubRequest[]>("take"),
    async read(file) {
      const bytes = new Uint8Array(file.size ?? 0);
      let offset = 0;
      do {
        const part = await request<{ data: string; done: boolean }>("read", { id: file.id, offset });
        const decoded = Uint8Array.from(atob(part.data), (character) => character.charCodeAt(0));
        if (offset + decoded.length > bytes.length || (!decoded.length && !part.done)) throw new Error("收到的 EPUB 数据不完整");
        bytes.set(decoded, offset);
        offset += decoded.length;
        if (part.done) break;
      } while (offset < bytes.length);
      if (offset !== bytes.length) throw new Error("收到的 EPUB 数据不完整");
      return bytes;
    },
    complete: async (file) => { await request("complete", { id: file.id }); },
    async listen(callback) {
      available = callback;
      window.addEventListener("message", receivePort);
      window.__readerExternalFilesReady = true;
      return () => window.removeEventListener("message", receivePort);
    },
    close() {
      window.__readerExternalFilesReady = false;
      window.__readerExternalPortConnected = false;
      port?.close();
      for (const callback of pending.values()) callback.reject(new Error("文件读取连接已关闭"));
      pending.clear();
    },
  };
}

function nativeTransport(): ExternalEpubTransport | undefined {
  if (!window.__TAURI_INTERNALS__) return;
  if (/Android/i.test(navigator.userAgent)) return androidTransport();
  return {
    take: () => invoke<ExternalEpubRequest[]>("take_external_epubs"),
    read: async (request) => new Uint8Array(await invoke<ArrayBuffer>("read_external_epub", { id: request.id })),
    complete: async () => undefined,
    listen: async (callback) => listen("external-epub-open", callback),
  };
}

export function subscribeExternalEpubs(
  open: (file: File) => Promise<void>,
  reportError: (message: string) => void,
  transport: ExternalEpubTransport | undefined = nativeTransport(),
): () => void {
  if (!transport) return () => undefined;
  let disposed = false;
  let draining = false;
  let requested = false;
  let stopListening: (() => void) | undefined;
  const drain = async () => {
    if (disposed) return;
    if (draining) { requested = true; return; }
    draining = true;
    try {
      do {
        requested = false;
        const files = await transport.take();
        if (disposed) break;
        for (const incoming of files) {
          try {
            if (incoming.error) throw new Error(incoming.error);
            const bytes = await transport.read(incoming);
            if (!disposed) await open(new File([new Uint8Array(bytes)], incoming.name, { type: "application/epub+zip" }));
          } catch (reason) {
            if (!disposed) reportError(reason instanceof Error ? reason.message : String(reason));
          } finally {
            await transport.complete(incoming).catch(() => undefined);
          }
        }
        if (!files.length && !requested) break;
      } while (!disposed);
    } catch (reason) {
      if (!disposed) reportError(reason instanceof Error ? reason.message : String(reason));
    } finally { draining = false; }
  };
  void transport.listen(() => { void drain(); }).then((cleanup) => {
    if (disposed) { cleanup(); return; }
    stopListening = cleanup;
    void drain();
  }).catch((reason) => { if (!disposed) reportError(String(reason)); });
  return () => { disposed = true; stopListening?.(); transport.close?.(); };
}
