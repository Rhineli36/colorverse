import { afterEach, describe, expect, it, vi } from "vitest";
import { requestDeadline } from "../apps/web/src/features/auth/request-deadline";
import { classroomRequestTimeout } from "../apps/web/src/features/classroom/cloud-request";
import {
  handleShowcaseCloud,
  uploadAssignmentImages,
} from "../apps/worker/src/showcase-cloud";

function encodedImage(
  kind: "png" | "jpeg" | "webp",
  width: number,
  height: number,
) {
  const bytes = new Uint8Array(32),
    view = new DataView(bytes.buffer);
  if (kind === "png") {
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    view.setUint32(16, width);
    view.setUint32(20, height);
  } else if (kind === "jpeg") {
    bytes.set([255, 216, 255, 192, 0, 17, 8]);
    view.setUint16(7, height);
    view.setUint16(9, width);
  } else {
    bytes.set(new TextEncoder().encode("RIFF"));
    bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
    for (let i = 0; i < 3; i++) {
      bytes[24 + i] = ((width - 1) >>> (8 * i)) & 255;
      bytes[27 + i] = ((height - 1) >>> (8 * i)) & 255;
    }
  }
  return bytes;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("upload reliability", () => {
  it("gives image uploads two minutes while keeping reads bounded", () => {
    expect(classroomRequestTimeout({ body: new FormData() })).toBe(120000);
    expect(classroomRequestTimeout({ body: new Blob() })).toBe(120000);
    expect(classroomRequestTimeout({})).toBe(25000);
  });
  it("preserves cancellation and timeout on browsers without AbortSignal static APIs", () => {
    vi.useFakeTimers();
    vi.stubGlobal("AbortSignal", {});
    const user = new AbortController();
    const upload = requestDeadline(120000, user.signal);
    vi.advanceTimersByTime(25001);
    expect(upload.aborted).toBe(false);
    user.abort();
    expect(upload.aborted).toBe(true);
    const another = requestDeadline(25);
    vi.advanceTimersByTime(25);
    expect(another.reason.name).toBe("TimeoutError");
  });
  it("checks actual file signatures, dimensions and aggregate size before upload", async () => {
    vi.stubEnv("VITE_CLASSROOM_NEXT", "true");
    vi.resetModules();
    const { validateWorkImages: validate } =
      await import("../apps/web/src/features/classroom/cloud-image-upload");
    const png = new Uint8Array(32);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 4000);
    view.setUint32(20, 4000);
    await expect(
      validate([new File([png], "painting.png")]),
    ).resolves.toBeUndefined();
    await expect(
      validate([new File([encodedImage("jpeg", 4000, 4000)], "drawing.jpg")]),
    ).resolves.toBeUndefined();
    await expect(
      validate([new File([new Uint8Array(30)], "heic-renamed.jpg")]),
    ).rejects.toThrow("改文件后缀无效");
    view.setUint32(16, 6000);
    view.setUint32(20, 6000);
    await expect(validate([new File([png], "large.png")])).rejects.toThrow(
      "3200 万像素",
    );
    await expect(
      validate([new File([new Uint8Array(15 * 1024 * 1024 + 1)], "big.png")]),
    ).rejects.toThrow("15 MB");
    await expect(
      validate(Array.from({ length: 7 }, () => new File([png], "many.png"))),
    ).rejects.toThrow("六张");
  });
  it.each(["png", "jpeg", "webp"] as const)(
    "accepts up to 32 MP and rejects excess dimensions for %s without decoding",
    async (kind) => {
      vi.stubEnv("VITE_CLASSROOM_NEXT", "true");
      vi.resetModules();
      const { validateWorkImages: validate } =
        await import("../apps/web/src/features/classroom/cloud-image-upload");
      for (const [w, h] of [
        [5000, 6000],
        [8000, 4000],
        [8192, 2000],
      ])
        await expect(
          validate([new File([encodedImage(kind, w, h)], `drawing.${kind}`)]),
        ).resolves.toBeUndefined();
      await expect(
        validate([
          new File([encodedImage(kind, 8000, 4001)], `drawing.${kind}`),
        ]),
      ).rejects.toThrow("3200 万像素");
      await expect(
        validate([
          new File([encodedImage(kind, 8193, 1000)], `drawing.${kind}`),
        ]),
      ).rejects.toThrow("8192");
      await expect(
        validate([new File([new Uint8Array([255, 216, 255])], "broken.jpg")]),
      ).rejects.toThrow("尺寸无效");
    },
  );
  it("retains the legacy 16 MP limit", async () => {
    vi.stubEnv("VITE_CLASSROOM_NEXT", "false");
    vi.resetModules();
    const { validateWorkImages } =
      await import("../apps/web/src/features/classroom/cloud-image-upload");
    await expect(
      validateWorkImages([
        new File([encodedImage("png", 5000, 4000)], "large.png"),
      ]),
    ).rejects.toThrow("1600 万像素");
  });
  it("applies the cloud pixel limit on the server before image transformation or storage", async () => {
    const transform = vi.fn(() => ({
      output: async () => ({
        response: () => new Response(new Uint8Array([1, 2, 3])),
      }),
    }));
    const storage = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", storage);
    const env = {
      CLASSROOM_NEXT: "true",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SECRET_KEY: "test",
      IMAGES: { input: () => ({ transform }) },
    };
    const identity = {
      issuer: "test",
      subject: "student",
      email: "test@example.test",
    };
    const file = (w: number, h: number) =>
      new File([encodedImage("png", w, h)], "painting.png");
    await expect(
      uploadAssignmentImages(env, identity, "req", [file(8000, 4000)], []),
    ).resolves.toHaveLength(1);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(storage).toHaveBeenCalledTimes(1);
    await expect(
      uploadAssignmentImages(env, identity, "req2", [file(8000, 4001)], []),
    ).rejects.toMatchObject({ code: "IMAGE_DIMENSIONS" });
    await expect(
      uploadAssignmentImages(
        { ...env, CLASSROOM_NEXT: "false" },
        identity,
        "req3",
        [file(5000, 4000)],
        [],
      ),
    ).rejects.toMatchObject({ code: "IMAGE_DIMENSIONS" });
    expect(transform).toHaveBeenCalledTimes(1);
    expect(storage).toHaveBeenCalledTimes(1);
  });
  it("does not reserve a database connection while a mobile body is still streaming", async () => {
    let finish!: () => void;
    const bytes = new TextEncoder().encode("malformed");
    const request = new Request("https://test/api", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=x" },
      body: new ReadableStream({
        start(c) {
          c.enqueue(bytes);
          finish = () => c.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    const factory = vi.fn();
    const pending = handleShowcaseCloud(
      request,
      {
        CLASSROOM_NEXT: "true",
        HYPERDRIVE_WRITER: { connectionString: "test" },
        SUPABASE_SECRET_KEY: "test",
        IMAGES: {},
      } as never,
      { issuer: "test", subject: "test", email: "test@example.test" },
      "test",
      "works",
      factory,
    );
    const failure = expect(pending).rejects.toMatchObject({
      status: 400,
      code: "INVALID_INPUT",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(factory).not.toHaveBeenCalled();
    finish();
    await failure;
    expect(factory).not.toHaveBeenCalled();
  });
});
