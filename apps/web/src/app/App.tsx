import { CloudInbox } from "../features/classroom/CloudInbox";
import { showLearningGuide } from "../features/classroom/presentation-options";
import { classroomRequest } from "../features/classroom/cloud-request";
import { download } from "./download";
import { CourseView } from "../features/course/CourseView";
import { TeacherView } from "../features/teacher-demo/TeacherView";
import type { CloudSession, CloudMembership } from "@colorverse/contracts";
import { StudioView } from "../features/studio/StudioView";
import { ElementEditorView } from "../features/studio/ElementEditorView";
import {
  ShowcaseDialog,
  type ShowcaseInput,
} from "../features/studio/ShowcaseDialog";
import { PlanetRoomView } from "../features/planet-room/PlanetRoomView";
import { UniverseView } from "../features/universe/UniverseView";
import type { UniverseViewMode } from "../features/universe/UniverseView";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  VERSION,
  CloudGuideSchema,
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
  clampPlanetPosition,
  findArchiveGrowthElement,
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
import { bootstrap, loadDemoPlanet } from "./bootstrap";
import { AssetImage } from "./AssetImage";
import { useEditor } from "../features/studio/editor-store";
const workspace = new LocalWorkspace(),
  growth = new GrowthService(workspace),
  showcase = new ShowcaseService(workspace, sha256),
  elementService = new GrowthElementService(workspace),
  layoutService = new UniverseLayoutService(workspace);
const AuthEntry = lazy(() =>
  import("../features/auth/AuthEntry").then((module) => ({
    default: module.AuthEntry,
  })),
);
const cloudAuthEnabled = import.meta.env.VITE_ENABLE_CLOUD_AUTH === "true";
const CloudClassroomView = lazy(() =>
  import("../features/classroom/CloudClassroomView").then((m) => ({
    default: m.CloudClassroomView,
  })),
);
const CloudGallery = lazy(() =>
  import("../features/classroom/CloudGallery").then((m) => ({
    default: m.CloudGallery,
  })),
);
export function App() {
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
  const canUseTeacherTools =
    cloudSession?.access === "active" &&
    cloudSession.memberships.some((m) => m.role === "teacher");
  const [guideOpenRequest, setGuideOpenRequest] = useState(0);
  const [cloudGuideProgress, setCloudGuideProgress] = useState<{
    identityId: string;
    classId: string;
    completed: number | null;
  } | null>(null);
  const guideFetchGeneration = useRef(0);
  const reportGuideProgress = useCallback(
    (progress: {
      identityId: string;
      classId: string;
      completed: number | null;
    }) => {
      guideFetchGeneration.current++;
      setCloudGuideProgress(progress);
      try {
        localStorage.setItem(
          `colorverse-guide-class-${progress.identityId}`,
          progress.classId,
        );
      } catch {
        /* Optional remembered class. */
      }
    },
    [],
  );
  const [cloudEntry, setCloudEntry] = useState({ classId: "", sequence: 0 });
  const [cloudNavigation, setCloudNavigation] = useState<{
    action: "universe" | "room" | "edit" | "knowledge" | "submit" | "feedback";
    taskId?: string;
    planetId?: string;
    workId?: string | null;
    sequence: number;
  }>({ action: "universe", sequence: 0 });
  const [cloudPending, setCloudPending] = useState(false);
  const cloudStudent =
    cloudSession?.access === "active" &&
    cloudSession.cloudWrites &&
    cloudSession.memberships.length > 0 &&
    cloudSession.memberships.every((m) => m.role === "student");
  const guideMembershipSignature = cloudStudent
    ? cloudSession.memberships.map((m) => m.classId).join("|")
    : "";
  useEffect(() => {
    if (!cloudStudent || !cloudSession) return;
    let active = true;
    const generation = ++guideFetchGeneration.current;
    const identityId = cloudSession.identity.id;
    let rememberedClass = "";
    try {
      rememberedClass =
        localStorage.getItem(`colorverse-guide-class-${identityId}`) ?? "";
    } catch {
      /* Use the first accessible class if storage is unavailable. */
    }
    const classId =
      cloudSession.memberships.find(
        (m) => m.classId === (cloudEntry.classId || rememberedClass),
      )?.classId ?? cloudSession.memberships[0].classId;
    setCloudGuideProgress({ identityId, classId, completed: null });
    void classroomRequest(`classes/${classId}/guide`)
      .then((r) => r.json())
      .then((value) => {
        if (active && generation === guideFetchGeneration.current)
          setCloudGuideProgress({
            identityId,
            classId,
            completed: CloudGuideSchema.parse(value).completed.length,
          });
      })
      .catch(() => {
        /* The progress entry remains available for retry through the guide. */
      });
    return () => {
      active = false;
    };
  }, [
    cloudStudent,
    cloudSession?.identity.id,
    guideMembershipSignature,
    cloudEntry.classId,
  ]);

  const [planets, setPlanets] = useState<PlanetDocument[]>([]),
    [universe, setUniverse] = useState<UniverseDocument | null>(null),
    [route, setRoute] = useState<
      | "universe"
      | "studio"
      | "room"
      | "teacher"
      | "course"
      | "element"
      | "classroom"
      | "cloudworks"
    >(
      cloudAuthEnabled &&
        localStorage.getItem("colorverse-entered-cloud") === "1"
        ? "cloudworks"
        : "universe",
    ),
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
    [fatal, setFatal] = useState(""),
    [bootAttempt, setBootAttempt] = useState(0);
  const editor = useEditor(),
    saveLock = useRef<Promise<void> | null>(null),
    importInput = useRef<HTMLInputElement>(null);
  const doc = editor.document;
  const ownedPlanets = planets.filter(
    (p) => ownership[p.planetId] === "demo-student-1",
  );
  const myPlanet =
    ownedPlanets.find((p) => p.planetId === activeId) ?? ownedPlanets[0];
  useEffect(() => {
    if (!canUseTeacherTools) {
      setLayoutRole("student");
      setRoute((current) => (current === "teacher" ? "universe" : current));
    }
  }, [canUseTeacherTools]);
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
    let active = true;
    setFatal("");
    bootstrap(workspace)
      .then(() => (active ? refresh() : undefined))
      .catch((e) => {
        if (active) setFatal(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh, bootAttempt]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (
        useEditor.getState().dirty ||
        elementDirty ||
        coursePending ||
        cloudPending ||
        busy
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [coursePending, cloudPending, busy, elementDirty]);
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
    if (cloudPending) {
      setNotice("请先保存或取消云端课堂中的修改，再离开当前页面。");
      return;
    }
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
  const navigateCloud = (next: "universe" | "room" | "edit" | "knowledge") =>
    action(async () => {
      await flush();
      setCloudNavigation((v) => ({ action: next, sequence: v.sequence + 1 }));
      setRoute("cloudworks");
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
      if (myPlanet) {
        await open(myPlanet.planetId, "studio");
        return;
      }
      const { planet: source, files } = await loadDemoPlanet(0);
      const result = copyImportedPlanet(source, files),
        p = result.planet;
      p.metadata.name = "我的新星球";
      p.metadata.authorDisplayName = "我的署名";
      p.growthEvents = [];
      p.interior.layers = [];
      p.interior.tombstones = [];
      p.archiveEntries = [];
      p.interior.hotspots = [];
      p.extensions = {};
      const created = await workspace.createOwnedPlanet(
        p,
        result.files,
        "demo-student-1",
      );
      await refresh();
      setSceneKind("exterior");
      await open(created.planetId, "studio");
      setNotice(
        created.created
          ? "你的星球已创建。以后从“编辑你的星球”继续创作。"
          : "你已拥有星球，已打开编辑页面。",
      );
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
        anchorLayerId: id,
        geometry: { type: "circle", x: 0, y: 0, radius: 1 },
        accessibleLabel: "作业展示",
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
        setNotice(
          result.created
            ? ""
            : "作品已提交。点击对应元素查看作业，再选择编辑元素。",
        );
      } catch (e) {
        editor.load(await workspace.get(saved.planetId));
        setSceneKind("interior");
        setRoute("room");
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
  const archiveElement =
    doc && archive
      ? findArchiveGrowthElement(doc, archive.id, modal?.anchorLayerId)
      : undefined;
  const canEditCurrentPlanet =
    !!doc &&
    !cloudStudent &&
    (layoutRole === "teacher" || ownership[doc.planetId] === "demo-student-1");
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
    const requested = position ?? entry.position;
    const bounded = clampPlanetPosition(
      { ...entry, motion },
      universe.layout.seed,
      requested,
    );
    try {
      await layoutService.configureMotion(
        {
          universeId: universe.universeId,
          planetId,
          motion,
          expectedLayoutRevision,
          position: bounded,
        },
        {
          role: layoutRole,
          userId: layoutRole === "teacher" ? "demo-teacher" : "demo-student-1",
        },
      );
      setUniverse(await workspace.getUniverse());
      setNotice(
        bounded.x !== requested.x || bounded.y !== requested.y
          ? "星球运动设置已保存，位置已向星域内调整以留出运动空间"
          : "星球运动设置已保存",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "运动设置保存失败，请重试",
      );
      setUniverse(await workspace.getUniverse());
      throw error;
    }
  };
  if (!cloudAuthEnabled && !universe)
    return (
      <div className="loading" role={fatal ? "alert" : "status"}>
        {fatal ? (
          <>
            <h1>本机演示暂时无法加载</h1>
            <p>{fatal}</p>
            <p>请检查素材连接和浏览器本地存储权限。</p>
            <button onClick={() => setBootAttempt((n) => n + 1)}>
              重新加载本机演示
            </button>
          </>
        ) : (
          <>
            <div className="loading-orbit" />
            正在点亮你的色彩宇宙…
          </>
        )}
      </div>
    );
  return (
    <div className={`app ${route}${myPlanet ? "" : " needs-planet"}`}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() =>
            void (cloudSession?.access === "active"
              ? navigateCloud("universe")
              : back())
          }
          aria-label="返回宇宙总览"
        >
          <span className="brand-mark">◉</span>
          <span>
            COLORVERSE<small>色 彩 星 球</small>
          </span>
        </button>
        <nav aria-label="主导航">
          {cloudSession?.access === "active" && (
            <>
              {(
                [
                  ["universe", "探索宇宙"],
                  ["room", "我的星球"],
                  ["edit", "编辑星球"],
                  ["knowledge", "色彩的奥秘"],
                ] as const
              ).map(([destination, label]) => (
                <button
                  key={destination}
                  disabled={cloudPending}
                  onClick={() => void navigateCloud(destination)}
                >
                  {label}
                </button>
              ))}
            </>
          )}
          {showLearningGuide &&
            cloudStudent &&
            cloudGuideProgress?.identityId === cloudSession?.identity.id && (
              <button
                className="cloud-progress-entry"
                aria-label="打开功能探索进度"
                aria-description={
                  cloudGuideProgress.completed === null
                    ? "进度等待同步"
                    : `已完成 ${cloudGuideProgress.completed} 项，共 10 项`
                }
                onClick={() => {
                  try {
                    localStorage.setItem(
                      `colorverse-guide-${cloudGuideProgress.identityId}-${cloudGuideProgress.classId}`,
                      "open",
                    );
                  } catch {
                    /* Optional guide preference. */
                  }
                  if (route === "cloudworks") setGuideOpenRequest((r) => r + 1);
                  else
                    void action(async () => {
                      await flush();
                      setCloudEntry((entry) => ({
                        ...entry,
                        classId: cloudGuideProgress.classId,
                      }));
                      setGuideOpenRequest((r) => r + 1);
                      setRoute("cloudworks");
                    });
                }}
              >
                ✦ 功能探索 ·{" "}
                {cloudGuideProgress.completed === null
                  ? "待同步"
                  : `${cloudGuideProgress.completed}/10`}
              </button>
            )}
          {cloudSession?.access === "active" &&
            cloudSession.memberships.some(
              (m) => m.role === "teacher" || m.role === "assistant",
            ) && (
              <button
                className={route === "classroom" ? "active" : ""}
                onClick={() =>
                  void action(async () => {
                    await flush();
                    setRoute("classroom");
                  })
                }
              >
                教师管理
              </button>
            )}
          {cloudSession?.access !== "active" && (
            <button
              className={route === "universe" ? "active" : ""}
              onClick={() => void back()}
            >
              {cloudStudent ? "宇宙演示" : "宇宙展览"}
            </button>
          )}
          {myPlanet && !cloudStudent && cloudSession?.access !== "active" && (
            <button
              className={route === "studio" ? "active" : ""}
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setSceneKind("exterior");
                  await open(myPlanet.planetId, "studio");
                })
              }
            >
              编辑你的星球
            </button>
          )}
          {canUseTeacherTools && cloudSession?.access !== "active" && (
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
          )}
          {!cloudStudent && cloudSession?.access !== "active" && (
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
          )}
        </nav>
        <div className="header-right">
          {cloudSession?.access === "active" && (
            <CloudInbox
              disabled={cloudPending}
              session={cloudSession}
              onSubmit={(classId, taskId) => {
                if (cloudPending) {
                  setNotice("请先保存或取消星球编辑，再打开作业提交。");
                  return;
                }
                setCloudEntry((v) => ({ classId, sequence: v.sequence + 1 }));
                setCloudNavigation((v) => ({
                  action: "submit",
                  taskId,
                  sequence: v.sequence + 1,
                }));
                setRoute("cloudworks");
              }}
              onReaction={(classId, n) => {
                if (cloudPending) {
                  setNotice("请先保存或取消星球编辑，再查看互动。");
                  return;
                }
                setCloudEntry((v) => ({ classId, sequence: v.sequence + 1 }));
                setCloudNavigation((v) => ({
                  action: "feedback",
                  planetId: n.planetId,
                  workId: n.workId,
                  sequence: v.sequence + 1,
                }));
                setRoute("cloudworks");
              }}
            />
          )}
          {cloudAuthEnabled && (
            <Suspense fallback={<span className="muted">连接账户…</span>}>
              <AuthEntry
                onSession={setCloudSession}
                hasPendingChanges={cloudPending}
                onEnter={async (membership: CloudMembership) => {
                  if (
                    busy ||
                    cloudPending ||
                    route === "element" ||
                    (route === "course" && coursePending) ||
                    cloudSession?.access !== "active" ||
                    !cloudSession.memberships.some(
                      (m) => m.enrollmentId === membership.enrollmentId,
                    )
                  )
                    return false;
                  await flush();
                  setCloudEntry((entry) => ({
                    classId: membership.classId,
                    sequence: entry.sequence + 1,
                  }));
                  setCloudNavigation((v) => ({
                    action: "universe",
                    sequence: v.sequence + 1,
                  }));
                  localStorage.setItem("colorverse-entered-cloud", "1");
                  setRoute(
                    membership.role === "student" ? "cloudworks" : "classroom",
                  );
                  return true;
                }}
              />
            </Suspense>
          )}
          <span className="local-label">
            <i />
            {route === "classroom" || route === "cloudworks"
              ? "云端课堂空间"
              : "本地创作空间"}
          </span>
          {universe && !myPlanet && !cloudStudent && (
            <button
              className="primary small"
              onClick={() => void createPlanet()}
              disabled={busy}
            >
              ＋ 创建我的星球
            </button>
          )}
        </div>
      </header>
      {cloudStudent && route !== "cloudworks" && route !== "classroom" && (
        <aside className="cloud-demo-guidance" aria-label="课堂入口提示">
          <span>
            这里是本地视觉演示。设计自己的星球、上传作品和拜访同学，请进入云端课堂。
          </span>
          <button
            className="primary small"
            onClick={() =>
              void action(async () => {
                await flush();
                setRoute("cloudworks");
              })
            }
          >
            进入我的云端星球 →
          </button>
        </aside>
      )}
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
      {route === "classroom" && (
        <Suspense fallback={<main className="loading">正在连接班级…</main>}>
          <CloudClassroomView
            key={`${cloudSession?.identity.id}-${cloudEntry.sequence}`}
            session={cloudSession}
            onPendingChange={setCloudPending}
            initialClassId={cloudEntry.classId}
          />
        </Suspense>
      )}
      {route === "cloudworks" &&
        (cloudSession?.access === "active" ? (
          <Suspense fallback={<main className="loading">正在连接作品…</main>}>
            <CloudGallery
              key={`${cloudSession.identity.id}-${cloudEntry.sequence}`}
              session={cloudSession}
              navigation={cloudNavigation}
              onPendingChange={setCloudPending}
              onGuideProgress={reportGuideProgress}
              guideOpenRequest={guideOpenRequest}
              initialClassId={
                cloudEntry.classId ||
                (cloudGuideProgress?.identityId === cloudSession.identity.id
                  ? cloudGuideProgress.classId
                  : undefined)
              }
            />
          </Suspense>
        ) : (
          <main className="classroom-main">
            <h1>请先登录课堂账户</h1>
          </main>
        ))}
      {route === "universe" && !universe && (
        <main className="loading">
          <h1>色彩星球课堂</h1>
          <p>使用右上角「登录」进入班级。云端课堂可以独立使用。</p>
          {fatal ? (
            <div role="alert">
              <p>本机视觉演示素材暂时无法加载：{fatal}</p>
              <button onClick={() => setBootAttempt((n) => n + 1)}>
                重新加载本机演示
              </button>
            </div>
          ) : (
            <p role="status">正在加载本机视觉演示…</p>
          )}
        </main>
      )}
      {route === "universe" && universe && (
        <UniverseView
          canUseTeacherTools={canUseTeacherTools}
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
            !cloudStudent &&
            (layoutRole === "teacher" ||
              ownership[doc.planetId] === "demo-student-1")
          }
          workspace={workspace}
          doc={doc}
          preview={preview}
          back={back}
          setRoute={setRoute}
          setModal={setModal}
          showGrowthSource={showGrowthSource}
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
          universeEntry={universe?.entries.find(
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
      {route === "teacher" && canUseTeacherTools && universe && (
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
            <button
              className="modal-close"
              aria-label="关闭展示"
              onClick={() => setModal(null)}
            >
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
                <footer className="artwork-actions">
                  <button className="outline" onClick={() => setModal(null)}>
                    返回星球
                  </button>
                  {canEditCurrentPlanet && archiveElement && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => openElement(archiveElement.id)}
                    >
                      编辑元素
                    </button>
                  )}
                </footer>
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
