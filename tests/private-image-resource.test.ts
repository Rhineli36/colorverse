import { afterEach, expect, it, vi } from "vitest";
import {
  acquirePrivateImage,
  clearPrivateImages,
} from "../apps/web/src/features/classroom/private-image-resource";
afterEach(() => {
  clearPrivateImages();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("shares one decoded image, retains it until the last view closes and cancels pending reads", async () => {
  const decode = vi.fn(async () => {}),
    revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = decode;
    },
  );
  const load = vi.fn(async () => new Blob(["image"]));
  const a = acquirePrivateImage("actorA/image1", load),
    b = acquirePrivateImage("actorA/image1", load);
  expect(await a.ready).toBe(await b.ready);
  expect(load).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);
  a.release();
  a.release();
  expect(revoke).not.toHaveBeenCalled();
  b.release();
  expect(revoke).toHaveBeenCalledTimes(1);
  let signal: AbortSignal | undefined;
  const c = acquirePrivateImage("pending", async (s) => {
    signal = s;
    return new Blob(["i"]);
  });
  c.release();
  await expect(c.ready).rejects.toThrow("IMAGE_RELEASED");
  expect(signal?.aborted).toBe(true);
});
it("rejects invalid image decoding, allows retry, and clears all URLs when an account changes", async () => {
  const decode = vi
    .fn()
    .mockRejectedValueOnce(new Error("invalid image"))
    .mockResolvedValue(undefined);
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = decode;
    },
  );
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}),
    load = vi.fn(async () => new Blob(["i"]));
  const a = acquirePrivateImage("A", load);
  await expect(a.ready).rejects.toThrow("invalid image");
  a.release();
  const b = acquirePrivateImage("A", load),
    c = acquirePrivateImage("B", load);
  expect(await b.ready).not.toBe(await c.ready);
  expect(load).toHaveBeenCalledTimes(3);
  clearPrivateImages();
  expect(revoke).toHaveBeenCalledTimes(3);
  b.release();
  c.release();
  expect(revoke).toHaveBeenCalledTimes(3);
});
