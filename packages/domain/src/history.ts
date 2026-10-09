import type { PlanetDocument } from "@colorverse/contracts";
export interface Change {
  path: (string | number)[];
  before: unknown;
  after: unknown;
}
export function changes(
  before: unknown,
  after: unknown,
  path: (string | number)[] = [],
): Change[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    Array.isArray(before) === Array.isArray(after)
  ) {
    if (Array.isArray(before) && Array.isArray(after)) {
      if (before.length !== after.length) return [{ path, before, after }];
      return before.flatMap((v, i) => changes(v, after[i], [...path, i]));
    }
    const b = before as Record<string, unknown>,
      a = after as Record<string, unknown>;
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].flatMap((k) =>
      changes(b[k], a[k], [...path, k]),
    );
  }
  return [{ path, before, after }];
}
export function applyChanges(
  document: PlanetDocument,
  patch: Change[],
  direction: "before" | "after",
): PlanetDocument {
  const next = structuredClone(document);
  for (const p of patch) {
    let obj: Record<string | number, unknown> = next as unknown as Record<
      string,
      unknown
    >;
    for (const key of p.path.slice(0, -1))
      obj = obj[key] as Record<string | number, unknown>;
    if (p[direction] === undefined) delete obj[p.path.at(-1)!];
    else obj[p.path.at(-1)!] = structuredClone(p[direction]);
  }
  return next;
}
