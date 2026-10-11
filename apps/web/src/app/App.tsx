import { download } from "./download";
import { CourseView } from "../features/course/CourseView";
import { TeacherView } from "../features/teacher-demo/TeacherView";
import { StudioView } from "../features/studio/StudioView";
import { ElementEditorView } from "../features/studio/ElementEditorView";
import {
  ShowcaseDialog,
  type ShowcaseInput,
} from "../features/studio/ShowcaseDialog";
import { PlanetRoomView } from "../features/planet-room/PlanetRoomView";
import { UniverseView } from "../features/universe/UniverseView";
import type { UniverseViewMode } from "../features/universe/UniverseView";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  VERSION,
  EffectIds,
  defaultTransform,
  defaultAdjustments,
  type PlanetDocument,
  type UniverseDocument,
  type Layer,
  type GrowthEvent,
  type Hotspot,
  type PlanetMotion,
} from "@colorverse/contracts";
import {
  createDecoration,
  fitImage,
  NewDecorationIds,
  filterPlanets,
  clone,
  DomainError,
  validatePlanet,
  nextPlanetPosition,
  upgradeUniverse,
  type LayoutActor,
} from "@colorverse/domain";
import {
  GrowthService,
  GrowthElementService,
  ShowcaseService,
  growthOverlay,
  UniverseLayoutService,
  type PlanetMove,
} from "@colorverse/application";
import {
  copyImportedPlanet,
  exportPackage,
  sha256,
  type PackageReport,
} from "@colorverse/package-io";
import { LocalWorkspace } from "../adapters/local/store";
import { prepareImage, inspectInWorker } from "../adapters/local/images";
import { bootstrap } from "./bootstrap";
import { AssetImage } from "./AssetImage";
import { useEditor } from "../features/studio/editor-store";
const workspace = new LocalWorkspace(),
  growth = new GrowthService(workspace),
  showcase = new ShowcaseService(workspace, sha256),
  elementService = new GrowthElementService(workspace),
  layoutService = new UniverseLayoutService(workspace);
export function App() {
  const [planets, setPlanets] = useState<PlanetDocument[]>([]),
    [universe, setUniverse] = useState<UniverseDocument | null>(null),
    [route, setRoute] = useState<
      "universe" | "studio" | "room" | "teacher" | "course" | "element"
    >("universe"),
    [activeId, setActiveId] = useState<string | null>(null),
    [hover, setHover] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [family, setFamily] = useState("all"),
    [emotion, setEmotion] = useState(""),
    [sceneKind, setSceneKind] = useState<"exterior" | "interior">("exterior"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [coursePending, setCoursePending] = useState(false),
    [showcaseOpen, setShowcaseOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [modal, setModal] = useState<Hotspot | null>(null),
    [proposal, setProposal] = useState<GrowthEvent | null>(null),
    [elementSession, setElementSession] = useState<{
      document: PlanetDocument;
      initial: Layer;
      returnRoute: "studio" | "room";
    } | null>(null),
    [elementDirty, setElementDirty] = useState(false),
    [birthLayerId, setBirthLayerId] = useState<string | null>(null),
    [report, setReport] = useState<PackageReport | null>(null),
    [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 }),
    [universeViewMode, setUniverseViewMode] =
      useState<UniverseViewMode>("overview"),
    [motionPaused, setMotionPaused] = useState(false),
    [layoutRole, setLayoutRole] = useState<LayoutActor["role"]>("student"),
    [ownership, setOwnership] = useState<Record<string, string>>({}),
    [fatal, setFatal] = useState("");
  const editor = useEditor(),
    saveLock = useRef<Promise<void> | null>(null),
    importInput = useRef<HTMLInputElement>(null);
  const doc = editor.document;
  useEffect(() => {
    if (route !== "room") setBirthLayerId(null);
  }, [route]);
  const refresh = useCallback(async () => {
    const [p, u, owners] = await Promise.all([
      workspace.list(),
      workspace.getUniverse(),
      workspace.getOwnership(),
    ]);
    setPlanets(p);
    setUniverse(u);
    setOwnership(owners);
  }, []);
  useEffect(() => {
    bootstrap(workspace)
      .then(refresh)
      .catch((e) => setFatal(e.message));
  }, [refresh]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty || elementDirty || coursePending || busy) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [coursePending, busy, elementDirty]);
  const flush = useCallback(async () => {
    while (saveLock.current) await saveLock.current;
    if (!useEditor.getState().dirty) return;
    const task = (async () => {
      setSaving(true);
      try {
        while (useEditor.getState().dirty) {
          const s = useEditor.getState(),
            snapshot = clone(s.document!);
          const saved = await workspace.save(snapshot, s.revision);
          useEditor.getState().markSaved(snapshot, saved);
        }
        await refresh();
      } finally {
        setSaving(false);
      }
    })();
    saveLock.current = task;
    try {
      await task;
    } finally {
      if (saveLock.current === task) saveLock.current = null;
    }
  }, [refresh]);
  useEffect(() => {
    if (!editor.dirty) return;
    const timer = setTimeout(() => {
      void flush().catch((e) => setNotice(e.message));
    }, 800);
    return () => clearTimeout(timer);
  }, [editor.document, editor.dirty, flush]);
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    if (route === "element") {
      setNotice("请先确定或取消元素修改，再离开元素编辑器。");
      return;
    }
    if (route === "course" && coursePending) {
      setNotice("请先保存作业草稿，并等待当前操作完成，再离开课堂。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string, to: "studio" | "room") => {
    await flush();
    const p = await workspace.get(id);
    useEditor.getState().load(p);
    setActiveId(id);
    setProposal(null);
    setModal(null);
    setBirthLayerId(null);
    setRoute(to);
  };
  const back = () =>
    action(async () => {
      await flush();
      setRoute("universe");
      setProposal(null);
      await refresh();
    });
  const patch = (fn: (p: PlanetDocument) => void) => editor.change(fn);
  const currentScene = doc
    ? sceneKind === "interior"
      ? doc.interior
      : doc.exterior.scene
    : null;
  const selected =
    currentScene?.layers.find((l) => l.id === editor.selectedLayerId) ?? null;
  const layerPatch = (fn: (l: Layer) => void) =>
    patch((p) => {
      const s = sceneKind === "interior" ? p.interior : p.exterior.scene;
      const l = s.layers.find((l) => l.id === editor.selectedLayerId);
      if (l) fn(l);
    });
  const createPlanet = () =>
    action(async () => {
      await flush();
      const source = planets[0],
        files = new Map<string, Blob>();
      for (const a of source.assetRefs)
        for (const f of [a.original, ...a.variants])
          files.set(f.path, await workspace.read(f.path));
      const result = copyImportedPlanet(source, files),
        p = result.planet;
      p.metadata.name = "我的新星球";
      p.metadata.authorDisplayName = "我的署名";
      p.growthEvents = [];
      p.interior.layers = [];
      p.interior.tombstones = [];
      const u = clone(universe!);
      u.entries.push({
        planetId: p.planetId,
        visible: true,
        position: nextPlanetPosition(u.entries, u.layout.seed),
        scale: 1,
        order: u.entries.length,
        ...(u.schemaVersion === "1.1.0" ? { layoutRevision: 0 } : {}),
      });
      await workspace.importAtomic([p], u, result.files, crypto.randomUUID());
      await workspace.assignOwner(p.planetId, "demo-student-1");
      await refresh();
      await open(p.planetId, "studio");
    });
  const upload = (file: File, target: "body" | "background" | "layer") =>
    action(async () => {
      if (!doc) return;
      const prepared = await prepareImage(file, doc.metadata.authorDisplayName);
      await workspace.put(prepared.files);
      const id = crypto.randomUUID();
      patch((p) => {
        p.assetRefs.push(prepared.record);
        const scene = sceneKind === "interior" ? p.interior : p.exterior.scene;
        if (target === "background")
          scene.background = {
            type: "image",
            assetId: prepared.record.assetId,
            fit: "cover",
            color: "#101826",
          };
        else {
          const layer: Layer = {
            id,
            kind: "image",
            depth: "middle",
            order: scene.layers.length,
            transform: {
              ...defaultTransform(scene.width / 2, scene.height / 2),
              scaleX: Math.min(1, 450 / prepared.record.original.width!),
              scaleY: Math.min(1, 450 / prepared.record.original.width!),
            },
            opacity: 1,
            visible: true,
            adjustments: defaultAdjustments(),
            animation: [],
            parallaxFactor: 0,
            source: { assetId: prepared.record.assetId },
          };
          if (target === "body" && sceneKind === "exterior") {
            // Use the same fitting policy as the explicit editor action.
            const fittingScene = { ...scene, layers: [layer, ...scene.layers] };
            layer.transform = fitImage(
              layer,
              prepared.record.original.width!,
              prepared.record.original.height!,
              fittingScene,
              true,
            );
          }
          if (target === "body" && sceneKind === "exterior") {
            const first = scene.layers.findIndex((l) => l.kind === "image");
            if (first >= 0) {
              const old = scene.layers[first];
              layer.id = old.id;
              scene.layers[first] = layer;
              editor.select(layer.id);
            } else scene.layers.push(layer);
            p.exterior.mode = "artwork";
          } else scene.layers.push(layer);
        }
      });
      if (target !== "background")
        editor.select(
          target === "body" && sceneKind === "exterior"
            ? useEditor
                .getState()
                .document!.exterior.scene.layers.find(
                  (l) => l.kind === "image",
                )!.id
            : id,
        );
      setNotice("原始图片已保留，调色只修改参数。");
    });
  const addEffect = (id: (typeof EffectIds)[number]) => {
    if (!currentScene || currentScene.layers.length >= 50) {
      setNotice("图层达到 50 个上限");
      return;
    }
    const layerId = crypto.randomUUID();
    patch((p) => {
      const s = sceneKind === "interior" ? p.interior : p.exterior.scene;
      s.layers.push(
        createDecoration(
          id,
          s,
          p.metadata.palette.primary,
          layerId,
          crypto.getRandomValues(new Uint32Array(1))[0],
        ),
      );
      if (
        (NewDecorationIds.includes(id) ||
          s.layers.some((l) => l.kind === "image")) &&
        !p.requiredCapabilities.includes("decorations@1")
      )
        p.requiredCapabilities.push("decorations@1");
      if (!p.requiredCapabilities.includes("effects@1"))
        p.requiredCapabilities.push("effects@1");
    });
    editor.select(layerId);
  };
  const inspect = (file: File) =>
    action(async () => {
      if (file.name.toLowerCase().endsWith(".json")) {
        if (file.size > 5 * 1024 * 1024) throw new Error("JSON 超过上限");
        const p = validatePlanet(JSON.parse(await file.text()));
        const files = new Map<string, Blob>();
        for (const a of p.assetRefs)
          for (const f of [a.original, ...a.variants]) {
            try {
              const blob = await workspace.read(f.path);
              if (
                blob.size !== f.byteSize ||
                (await sha256(new Uint8Array(await blob.arrayBuffer()))) !==
                  f.sha256
              )
                throw new Error("本地素材与 JSON 声明不一致");
              files.set(f.path, blob);
            } catch {
              throw new DomainError(
                "MISSING_ASSET",
                "仅配置 JSON 缺少本地素材。请使用含素材 ZIP；隔离只读预览待实现。",
              );
            }
          }
        setReport({
          manifest: {
            packageType: "planet",
            packageVersion: VERSION,
            exportMode: "backup",
            documentType: "planet",
            exportId: crypto.randomUUID(),
            exportedAt: new Date().toISOString(),
            entrypoint: "planet.json",
            producer: { name: "JSON import", version: "0.1.0" },
            files: [],
            requiredCapabilities: p.requiredCapabilities,
          },
          planets: [p],
          universe: null,
          files,
          warnings: ["仅配置 JSON，复用此电脑已存在的资源。"],
        });
      } else setReport(await inspectInWorker(file));
    });
  const commitImport = () =>
    action(async () => {
      if (!report) return;
      await flush();
      let u = clone(universe!);
      if (report.universe?.schemaVersion === "1.1.0") u = upgradeUniverse(u);
      const newFiles = new Map<string, Blob>(),
        copied = report.planets.map((p) => {
          const result = copyImportedPlanet(p, report.files);
          for (const [path, b] of result.files) newFiles.set(path, b);
          const sourceEntry = report.universe?.entries.find(
            (e) => e.planetId === p.planetId,
          );
          const importedEntry = {
            planetId: result.planet.planetId,
            visible: sourceEntry?.visible ?? true,
            position:
              sourceEntry?.position ??
              nextPlanetPosition(u.entries, u.layout.seed),
            scale: sourceEntry?.scale ?? 0.65,
            order: u.entries.length,
          };
          if (u.schemaVersion === "1.1.0")
            u.entries.push({
              ...importedEntry,
              layoutRevision: 0,
              motion: sourceEntry?.motion
                ? clone(sourceEntry.motion)
                : undefined,
            });
          else u.entries.push(importedEntry);
          return result.planet;
        });
      if (u.entries.length > 300)
        throw new Error("当前宇宙最多支持 300 颗星球");
      const ok = await workspace.importAtomic(
        copied,
        u,
        newFiles,
        report.manifest.exportId,
      );
      setReport(null);
      await refresh();
      setNotice(
        ok ? "作品已完整导入宇宙。" : "这个作品包已经导入，未重复添加。",
      );
    });
  const exportCurrent = () =>
    action(async () => {
      await flush();
      if (!doc) return;
      const p = await workspace.get(doc.planetId);
      download(
        await exportPackage([p], workspace),
        `${p.metadata.name}.colorverse.zip`,
      );
    });
  const showGrowthSource = (id: string) => {
    if (!doc) return;
    const event = doc.growthEvents.find((e) =>
      e.elements.some((el) => el.layerId === id),
    );
    if (event?.trigger.kind === "mock" || event?.trigger.kind === "archive")
      setModal({
        id: crypto.randomUUID(),
        sceneId: doc.interior.id,
        anchorLayerId: null,
        geometry: { type: "circle", x: 0, y: 0, radius: 1 },
        accessibleLabel: "成长来源作品",
        action: {
          type: "openArchive",
          archiveEntryId: event.trigger.archiveEntryId,
        },
      });
  };
  const showArchive = (archiveEntryId: string) => {
    if (!doc) return;
    setModal({
      id: crypto.randomUUID(),
      sceneId: doc.interior.id,
      anchorLayerId: null,
      geometry: { type: "circle", x: 0, y: 0, radius: 1 },
      accessibleLabel: "展示作品",
      action: { type: "openArchive", archiveEntryId },
    });
  };
  const openElement = (id: string) => {
    if (!doc) return;
    if (
      layoutRole !== "teacher" &&
      ownership[doc.planetId] !== "demo-student-1"
    ) {
      showGrowthSource(id);
      return;
    }
    void action(async () => {
      await flush();
      const document = await workspace.get(doc.planetId);
      const initial = [
        ...document.interior.layers,
        ...document.exterior.scene.layers,
      ].find((l) => l.id === id);
      if (!initial) throw new Error("元素已移除，请重新打开星球");
      editor.load(document);
      setElementSession({
        document,
        initial,
        returnRoute: route === "room" ? "room" : "studio",
      });
      setBirthLayerId(null);
      setModal(null);
      setRoute("element");
    });
  };
  const saveShowcase = async (input: ShowcaseInput) => {
    if (!doc || busy) throw new Error("请等待当前操作完成");
    setBusy(true);
    try {
      await flush();
      const current = useEditor.getState().document!;
      const prepared = await prepareImage(
        input.file,
        current.metadata.authorDisplayName,
      );
      const saved = await showcase.save(
        current.planetId,
        current.revision,
        {
          id: crypto.randomUUID(),
          sourceType: "student",
          title: input.title,
          createdOn: new Date().toLocaleDateString("sv-SE"),
          courseModule: "自选展示",
          description: input.description,
          colorTags: [...input.tags, prepared.sampledColor],
          imageAssetIds: [prepared.record.assetId],
        },
        prepared.record,
        prepared.files,
      );
      editor.load(saved);
      setShowcaseOpen(false);
      try {
        const result = await showcase.grow(
          saved.planetId,
          saved.archiveEntries.at(-1)!.id,
        );
        editor.load(result.document);
        setProposal(null);
        setSceneKind("interior");
        setBirthLayerId(
          result.created ? result.event.elements[0].layerId : null,
        );
        setRoute("room");
        setNotice("作品已提交，小元素已经长出来了。点击它可以修改造型和细节。");
      } catch (e) {
        editor.load(await workspace.get(saved.planetId));
        setNotice(
          `作品已保存；生长暂未完成：${e instanceof Error ? e.message : "请重试"}。可在展示作品列表重试生长。`,
        );
      }
      // A refresh error after commit must not invite saving a second archive.
      await refresh().catch(() =>
        setNotice("作品已保存；列表刷新失败，请重新打开页面查看。"),
      );
    } finally {
      setBusy(false);
    }
  };
  const visible = universe
    ? planets.filter((p) =>
        universe.entries.some((e) => e.planetId === p.planetId && e.visible),
      )
    : [];
  const filtered = filterPlanets(visible, query, family, emotion),
    inspection =
      planets.find((p) => p.planetId === (hover ?? activeId)) ?? filtered[0];
  const filteredUniverse = universe
    ? {
        ...universe,
        entries: universe.entries.filter((e) =>
          filtered.some((p) => p.planetId === e.planetId),
        ),
      }
    : null;
  const archive =
    modal?.action.type === "openArchive"
      ? doc?.archiveEntries.find(
          (a) =>
            a.id ===
            (modal.action as { archiveEntryId: string }).archiveEntryId,
        )
      : null;
  const preview =
    doc && proposal?.status === "proposed" ? growthOverlay(doc, proposal) : doc;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const filteredMemoKey = filtered
    .map((p) => `${p.planetId}:${p.revision}`)
    .join("|");
  const universeViewRef = useRef<{
    key: string;
    planets: PlanetDocument[];
    universe: UniverseDocument | null;
  }>({ key: "", planets: [], universe: null });
  const viewKey = filteredMemoKey + JSON.stringify(universe?.entries);
  if (universeViewRef.current.key !== viewKey)
    universeViewRef.current = {
      key: viewKey,
      planets: filtered,
      universe: filteredUniverse,
    };
  const saveMotion = async (
    planetId: string,
    motion: PlanetMotion,
    expectedLayoutRevision: number,
    position?: { x: number; y: number },
  ) => {
    const entry = universe?.entries.find((e) => e.planetId === planetId);
    if (!universe || !entry) throw new Error("星球已离开当前宇宙");
    try {
      await layoutService.configureMotion(
        {
          universeId: universe.universeId,
          planetId,
          motion,
          expectedLayoutRevision,
          position: position ?? entry.position,
        },
        {
          role: layoutRole,
          userId: layoutRole === "teacher" ? "demo-teacher" : "demo-student-1",
        },
      );
      setUniverse(await workspace.getUniverse());
      setNotice("星球运动设置已保存");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "运动设置保存失败，请重试",
      );
      setUniverse(await workspace.getUniverse());
      throw error;
    }
  };
  if (fatal)
    return (
      <div className="loading" role="alert">
        初始化失败：{fatal}
        <p>请检查浏览器是否允许 IndexedDB，并通过本地服务器打开。</p>
      </div>
    );
  if (!universe)
    return (
      <div className="loading">
        <div className="loading-orbit" />
        正在点亮你的色彩宇宙…
      </div>
    );
  return (
    <div className={`app ${route}`}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => void back()}
          aria-label="返回宇宙总览"
        >
          <span className="brand-mark">◉</span>
          <span>
            COLORVERSE<small>色 彩 宇 宙</small>
          </span>
        </button>
        <nav aria-label="主导航">
          <button
            className={route === "universe" ? "active" : ""}
            onClick={() => void back()}
          >
            宇宙展览
          </button>
          <button
            className={route === "studio" ? "active" : ""}
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const owned = planets.filter(
                  (p) => ownership[p.planetId] === "demo-student-1",
                );
                const mine =
                  owned.find((p) => p.planetId === activeId) ?? owned[0];
                if (!mine) {
                  setNotice("你还没有自己的星球，点击“创建星球”开始创作。");
                  return;
                }
                setSceneKind("exterior");
                await open(mine.planetId, "studio");
              })
            }
          >
            编辑你的星球
          </button>
          <button
            className={route === "teacher" ? "active" : ""}
            onClick={() =>
              void action(async () => {
                await flush();
                setRoute("teacher");
              })
            }
          >
            教师演示
          </button>
          <button
            className={route === "course" ? "active" : ""}
            onClick={() =>
              void action(async () => {
                await flush();
                setRoute("course");
              })
            }
          >
            课程作业
          </button>
        </nav>
        <div className="header-right">
          <span className="local-label">
            <i />
            本地创作空间
          </span>
          <button
            className="primary small"
            onClick={() => void createPlanet()}
            disabled={busy}
          >
            ＋ 创建星球
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
      <input
        hidden
        ref={importInput}
        type="file"
        accept=".zip,.json"
        onChange={(e) => {
          if (e.target.files?.[0]) void inspect(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {route === "course" && <CourseView onPendingChange={setCoursePending} />}
      {route === "universe" && (
        <UniverseView
          workspace={workspace}
          view={universeViewRef.current}
          camera={cameraRef.current}
          viewMode={universeViewMode}
          setViewMode={setUniverseViewMode}
          activeId={activeId}
          motionPaused={motionPaused}
          setMotionPaused={setMotionPaused}
          actor={{
            role: layoutRole,
            userId:
              layoutRole === "teacher" ? "demo-teacher" : "demo-student-1",
          }}
          ownership={ownership}
          onSaveMotion={saveMotion}
          setLayoutRole={setLayoutRole}
          onPlanetMove={async (move: Omit<PlanetMove, "universeId">) => {
            try {
              await layoutService.move(
                { ...move, universeId: universe.universeId },
                {
                  role: layoutRole,
                  userId:
                    layoutRole === "teacher"
                      ? "demo-teacher"
                      : "demo-student-1",
                },
              );
              setUniverse(await workspace.getUniverse());
              setNotice("星球位置已保存");
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : "布局保存失败",
              );
              throw error;
            }
          }}
          onMoveDenied={() =>
            setNotice("这是其他同学的星球。你可以探索，但只能拖拽自己的星球。")
          }
          inspection={inspection}
          visible={visible}
          filtered={filtered}
          query={query}
          family={family}
          emotion={emotion}
          setQuery={setQuery}
          setFamily={setFamily}
          setEmotion={setEmotion}
          setCamera={setCamera}
          setHover={setHover}
          setActiveId={setActiveId}
          open={open}
          action={action}
        />
      )}
      {route === "room" && doc && preview && (
        <PlanetRoomView
          canEdit={
            layoutRole === "teacher" ||
            ownership[doc.planetId] === "demo-student-1"
          }
          workspace={workspace}
          doc={doc}
          preview={preview}
          back={back}
          setRoute={setRoute}
          setModal={setModal}
          showGrowthSource={showGrowthSource}
          onEditElement={openElement}
          birthLayerId={birthLayerId}
        />
      )}
      {route === "element" && elementSession && (
        <ElementEditorView
          key={elementSession.initial.id}
          assets={workspace}
          doc={elementSession.document}
          initial={elementSession.initial}
          onDirty={setElementDirty}
          onSave={async (layer, revision) => {
            const saved = await elementService.save(
              elementSession.document.planetId,
              layer,
              revision,
              { role: layoutRole, userId: "demo-student-1" },
            );
            editor.load(saved);
            setNotice("元素修改已保存。");
            await refresh().catch(() =>
              setNotice("元素已保存；列表刷新失败，请重新打开页面查看。"),
            );
          }}
          onClose={() => {
            setElementDirty(false);
            setRoute(elementSession.returnRoute);
            setElementSession(null);
          }}
        />
      )}
      {route === "studio" && doc && currentScene && preview && (
        <StudioView
          workspace={workspace}
          growth={growth}
          doc={doc}
          currentScene={currentScene}
          preview={preview}
          editor={editor}
          selected={selected}
          proposal={proposal}
          sceneKind={sceneKind}
          saving={saving}
          busy={busy}
          setSceneKind={setSceneKind}
          setRoute={setRoute}
          setNotice={setNotice}
          setModal={setModal}
          setProposal={setProposal}
          showGrowthSource={showGrowthSource}
          onEditElement={openElement}
          action={action}
          flush={flush}
          refresh={refresh}
          patch={patch}
          layerPatch={layerPatch}
          upload={upload}
          exportCurrent={exportCurrent}
          onOpenShowcase={() => setShowcaseOpen(true)}
          showArchive={showArchive}
          onGrowArchive={(id) =>
            void action(async () => {
              await flush();
              const existing = doc.growthEvents.find(
                (e) =>
                  e.trigger.kind === "archive" &&
                  e.trigger.archiveEntryId === id,
              );
              if (existing?.status === "accepted") {
                if (
                  layoutRole !== "teacher" &&
                  ownership[doc.planetId] !== "demo-student-1"
                ) {
                  showGrowthSource(existing.elements[0].layerId);
                  return;
                }
                const document = await workspace.get(doc.planetId);
                const initial = document.interior.layers.find(
                  (l) => l.id === existing.elements[0].layerId,
                );
                if (!initial) throw new Error("元素已移除");
                setElementSession({ document, initial, returnRoute: "studio" });
                editor.load(document);
                setRoute("element");
              } else if (
                existing?.status === "proposed" &&
                existing.provider.adapter !== "showcase-auto-v3"
              ) {
                editor.load(await workspace.get(doc.planetId));
                setSceneKind("interior");
                setProposal(existing);
              } else {
                const result = await showcase.grow(doc.planetId, id);
                editor.load(result.document);
                setProposal(null);
                setSceneKind("interior");
                setBirthLayerId(
                  result.created ? result.event.elements[0].layerId : null,
                );
                setRoute("room");
              }
              await refresh();
            })
          }
          onOpenCourse={() =>
            action(async () => {
              await flush();
              setRoute("course");
            })
          }
          addEffect={addEffect}
          universeEntry={universe.entries.find(
            (e) => e.planetId === doc.planetId,
          )}
          canEditMotion={
            layoutRole === "teacher" ||
            ownership[doc.planetId] === "demo-student-1"
          }
          onSaveMotion={(motion, revision) =>
            saveMotion(doc.planetId, motion, revision)
          }
        />
      )}
      {route === "teacher" && (
        <TeacherView
          workspace={workspace}
          planets={planets}
          universe={universe}
          busy={busy}
          importInput={importInput}
          refresh={refresh}
          open={open}
          action={action}
        />
      )}
      {showcaseOpen && route === "studio" && (
        <ShowcaseDialog
          onSave={saveShowcase}
          onClose={() => setShowcaseOpen(false)}
        />
      )}
      {report && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="作品包校验报告"
          >
            <button className="modal-close" onClick={() => setReport(null)}>
              ×
            </button>
            <p className="eyebrow">PACKAGE VALIDATED</p>
            <h2>作品包已通过完整性校验</h2>
            <p>
              {report.planets.length} 颗星球 · {report.files.size} 个媒体文件 ·
              协议 {report.manifest.packageVersion}
            </p>
            <p className="muted">
              将以新副本加入当前宇宙，保留原有作品。重复导入同一个包不会重复添加。
            </p>
            {report.planets.map((p) => (
              <p key={p.planetId}>
                ✦ {p.metadata.name} / {p.metadata.authorDisplayName}
              </p>
            ))}
            {report.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void commitImport()}
            >
              确认导入宇宙
            </button>
          </section>
        </div>
      )}
      {modal && doc && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal artwork-modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.accessibleLabel}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setModal(null)}>
              ×
            </button>
            <p className="eyebrow">PLANET ARCHIVE</p>
            <h2>{archive?.title ?? modal.accessibleLabel}</h2>
            {archive ? (
              <>
                <p className="muted">
                  {archive.createdOn} · {archive.courseModule}
                </p>
                <AssetImage
                  record={doc.assetRefs.find(
                    (a) => a.assetId === archive.imageAssetIds[0],
                  )}
                  assets={workspace}
                  alt={archive.title}
                  variant="display"
                />
                <p>{archive.description}</p>
                <div className="tags">
                  {archive.colorTags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </>
            ) : modal.action.type === "showText" ? (
              <p>{modal.action.text}</p>
            ) : modal.action.type === "showImage" ? (
              <>
                <AssetImage
                  record={doc.assetRefs.find(
                    (a) =>
                      a.assetId ===
                      (modal.action as { assetId: string }).assetId,
                  )}
                  assets={workspace}
                  alt={modal.action.caption}
                />
                <p>{modal.action.caption}</p>
              </>
            ) : (
              <p>此档案暂不可用。</p>
            )}
          </section>
        </div>
      )}
      <footer className="footer">
        <span>COLORVERSE / DESIGN COLOR EXHIBITION</span>
        <span>
          原创的颜色，让世界生长。
          <span className="version-label"> LOCAL · v0.1</span>
        </span>
      </footer>
    </div>
  );
}
