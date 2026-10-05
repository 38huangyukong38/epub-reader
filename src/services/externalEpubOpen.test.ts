import { subscribeExternalEpubs, type ExternalEpubTransport, type ExternalEpubRequest } from "./externalEpubOpen";

it("drains a cold-start file and later notifications in order", async () => {
  const queue: ExternalEpubRequest[] = [{ id: "first", name: "中文 图书.epub" }];
  let notify = () => undefined;
  const transport: ExternalEpubTransport = {
    take: async () => queue.splice(0), read: async () => new Uint8Array([1, 2, 3]), complete: vi.fn().mockResolvedValue(undefined),
    listen: async (callback) => { notify = callback as () => undefined; return vi.fn(); },
  };
  const opened: string[] = [];
  const error = vi.fn();
  const stop = subscribeExternalEpubs(async (file) => { opened.push(file.name); }, error, transport);
  await vi.waitFor(() => expect(opened).toEqual(["中文 图书.epub"]));
  queue.push({ id: "second", name: "second.epub" });
  notify();
  await vi.waitFor(() => expect(opened).toEqual(["中文 图书.epub", "second.epub"]));
  expect(error).not.toHaveBeenCalled();
  stop();
});

it("reports an inaccessible file and continues with the next valid request", async () => {
  const queue = [{ id: "bad", name: "bad.epub", error: "文件不可访问" }, { id: "good", name: "good.epub" }];
  const complete = vi.fn().mockResolvedValue(undefined);
  const transport: ExternalEpubTransport = { take: async () => queue.splice(0), read: async () => new Uint8Array([1]), complete, listen: async () => () => undefined };
  const open = vi.fn().mockResolvedValue(undefined);
  const error = vi.fn();
  const stop = subscribeExternalEpubs(open, error, transport);
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(error).toHaveBeenCalledWith("文件不可访问");
  expect(complete).toHaveBeenCalledTimes(2);
  stop();
});

it("does not drain startup requests after immediate cleanup", async () => {
  const take = vi.fn().mockResolvedValue([]);
  const cleanup = vi.fn();
  const transport: ExternalEpubTransport = { take, read: async () => new Uint8Array(), complete: async () => undefined, listen: async () => cleanup };
  const stop = subscribeExternalEpubs(vi.fn(), vi.fn(), transport);
  stop();
  await Promise.resolve();
  expect(take).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledOnce();
});
