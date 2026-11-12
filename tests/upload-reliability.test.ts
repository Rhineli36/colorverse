import { afterEach, describe, expect, it, vi } from "vitest";
import { requestDeadline } from "../apps/web/src/features/auth/request-deadline";
import { classroomRequestTimeout } from "../apps/web/src/features/classroom/cloud-request";
import { handleShowcaseCloud } from "../apps/worker/src/showcase-cloud";

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
      validate([new File([new Uint8Array([255, 216, 255])], "drawing.jpg")]),
    ).resolves.toBeUndefined();
    await expect(
      validate([new File([new Uint8Array(30)], "heic-renamed.jpg")]),
    ).rejects.toThrow("改文件后缀无效");
    view.setUint32(16, 5000);
    await expect(validate([new File([png], "large.png")])).rejects.toThrow(
      "1600 万像素",
    );
    await expect(
      validate([new File([new Uint8Array(15 * 1024 * 1024 + 1)], "big.png")]),
    ).rejects.toThrow("15 MB");
    await expect(
      validate(Array.from({ length: 7 }, () => new File([png], "many.png"))),
    ).rejects.toThrow("六张");
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
