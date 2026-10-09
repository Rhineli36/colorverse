import { create } from "zustand";
import type { PlanetDocument } from "@colorverse/contracts";
import {
  changes,
  applyChanges,
  type Change,
} from "../../../../../packages/domain/src/history";
interface EditorState {
  document: PlanetDocument | null;
  revision: number;
  dirty: boolean;
  history: Change[][];
  future: Change[][];
  baseline: PlanetDocument | null;
  selectedLayerId: string | null;
  load: (p: PlanetDocument) => void;
  change: (fn: (p: PlanetDocument) => void) => void;
  begin: () => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (snapshot: PlanetDocument, saved: PlanetDocument) => void;
  select: (id: string | null) => void;
}
const content = (p: PlanetDocument) => JSON.stringify({ ...p, revision: 0 });
export const useEditor = create<EditorState>((set, get) => ({
  document: null,
  revision: 0,
  dirty: false,
  history: [],
  future: [],
  baseline: null,
  selectedLayerId: null,
  load: (p) =>
    set({
      document: p,
      revision: p.revision,
      dirty: false,
      history: [],
      future: [],
      baseline: null,
      selectedLayerId: p.exterior.scene.layers[0]?.id ?? null,
    }),
  select: (id) => set({ selectedLayerId: id }),
  begin: () => {
    if (!get().baseline) set({ baseline: structuredClone(get().document) });
  },
  end: () => {
    const s = get();
    if (s.baseline && s.document) {
      const patch = changes(s.baseline, s.document).filter(
        (c) => c.path[0] !== "revision",
      );
      set({
        baseline: null,
        history: patch.length ? [...s.history, patch].slice(-100) : s.history,
        future: patch.length ? [] : s.future,
      });
    }
  },
  change: (fn) => {
    const s = get();
    if (!s.document) return;
    const p = structuredClone(s.document);
    fn(p);
    const patch = changes(s.document, p);
    if (!patch.length) return;
    set({
      document: p,
      dirty: true,
      history: s.baseline ? s.history : [...s.history, patch].slice(-100),
      future: [],
    });
  },
  undo: () => {
    get().end();
    const s = get(),
      last = s.history.at(-1);
    if (!last || !s.document) return;
    set({
      document: applyChanges(s.document, last, "before"),
      dirty: true,
      history: s.history.slice(0, -1),
      future: [...s.future, last],
    });
  },
  redo: () => {
    const s = get(),
      last = s.future.at(-1);
    if (!last || !s.document) return;
    set({
      document: applyChanges(s.document, last, "after"),
      dirty: true,
      history: [...s.history, last],
      future: s.future.slice(0, -1),
    });
  },
  markSaved: (snapshot, saved) => {
    const current = get().document;
    if (!current || current.planetId !== snapshot.planetId) return;
    set({
      document: { ...current, revision: saved.revision },
      revision: saved.revision,
      dirty: content(current) !== content(snapshot),
    });
  },
}));
