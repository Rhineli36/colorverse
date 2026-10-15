// One authenticated, decoded image shared by mounted views of the same account.
// Object URLs never survive their last consumer or an account change.
type Entry = {
  refs: number;
  controller: AbortController;
  url: string;
  ready: Promise<string>;
};
const entries = new Map<string, Entry>();
export function clearPrivateImages() {
  for (const entry of entries.values()) {
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = "";
  }
  entries.clear();
}
export function acquirePrivateImage(
  key: string,
  load: (signal: AbortSignal) => Promise<Blob>,
) {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      refs: 0,
      controller: new AbortController(),
      url: "",
      ready: Promise.resolve(""),
    };
    const current = entry;
    entries.set(key, current);
    current.ready = Promise.resolve()
      .then(() => load(current.controller.signal))
      .then(async (blob) => {
        if (current.controller.signal.aborted || !current.refs)
          throw new Error("IMAGE_RELEASED");
        current.url = URL.createObjectURL(blob);
        const image = new Image();
        image.src = current.url;
        await image.decode();
        if (current.controller.signal.aborted || !current.refs)
          throw new Error("IMAGE_RELEASED");
        return current.url;
      })
      .catch((error) => {
        if (current.url) URL.revokeObjectURL(current.url);
        current.url = "";
        if (entries.get(key) === current) entries.delete(key);
        throw error;
      });
  }
  entry.refs++;
  const current = entry;
  let released = false;
  return {
    ready: current.ready,
    release() {
      if (released) return;
      released = true;
      if (--current.refs === 0) {
        current.controller.abort();
        if (current.url) URL.revokeObjectURL(current.url);
        current.url = "";
        if (entries.get(key) === current) entries.delete(key);
      }
    },
  };
}
