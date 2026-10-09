import { inspectPackage } from "@colorverse/package-io";
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const report = await inspectPackage(new Uint8Array(event.data));
    self.postMessage({ ok: true, report });
  } catch (e) {
    self.postMessage({
      ok: false,
      message: e instanceof Error ? e.message : "导入失败",
    });
  }
};
