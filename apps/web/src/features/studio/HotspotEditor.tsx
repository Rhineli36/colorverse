import type {
  PlanetDocument,
  SceneDocument,
  Hotspot,
} from "@colorverse/contracts";
import { Field, Range } from "./controls";
export function HotspotEditor({
  doc,
  scene,
  sceneKind,
  patch,
  onPreview,
}: {
  doc: PlanetDocument;
  scene: SceneDocument;
  sceneKind: "interior" | "exterior";
  patch: (fn: (p: PlanetDocument) => void) => void;
  onPreview: (h: Hotspot) => void;
}) {
  const update = (id: string, fn: (h: Hotspot) => void) =>
    patch((p) => {
      const s = sceneKind === "interior" ? p.interior : p.exterior.scene;
      const h = s.hotspots.find((h) => h.id === id);
      if (h) fn(h);
    });
  return (
    <div className="hotspot-editors">
      {scene.hotspots.map((h) => (
        <section key={h.id} className="hotspot-editor">
          <Field label="热点名称">
            <input
              aria-label={`热点名称 ${h.id}`}
              value={h.accessibleLabel}
              maxLength={120}
              onChange={(e) =>
                update(h.id, (h) => {
                  h.accessibleLabel = e.target.value;
                })
              }
            />
          </Field>
          <Range
            label={`热点横坐标 ${h.accessibleLabel}`}
            min={h.anchorLayerId ? -1600 : 0}
            max={scene.width}
            step={1}
            value={h.geometry.x}
            onChange={(v) =>
              update(h.id, (h) => {
                h.geometry.x = v;
              })
            }
          />
          <Range
            label={`热点纵坐标 ${h.accessibleLabel}`}
            min={h.anchorLayerId ? -900 : 0}
            max={scene.height}
            step={1}
            value={h.geometry.y}
            onChange={(v) =>
              update(h.id, (h) => {
                h.geometry.y = v;
              })
            }
          />
          <Field label="绑定图层">
            <select
              value={h.anchorLayerId ?? ""}
              onChange={(e) =>
                update(h.id, (h) => {
                  h.anchorLayerId = e.target.value || null;
                  h.geometry.x = h.anchorLayerId ? 0 : scene.width / 2;
                  h.geometry.y = h.anchorLayerId ? 0 : scene.height / 2;
                })
              }
            >
              <option value="">场景坐标</option>
              {scene.layers.map((l, i) => (
                <option key={l.id} value={l.id}>
                  图层 {i + 1} · {l.kind}
                </option>
              ))}
            </select>
          </Field>
          <Field label="热点形状">
            <select
              value={h.geometry.type}
              onChange={(e) =>
                update(h.id, (h) => {
                  h.geometry =
                    e.target.value === "rect"
                      ? {
                          type: "rect",
                          x: h.geometry.x,
                          y: h.geometry.y,
                          width: 120,
                          height: 80,
                        }
                      : {
                          type: "circle",
                          x: h.geometry.x,
                          y: h.geometry.y,
                          radius: 35,
                        };
                })
              }
            >
              <option value="circle">圆形</option>
              <option value="rect">矩形</option>
            </select>
          </Field>
          <Field label="点击内容">
            <select
              value={h.action.type}
              onChange={(e) =>
                update(h.id, (h) => {
                  h.action =
                    e.target.value === "showImage"
                      ? {
                          type: "showImage",
                          assetId: doc.assetRefs.find((a) =>
                            a.original.mimeType.startsWith("image/"),
                          )!.assetId,
                          caption: "我的原创图片",
                        }
                      : e.target.value === "openArchive"
                        ? {
                            type: "openArchive",
                            archiveEntryId: doc.archiveEntries[0].id,
                          }
                        : { type: "showText", text: doc.metadata.monologue };
                })
              }
            >
              <option value="showText">文字弹窗</option>
              <option value="showImage">图片展示</option>
              <option value="openArchive">作品档案</option>
            </select>
          </Field>
          {h.action.type === "showText" && (
            <Field label="热点文字">
              <textarea
                value={h.action.text}
                maxLength={4000}
                onChange={(e) =>
                  update(h.id, (h) => {
                    if (h.action.type === "showText")
                      h.action.text = e.target.value;
                  })
                }
              />
            </Field>
          )}
          {h.action.type === "showImage" && (
            <Field label="展示图片">
              <select
                value={h.action.assetId}
                onChange={(e) =>
                  update(h.id, (h) => {
                    if (h.action.type === "showImage")
                      h.action.assetId = e.target.value;
                  })
                }
              >
                {doc.assetRefs
                  .filter((a) => a.original.mimeType.startsWith("image/"))
                  .map((a) => (
                    <option key={a.assetId} value={a.assetId}>
                      {a.rights.source || a.assetId}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {h.action.type === "openArchive" && (
            <Field label="作品档案">
              <select
                value={h.action.archiveEntryId}
                onChange={(e) =>
                  update(h.id, (h) => {
                    if (h.action.type === "openArchive")
                      h.action.archiveEntryId = e.target.value;
                  })
                }
              >
                {doc.archiveEntries.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="row-buttons">
            <button onClick={() => onPreview(h)}>预览热点</button>
            <button
              onClick={() =>
                patch((p) => {
                  const s =
                    sceneKind === "interior" ? p.interior : p.exterior.scene;
                  s.hotspots = s.hotspots.filter((x) => x.id !== h.id);
                })
              }
            >
              删除热点
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
