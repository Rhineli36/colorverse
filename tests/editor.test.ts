import { describe, it, expect, beforeEach } from "vitest";
import { fixturePlanet } from "@colorverse/fixtures";
import { useEditor } from "../apps/web/src/features/studio/editor-store";
describe("editor command session", () => {
  beforeEach(() => useEditor.getState().load(fixturePlanet(0)));
  it("records a continuous drag as one undoable command", () => {
    const e = useEditor.getState();
    e.begin();
    for (let i = 0; i < 10; i++)
      e.change((p) => {
        p.exterior.scene.layers[0].transform.x += 10;
      });
    e.end();
    expect(useEditor.getState().history).toHaveLength(1);
    e.undo();
    expect(
      useEditor.getState().document!.exterior.scene.layers[0].transform.x,
    ).toBe(800);
    e.redo();
    expect(
      useEditor.getState().document!.exterior.scene.layers[0].transform.x,
    ).toBe(900);
  });
  it("keeps newer edits dirty when an older save completes", () => {
    const e = useEditor.getState();
    e.change((p) => {
      p.metadata.name = "第一次编辑";
    });
    const snapshot = structuredClone(useEditor.getState().document!);
    e.change((p) => {
      p.metadata.name = "保存过程中的修改";
    });
    e.markSaved(snapshot, { ...snapshot, revision: 1 });
    expect(useEditor.getState().dirty).toBe(true);
    expect(useEditor.getState().revision).toBe(1);
    expect(useEditor.getState().document!.metadata.name).toBe(
      "保存过程中的修改",
    );
  });
  it("clears ordinary undo history after accepting a persisted growth", () => {
    const e = useEditor.getState();
    e.change((p) => {
      p.metadata.name = "一次修改";
    });
    e.load({ ...fixturePlanet(0), revision: 2 });
    expect(useEditor.getState().history).toHaveLength(0);
    expect(useEditor.getState().dirty).toBe(false);
  });
});
