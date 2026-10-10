import {
  DecorationGroups,
  composeDecorationTransform,
  restoreScene,
  fitImage,
  visibleImageOpacity,
  planetAnchorTransform,
} from "@colorverse/domain";
import { EffectControls } from "./EffectControls";
import { ImageControls } from "./ImageControls";
import { StudioImageCanvas } from "./StudioImageCanvas";
import { ShowcaseGallery } from "./ShowcaseGallery";
import { GrowthProposalPanel } from "./GrowthProposalPanel";
import { useEffect, useRef, useState } from "react";
import { PanelTabs } from "./PanelTabs";
import { MotionControls } from "../universe/MotionControls";
import type { UniverseEntry } from "@colorverse/domain";
import type { PlanetMotion } from "@colorverse/contracts";
import type {
  PlanetDocument,
  SceneDocument,
  Layer,
  GrowthEvent,
  Hotspot,
} from "@colorverse/contracts";
import {
  defaultAdjustments,
  EffectIds,
  GrowthPresets,
} from "@colorverse/contracts";
import type {
  WorkspaceRepository,
  AssetStore,
  GrowthService,
} from "@colorverse/application";
import { uid } from "@colorverse/fixtures";
import { download } from "../../app/download";
import { Field, Range, effectNames } from "./controls";
import { useEditor } from "./editor-store";
import { HotspotEditor } from "./HotspotEditor";
interface Props {
  workspace: WorkspaceRepository & AssetStore;
  growth: GrowthService;
  doc: PlanetDocument;
  currentScene: SceneDocument;
  preview: PlanetDocument;
  editor: ReturnType<typeof useEditor.getState>;
  selected: Layer | null;
  proposal: GrowthEvent | null;
  sceneKind: "interior" | "exterior";
  saving: boolean;
  busy: boolean;
  setSceneKind: (v: "interior" | "exterior") => void;
  setRoute: (v: "room") => void;
  setNotice: (v: string) => void;
  setModal: (v: Hotspot) => void;
  setProposal: (v: GrowthEvent | null) => void;
  showGrowthSource: (id: string) => void;
  action: (fn: () => Promise<void>) => Promise<void>;
  flush: () => Promise<void>;
  refresh: () => Promise<void>;
  patch: (fn: (p: PlanetDocument) => void) => void;
  layerPatch: (fn: (l: Layer) => void) => void;
  upload: (
    file: File,
    target: "body" | "background" | "layer",
  ) => Promise<void>;
  exportCurrent: () => Promise<void>;
  onOpenCourse: () => Promise<void>;
  onOpenShowcase: () => void;
  showArchive: (id: string) => void;
  onGrowArchive: (id: string) => void;
  addEffect: (id: (typeof EffectIds)[number]) => void;
  universeEntry: UniverseEntry | undefined;
  canEditMotion: boolean;
  onSaveMotion: (
    motion: PlanetMotion,
    expectedLayoutRevision: number,
  ) => Promise<void>;
}

export function StudioView({
  workspace,
  growth,
  doc,
  currentScene,
  preview,
  editor,
  selected,
  proposal,
  sceneKind,
  saving,
  busy,
  setSceneKind,
  setRoute,
  setNotice,
  setModal,
  setProposal,
  showGrowthSource,
  action,
  flush,
  refresh,
  patch,
  layerPatch,
  upload,
  exportCurrent,
  onOpenCourse,
  onOpenShowcase,
  showArchive,
  onGrowArchive,
  addEffect,
  universeEntry,
  canEditMotion,
  onSaveMotion,
}: Props) {
  const [locked, setLocked] = useState(true),
    [cropEditing, setCropEditing] = useState(false);
  const [importMode, setImportMode] = useState<"body" | "layer">("body");
  const [leftTab, setLeftTab] = useState("decorations"),
    [rightTab, setRightTab] = useState("parameters");
  const leftPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    leftPanel.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [leftTab, sceneKind]);
  useEffect(() => {
    setLeftTab("decorations");
  }, [sceneKind]);
  useEffect(() => {
    setRightTab("parameters");
  }, [selected?.id, sceneKind]);
  const imageRecord =
    selected && "assetId" in selected.source
      ? doc.assetRefs.find(
          (a) =>
            "assetId" in selected.source &&
            a.assetId === selected.source.assetId,
        )
      : undefined;
  const submitDemo = () =>
    action(async () => {
      await flush();
      const event = await growth.propose(doc.planetId, uid(9900));
      useEditor.getState().load(await workspace.get(doc.planetId));
      setSceneKind("interior");
      setProposal(event);
      if (event.status !== "proposed")
        setNotice("这份模拟作业已经处理，不会重复生长。");
    });
  const deleteLayer = (id: string) => {
    const layer = currentScene.layers.find((l) => l.id === id);
    if (!layer) return;
    if (
      doc.growthEvents.some(
        (e) =>
          e.status === "accepted" && e.elements.some((el) => el.layerId === id),
      )
    ) {
      setNotice("成长图层请通过成长记录撤销，避免历史不一致。");
      return;
    }
    if (
      sceneKind === "exterior" &&
      layer.kind === "image" &&
      currentScene.layers.filter((l) => l.kind === "image").length === 1
    ) {
      setNotice("星球外观需保留一张主体图片，可替换或隐藏。");
      return;
    }
    patch((p) => {
      const s = sceneKind === "interior" ? p.interior : p.exterior.scene;
      const deletedRecord =
        "assetId" in layer.source
          ? p.assetRefs.find(
              (a) =>
                "assetId" in layer.source && a.assetId === layer.source.assetId,
            )
          : undefined;
      const parentTransform =
        sceneKind === "exterior" &&
        s.layers.find((l) => l.kind === "image")?.id === id
          ? planetAnchorTransform(
              s,
              layer,
              deletedRecord?.original.width ?? 512,
            )
          : layer.transform;
      for (const child of s.layers)
        if ("effectId" in child.source && child.source.anchorLayerId === id) {
          child.transform = composeDecorationTransform(
            child.transform,
            parentTransform,
          );
          child.transform.rotationDeg =
            ((child.transform.rotationDeg + 540) % 360) - 180;
          delete child.source.anchorLayerId;
        }
      s.layers = s.layers.filter((l) => l.id !== id);
      s.hotspots = s.hotspots.filter((h) => h.anchorLayerId !== id);
      if (
        ![p.exterior.scene, p.interior].some((s) =>
          s.layers.some((l) => "assetId" in l.source && l.source.crop),
        )
      )
        p.requiredCapabilities = p.requiredCapabilities.filter(
          (c) => c !== "image-crop@1",
        );
    });
    if (editor.selectedLayerId === id)
      editor.select(currentScene.layers.find((l) => l.id !== id)?.id ?? null);
    setNotice("图层已删除，可以撤销恢复。");
  };
  const savePreview = async () => {
    await flush();
    if (proposal?.status === "proposed") {
      const saved = await growth.updateProposal(
        proposal,
        useEditor.getState().revision,
      );
      if (saved.revision !== useEditor.getState().revision) editor.load(saved);
      setProposal(
        saved.growthEvents.find((e) => e.eventId === proposal.eventId)!,
      );
    }
  };
  return (
    <>
      <div className="studio-bar">
        <div>
          <span className="eyebrow">编辑与提交 · COLORVERSE STUDIO</span>
          <strong>{doc.metadata.name}</strong>
        </div>
        <div className="studio-actions">
          <span className="save-state" role="status">
            {saving
              ? "正在保存…"
              : editor.dirty
                ? "草稿待保存"
                : "已保存到此浏览器"}
          </span>
          <button disabled={!editor.history.length} onClick={editor.undo}>
            ↶ 撤销
          </button>
          <button disabled={!editor.future.length} onClick={editor.redo}>
            ↷ 重做
          </button>
          <button
            onClick={() =>
              void action(async () => {
                await savePreview();
                setNotice("草稿已保存");
              })
            }
          >
            保存
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(doc, null, 2)], {
                  type: "application/json",
                }),
                `${doc.metadata.name}.json`,
              )
            }
          >
            配置 JSON
          </button>
          <button
            className="outline small"
            disabled={busy}
            onClick={() => void onOpenCourse()}
          >
            提交课程作业 ↗
          </button>
          <button
            className="primary small"
            disabled={busy}
            onClick={onOpenShowcase}
          >
            添加展示作品 ↗
          </button>
          <button
            className="primary small"
            disabled={busy}
            onClick={() => void exportCurrent()}
          >
            导出作品 ZIP ↗
          </button>
        </div>
      </div>
      <main className="studio-grid">
        <aside className="panel left-panel">
          <div className="panel-title">
            图片导入{" "}
            <span>{sceneKind === "exterior" ? "星球外观" : "内部空间"}</span>
          </div>
          {sceneKind === "exterior" && (
            <Field label="外观图片用途">
              <select
                value={importMode}
                onChange={(e) =>
                  setImportMode(e.target.value as "body" | "layer")
                }
              >
                <option value="body">替换星球主体</option>
                <option value="layer">添加外观图片图层</option>
              </select>
            </Field>
          )}
          <label className="upload-btn">
            {sceneKind === "exterior"
              ? importMode === "body"
                ? "上传星球外观"
                : "＋ 添加外观图片"
              : "＋ 添加内部图片"}
            <input
              aria-label={
                sceneKind === "exterior" && importMode === "body"
                  ? "上传星球绘画"
                  : "添加原创图层"
              }
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                if (e.target.files?.[0])
                  void upload(
                    e.target.files[0],
                    sceneKind === "exterior" ? importMode : "layer",
                  );
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="outline small full auto-fit-image"
            disabled={busy || !imageRecord || selected?.kind !== "image"}
            onClick={() => {
              if (!selected || !imageRecord) return;
              const transform = fitImage(
                selected,
                imageRecord.original.width!,
                imageRecord.original.height!,
                currentScene,
                sceneKind === "exterior",
              );
              layerPatch((l) => {
                l.transform = transform;
              });
              setNotice(
                sceneKind === "exterior"
                  ? "图片已适应星球蒙版，可以撤销。"
                  : "图片已完整适应内部画布，可以撤销。",
              );
            }}
          >
            {sceneKind === "exterior" ? "自动适应星球蒙版" : "自动适应内部画布"}
          </button>
          <p className="hint fit-image-hint">
            {selected?.kind === "image"
              ? `调整当前图片：${currentScene.layers.findIndex((l) => l.id === selected.id) + 1}`
              : "先选择一张图片，再自动适应。"}
          </p>
          <section className="studio-layer-tools" aria-label="场景图层">
            <div className="panel-title">
              场景图层 <span>{currentScene.layers.length}</span>
            </div>
            <div className="layer-list">
              {currentScene.layers.map((l, i) => (
                <div className="layer-row" key={l.id}>
                  <button
                    className={editor.selectedLayerId === l.id ? "chosen" : ""}
                    onClick={() => editor.select(l.id)}
                  >
                    <span>
                      {l.kind === "image"
                        ? "▧"
                        : l.kind === "effect"
                          ? "✦"
                          : "◇"}
                    </span>
                    <span>
                      {l.kind === "effect" && "effectId" in l.source
                        ? effectNames[l.source.effectId]
                        : l.kind === "preset" && "presetId" in l.source
                          ? l.source.presetId === "sphere"
                            ? "预设球体"
                            : GrowthPresets[l.source.presetId].name
                          : `原创图片 ${i + 1}`}
                    </span>
                    <span>{l.visible ? "◉" : "○"}</span>
                  </button>
                  <button
                    className="layer-delete"
                    aria-label={`删除图层 ${i + 1}`}
                    title="删除图层（可撤销）"
                    onClick={() => deleteLayer(l.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {selected ? (
              <div
                className="row-buttons layer-actions"
                aria-label="当前图层操作"
              >
                <button
                  onClick={() =>
                    layerPatch((l) => {
                      l.visible = !l.visible;
                    })
                  }
                >
                  {selected.visible ? "隐藏图层" : "显示图层"}
                </button>
                <button onClick={() => deleteLayer(selected.id)}>
                  删除图层
                </button>
              </div>
            ) : (
              <p className="hint">选择图层后可隐藏、显示或删除。</p>
            )}
          </section>
          <PanelTabs
            id="studio-left"
            label="创作侧栏"
            value={leftTab}
            onChange={setLeftTab}
            tabs={[
              { value: "info", label: "星球信息" },
              { value: "decorations", label: "装饰" },
              { value: "motion", label: "运动" },
            ]}
          />
          <div className="studio-side-details" ref={leftPanel}>
            <div
              role="tabpanel"
              id="studio-left-motion-panel"
              aria-labelledby="studio-left-motion-tab"
              hidden={leftTab !== "motion"}
            >
              {universeEntry && (
                <MotionControls
                  key={`${doc.planetId}-${universeEntry.layoutRevision ?? 0}`}
                  entry={universeEntry}
                  canEdit={canEditMotion}
                  onSave={onSaveMotion}
                  active={leftTab === "motion"}
                />
              )}
            </div>
            <div
              role="tabpanel"
              id="studio-left-info-panel"
              aria-labelledby="studio-left-info-tab"
              hidden={leftTab !== "info"}
            >
              <div className="panel-title">
                星球信息 <span>01</span>
              </div>
              <Field label="星球名称">
                <input
                  aria-label="星球名称"
                  value={doc.metadata.name}
                  onFocus={editor.begin}
                  onBlur={editor.end}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.name = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="作者署名">
                <input
                  value={doc.metadata.authorDisplayName}
                  onFocus={editor.begin}
                  onBlur={editor.end}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.authorDisplayName = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="创作主题">
                <input
                  value={doc.metadata.theme}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.theme = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="情绪关键词（空格分隔）">
                <input
                  value={doc.metadata.emotionTags.join(" ")}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.emotionTags = e.target.value
                        .split(/\s+/)
                        .filter(Boolean);
                    })
                  }
                />
              </Field>
              <Field label="星球介绍">
                <textarea
                  value={doc.metadata.description}
                  onFocus={editor.begin}
                  onBlur={editor.end}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.description = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="星球独白">
                <textarea
                  value={doc.metadata.monologue}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.monologue = e.target.value;
                    })
                  }
                />
              </Field>
            </div>
            <div
              role="tabpanel"
              id="studio-left-decorations-panel"
              aria-labelledby="studio-left-decorations-tab"
              hidden={leftTab !== "decorations"}
            >
              <div className="panel-title" id="planet-decorations">
                星球装饰 <span>02</span>
              </div>
              <p className="hint">
                自由叠加粒子、光影与卫星；每项都是可调整、隐藏或移除的独立图层。
              </p>
              {DecorationGroups.map((group) => (
                <div key={group.name} className="decoration-group">
                  <h4>{group.name}</h4>
                  <div className="effect-grid">
                    {group.ids.map((id) => (
                      <button key={id} onClick={() => addEffect(id)}>
                        {effectNames[id]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <section className="editor-center">
          <div className="scene-tabs">
            <button
              className="scene-reset"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await flush();
                  const baseline = await workspace.getBaseline(doc.planetId);
                  patch((p) => {
                    const restored = restoreScene(p, baseline, sceneKind);
                    Object.assign(p, restored);
                  });
                  editor.select(
                    (sceneKind === "exterior"
                      ? baseline.exterior.scene
                      : baseline.interior
                    ).layers[0]?.id ?? null,
                  );
                  setNotice(
                    `${sceneKind === "exterior" ? "星球外观" : "内部空间"}已恢复到最初保存版本，可以撤销。`,
                  );
                })
              }
            >
              {sceneKind === "exterior" ? "复位星球外观" : "复位内部空间"}
            </button>
            <button
              onClick={() => {
                setLeftTab("decorations");
              }}
            >
              ✦ 装饰星球
            </button>
            <button
              data-scene-color="exterior"
              className={sceneKind === "exterior" ? "selected" : ""}
              onClick={() => {
                setSceneKind("exterior");
                editor.select(doc.exterior.scene.layers[0]?.id ?? null);
              }}
            >
              星球外观
            </button>
            <button
              data-scene-color="interior"
              className={sceneKind === "interior" ? "selected" : ""}
              onClick={() => {
                setSceneKind("interior");
                editor.select(doc.interior.layers[0]?.id ?? null);
              }}
            >
              内部空间
            </button>
            <button onClick={() => setRoute("room")}>进入星球预览 ↗</button>
          </div>
          <StudioImageCanvas
            assets={workspace}
            planet={preview}
            scene={
              sceneKind === "interior"
                ? preview.interior
                : preview.exterior.scene
            }
            selected={selected}
            record={imageRecord}
            locked={locked}
            disabled={cropEditing}
            exterior={sceneKind === "exterior"}
            onCommit={(t) =>
              layerPatch((l) => {
                l.transform = t;
              })
            }
            options={{
              onHotspot: setModal,
              onLayerSelect: editor.select,
              onGrowth: showGrowthSource,
            }}
          />
          <div className="canvas-caption">
            <span>1600 × 900 · 原创图像 / 非破坏编辑</span>
            <span>REV {doc.revision.toString().padStart(3, "0")}</span>
          </div>
          <section className="growth-panel">
            <div>
              <p className="eyebrow">PLANET GROWTH · 预制元素</p>
              <h3>让每一次练习，成为新的生长。</h3>
              <p className="muted">
                展示作品的色彩与关键词生成建议，接受后成为独立图层。下方保留模拟演示。
              </p>
            </div>
            <button
              className="outline small"
              disabled={busy}
              onClick={() => void submitDemo()}
            >
              ✦ 模拟提交作业
            </button>
          </section>
          <ShowcaseGallery
            doc={doc}
            assets={workspace}
            busy={busy}
            onAdd={onOpenShowcase}
            onView={showArchive}
            onGrow={onGrowArchive}
          />
          {proposal?.status === "proposed" && (
            <GrowthProposalPanel
              event={proposal}
              stored={doc.growthEvents.find(
                (e) => e.eventId === proposal.eventId,
              )}
              busy={busy}
              onChange={setProposal}
              onSave={() =>
                void action(async () => {
                  await savePreview();
                  await refresh();
                  setNotice("预览调整已保存，接受后才加入场景。");
                })
              }
              onAccept={() =>
                void action(async () => {
                  await flush();
                  editor.load(
                    await growth.accept(
                      proposal,
                      useEditor.getState().revision,
                    ),
                  );
                  setProposal(null);
                  await refresh();
                  setNotice("成长已保存，可点击元素查看来源作品。");
                })
              }
              onSkip={() =>
                void action(async () => {
                  await flush();
                  editor.load(
                    await growth.reject(doc.planetId, proposal.eventId),
                  );
                  setProposal(null);
                  await refresh();
                })
              }
            />
          )}
          <div className="growth-history">
            {doc.growthEvents.map((e) => (
              <div key={e.eventId}>
                <span>
                  ✦ {GrowthPresets[e.elements[0].presetId].name} ·{" "}
                  {
                    (
                      {
                        proposed: "待确认",
                        accepted: "已生长",
                        rejected: "已拒绝",
                        reverted: "已撤销",
                      } as const
                    )[e.status]
                  }
                </span>
                {(e.trigger.kind === "archive" ||
                  e.trigger.kind === "mock") && (
                  <button
                    onClick={() => showGrowthSource(e.elements[0].layerId)}
                  >
                    查看成长来源
                  </button>
                )}
                {e.status === "accepted" && (
                  <button
                    onClick={() =>
                      void action(async () => {
                        await flush();
                        editor.load(
                          await growth.revert(
                            doc.planetId,
                            e.eventId,
                            useEditor.getState().revision,
                          ),
                        );
                        await refresh();
                      })
                    }
                  >
                    撤销这次成长
                  </button>
                )}
                {e.status === "proposed" && (
                  <button
                    onClick={() => {
                      setSceneKind("interior");
                      setProposal(e);
                    }}
                  >
                    继续预览
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <aside className="panel right-panel">
          <div className="panel-title">主题色与画面编辑</div>
          <div className="palette-edit">
            {(["primary", "secondary", "accent"] as const).map((k, i) => (
              <Field key={k} label={["主色", "辅助色", "点缀色"][i]}>
                <input
                  type="color"
                  value={doc.metadata.palette[k]}
                  onChange={(e) =>
                    patch((p) => {
                      p.metadata.palette[k] = e.target.value;
                    })
                  }
                />
              </Field>
            ))}
          </div>

          {sceneKind === "interior" && (
            <>
              <div className="panel-title">
                内部空间背景 <span>03</span>
              </div>
              <label className="upload-btn">
                更换内部背景
                <input
                  aria-label="上传内部背景"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      void upload(e.target.files[0], "background");
                    e.target.value = "";
                  }}
                />
              </label>
              <Field label="纯色背景">
                <input
                  type="color"
                  value={
                    currentScene.background.type === "color"
                      ? currentScene.background.color
                      : "#101826"
                  }
                  onChange={(e) =>
                    patch((p) => {
                      const s =
                        sceneKind === "interior"
                          ? p.interior
                          : p.exterior.scene;
                      s.background = { type: "color", color: e.target.value };
                    })
                  }
                />
              </Field>
              <button
                className="outline small full"
                onClick={() =>
                  patch((p) => {
                    const s =
                      sceneKind === "interior" ? p.interior : p.exterior.scene;
                    s.background = {
                      type: "linearGradient",
                      angleDeg: 90,
                      stops: [
                        { offset: 0, color: p.metadata.palette.secondary },
                        { offset: 1, color: "#0A101B" },
                      ],
                    };
                  })
                }
              >
                使用主题色渐变
              </button>
            </>
          )}
          {selected && (
            <>
              {selected.kind === "image" && imageRecord && (
                <ImageControls
                  layer={selected}
                  record={imageRecord}
                  assets={workspace}
                  layerPatch={layerPatch}
                  patch={patch}
                  sceneKind={sceneKind}
                  locked={locked}
                  setLocked={setLocked}
                  onCropEditing={setCropEditing}
                />
              )}
              <PanelTabs
                id="studio-right"
                label="图层编辑"
                value={rightTab}
                onChange={setRightTab}
                tabs={[
                  { value: "parameters", label: "图层参数" },
                  {
                    value: "color",
                    label: "基础调色",
                  },
                ]}
              />
              <div
                role="tabpanel"
                id="studio-right-parameters-panel"
                aria-labelledby="studio-right-parameters-tab"
                hidden={rightTab !== "parameters"}
              >
                <div className="panel-title">
                  图层参数 <span>04</span>
                </div>
                {selected.kind !== "image" && (
                  <>
                    <Range
                      label={
                        "effectId" in selected.source &&
                        selected.source.anchorLayerId
                          ? "相对水平位置"
                          : "水平位置"
                      }
                      min={
                        "effectId" in selected.source &&
                        selected.source.anchorLayerId
                          ? -1600
                          : 0
                      }
                      max={1600}
                      step={1}
                      value={selected.transform.x}
                      onChange={(v) =>
                        layerPatch((l) => {
                          l.transform.x = v;
                        })
                      }
                    />
                    <Range
                      label={
                        "effectId" in selected.source &&
                        selected.source.anchorLayerId
                          ? "相对垂直位置"
                          : "垂直位置"
                      }
                      min={
                        "effectId" in selected.source &&
                        selected.source.anchorLayerId
                          ? -900
                          : 0
                      }
                      max={900}
                      step={1}
                      value={selected.transform.y}
                      onChange={(v) =>
                        layerPatch((l) => {
                          l.transform.y = v;
                        })
                      }
                    />
                  </>
                )}
                {selected.kind !== "image" && (
                  <Range
                    label="大小"
                    min={0.01}
                    max={3}
                    value={selected.transform.scaleX}
                    onChange={(v) =>
                      layerPatch((l) => {
                        l.transform.scaleX = l.transform.scaleY = v;
                      })
                    }
                  />
                )}
                {selected.kind !== "image" && (
                  <Range
                    label="角度"
                    min={-180}
                    max={180}
                    step={1}
                    value={selected.transform.rotationDeg}
                    onChange={(v) =>
                      layerPatch((l) => {
                        l.transform.rotationDeg = v;
                      })
                    }
                  />
                )}
                <Field label="景深">
                  <select
                    value={selected.depth}
                    onChange={(e) =>
                      layerPatch((l) => {
                        l.depth = e.target.value as Layer["depth"];
                      })
                    }
                  >
                    <option value="background">背景</option>
                    <option value="middle">中景</option>
                    <option value="foreground">前景</option>
                  </select>
                </Field>
                <EffectControls layer={selected} patch={layerPatch} />
                <Range
                  label="轻微视差"
                  min={-0.1}
                  max={0.1}
                  value={selected.parallaxFactor}
                  onChange={(v) =>
                    layerPatch((l) => {
                      l.parallaxFactor = v;
                    })
                  }
                />
                <Field label="轻微动画">
                  <select
                    value={selected.animation[0]?.type ?? "none"}
                    onChange={(e) =>
                      layerPatch((l) => {
                        l.animation =
                          e.target.value === "float"
                            ? [
                                {
                                  type: "float",
                                  amplitudePx: 10,
                                  periodSec: 8,
                                },
                              ]
                            : e.target.value === "rotate"
                              ? [{ type: "rotate", degreesPerSec: 3 }]
                              : e.target.value === "breathe"
                                ? [
                                    {
                                      type: "breathe",
                                      minOpacity: 0.6,
                                      maxOpacity: 1,
                                      periodSec: 4,
                                    },
                                  ]
                                : [];
                      })
                    }
                  >
                    <option value="none">无</option>
                    <option value="float">轻微漂浮</option>
                    <option value="rotate">缓慢旋转</option>
                    <option value="breathe">呼吸透明度</option>
                  </select>
                </Field>
              </div>
              <div
                role="tabpanel"
                id="studio-right-color-panel"
                aria-labelledby="studio-right-color-tab"
                hidden={rightTab !== "color"}
              >
                <div className="panel-title">基础调色</div>
                <Range
                  label="透明度"
                  min={
                    sceneKind === "exterior" && selected.kind === "image"
                      ? 0.5
                      : 0
                  }
                  max={1}
                  value={visibleImageOpacity(
                    selected.opacity,
                    sceneKind === "exterior" && selected.kind === "image",
                  )}
                  onChange={(v) =>
                    layerPatch((l) => {
                      l.opacity = visibleImageOpacity(
                        v,
                        sceneKind === "exterior" && l.kind === "image",
                      );
                    })
                  }
                />
                {sceneKind === "exterior" && selected.kind === "image" && (
                  <p className="image-hint">外观图片至少保留 50% 的可见度。</p>
                )}
                {selected.kind === "image" && (
                  <>
                    {(
                      [
                        ["hueDeg", "色相", -180, 180, 1],
                        ["saturation", "饱和度", 0, 2, 0.01],
                        ["brightness", "亮度", 0, 2, 0.01],
                        ["contrast", "对比度", 0, 2, 0.01],
                        ["temperature", "冷暖倾向", -1, 1, 0.01],
                      ] as const
                    ).map(([k, label, min, max, step]) => (
                      <Range
                        key={k}
                        label={label}
                        min={min}
                        max={max}
                        step={step}
                        value={selected.adjustments[k]}
                        onChange={(v) =>
                          layerPatch((l) => {
                            l.adjustments[k] = v;
                          })
                        }
                      />
                    ))}
                    <button
                      className="outline small full"
                      onClick={() =>
                        layerPatch((l) => {
                          l.adjustments = defaultAdjustments();
                          l.opacity = 1;
                        })
                      }
                    >
                      重置调色
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <div className="panel-title">互动热点</div>
          <button
            className="outline small full"
            onClick={() => {
              if (currentScene.hotspots.length >= 30) {
                setNotice("最多 30 个热点");
                return;
              }
              patch((p) => {
                const s =
                  sceneKind === "interior" ? p.interior : p.exterior.scene;
                s.hotspots.push({
                  id: crypto.randomUUID(),
                  sceneId: s.id,
                  anchorLayerId: null,
                  geometry: {
                    type: "circle",
                    x: s.width / 2,
                    y: s.height * 0.65,
                    radius: 35,
                  },
                  accessibleLabel: "我的星球故事",
                  action: {
                    type: "showText",
                    text: p.metadata.monologue || p.metadata.description,
                  },
                });
              });
            }}
          >
            ＋ 添加文字热点
          </button>
          <button
            className="outline small full"
            onClick={() =>
              patch((p) => {
                const s =
                  sceneKind === "interior" ? p.interior : p.exterior.scene;
                if (s.hotspots.length >= 30) return;
                s.hotspots.push({
                  id: crypto.randomUUID(),
                  sceneId: s.id,
                  anchorLayerId: null,
                  geometry: {
                    type: "circle",
                    x: s.width * 0.65,
                    y: s.height * 0.65,
                    radius: 35,
                  },
                  accessibleLabel: "打开作品档案",
                  action: {
                    type: "openArchive",
                    archiveEntryId: p.archiveEntries[0].id,
                  },
                });
              })
            }
          >
            ＋ 放置作品档案热点
          </button>
          <HotspotEditor
            doc={doc}
            scene={currentScene}
            sceneKind={sceneKind}
            patch={patch}
            onPreview={setModal}
          />
        </aside>
      </main>
    </>
  );
}
