import { SceneLayout } from "./SceneLayout";
import { FramedImage } from "./FramedImage";
import { CloudPlanetCreator } from "./CloudPlanetCreator";
import { presentationName } from "./presentation-name";
import { showLearningGuide } from "./presentation-options";
import { PlanetExplorer } from "./PlanetExplorer";
import {
  KnowledgePanel,
  IntentFields,
  TaskPrompt,
  TaskSettings,
  WorkIntentView,
  ObservationFields,
  blankIntent,
  blankObservation,
  validObservation,
} from "./LearningPanels";
import { CloudObservatory, type ObservatoryPlanet } from "./CloudObservatory";
import { CloudWorkReview } from "./CloudWorkReview";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  AssignmentCatalog,
  LearningTaskSettingSchema,
  WorkLearningSchema,
  type LearningTaskSetting,
  type LearningIntent,
  type PeerObservation,
  GrowthPresetIds,
  GrowthPresets,
  CloudPlanetDocumentSchema,
  CloudPlanetPresets,
  CloudGuideSchema,
  type CloudGuideStepId,
  type CloudSession,
} from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import { GrowthLibraryChooser } from "../studio/GrowthLibraryChooser";
import { download } from "../../app/download";
import "./classroom.css";
import {
  CloudPlanetAppearance,
  CloudPlanetOrb,
  usePlanetImage,
  usePrivateImage,
  retryPlanetImages,
  type AppearanceSection,
} from "./CloudPlanetAppearance";
import { CloudStudentGuide, CloudAtmosphere } from "./CloudStudentGuide";
const Params = z.object({
  x: z.number().default(0.5),
  y: z.number().default(0.6),
  size: z.number().default(0.65),
  motion: z.enum(["still", "float", "breathe", "rotate"]).default("float"),
});
const Work = z.object({
  id: z.uuid(),
  learning: WorkLearningSchema.nullable().optional(),
  title: z.string(),
  score: z.number().nullable().optional(),
  comment: z.string().optional(),
  description: z.string(),
  presetId: z.enum(GrowthPresetIds),
  color: z.string(),
  createdAt: z.string(),
  params: Params,
  revision: z.number(),
  withdrawn: z.boolean().default(false),
  canRestore: z.boolean().default(true),
});
const Planet = z.object({
  id: z.uuid(),
  owner_enrollment_id: z.uuid(),
  display_name: z.string().transform(presentationName),
  document: CloudPlanetDocumentSchema,
  stats: z
    .object({
      likes: z.number().int().nonnegative(),
      emojis: z.number().int().nonnegative(),
      comments: z.number().int().nonnegative(),
    })
    .default({ likes: 0, emojis: 0, comments: 0 }),
  works: z.array(Work),
});
export const Gallery = z.object({
  actorId: z.uuid(),
  planets: z.array(Planet),
});
type WorkData = z.infer<typeof Work>;
function PrivateImage({ classId, id }: { classId: string; id: string }) {
  const image = usePrivateImage(`classes/${classId}/works/${id}/image`, id);
  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [id]);
  return image.url ? (
    <button
      className={`work-image-button ${zoom ? "zoomed" : ""}`}
      aria-label={zoom ? "还原作品图片" : "放大作品图片"}
      onClick={() => setZoom((v) => !v)}
    >
      <img src={image.url} alt="提交的展示作品" />
    </button>
  ) : (
    <p className="cloud-image-loading">
      {image.error ? (
        <>
          图片读取失败{" "}
          <button type="button" onClick={retryPlanetImages}>
            重新读取作品图片
          </button>
        </>
      ) : (
        "正在读取作品…"
      )}
    </p>
  );
}
export function CloudGallery({
  session,
  initialPlanetId,
  initialClassId,
  onBack,
  onPendingChange,
  onGuideProgress,
  guideOpenRequest = 0,
  navigation,
  experience = false,
  onViewChange,
  initialColorCase,
}: {
  experience?: boolean;
  onViewChange?: (view: string) => void;
  initialColorCase?: import("@colorverse/contracts").EmotionCase;
  session: CloudSession;
  initialPlanetId?: string;
  initialClassId?: string;
  onBack?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onGuideProgress?: (progress: {
    identityId: string;
    classId: string;
    completed: number | null;
  }) => void;
  guideOpenRequest?: number;
  navigation?: {
    action: "universe" | "room" | "edit" | "knowledge" | "submit" | "feedback";
    taskId?: string;
    planetId?: string;
    workId?: string | null;
    sequence: number;
  };
}) {
  const [creationDismissed, setCreationDismissed] = useState(false);
  const memberships = session.access === "active" ? session.memberships : [],
    [classId, setClassId] = useState(
      memberships.find((m) => m.classId === initialClassId)?.classId ??
        memberships[0]?.classId ??
        "",
    ),
    [data, setData] = useState<z.infer<typeof Gallery> | null>(null),
    [planetId, setPlanetId] = useState(initialPlanetId ?? ""),
    [exploring, setExploring] = useState(Boolean(initialPlanetId)),
    [mysteryOpen, setMysteryOpen] = useState(false),
    [exampleDates, setExampleDates] = useState<Record<string, string>>({}),
    [colorCase, setColorCase] = useState<
      import("@colorverse/contracts").EmotionCase | undefined
    >(initialColorCase),
    [creationSkin, setCreationSkin] = useState(0),
    [focusRequest, setFocusRequest] = useState<{
      id: string;
      sequence: number;
    }>(),
    [editLaunch, setEditLaunch] = useState(false),
    [samples, setSamples] = useState<ObservatoryPlanet[]>([]),
    [sample, setSample] = useState<ObservatoryPlanet | null>(null),
    [work, setWork] = useState<WorkData | null>(null),
    [confirmation, setConfirmation] = useState<{
      kind: "work" | "interaction";
      id: string;
      label: string;
      withdrawn?: boolean;
      revision?: number;
    } | null>(null),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<WorkData | null>(null),
    [birth, setBirth] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploadOpen, setUploadOpen] = useState(false),
    [tasks, setTasks] = useState<LearningTaskSetting[]>([]),
    [taskPending, setTaskPending] = useState(false),
    [taskId, setTaskId] = useState(""),
    [intent, setIntent] = useState<LearningIntent>(blankIntent),
    [comparisonGroup, setComparisonGroup] = useState(""),
    [variantLabel, setVariantLabel] = useState(""),
    [observation, setObservation] = useState<PeerObservation>(blankObservation),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [settingsOpen, setSettingsOpen] = useState(false),
    [appearanceDirty, setAppearanceDirty] = useState(false),
    [reviewPending, setReviewPending] = useState(false),
    [settingsSection, setSettingsSection] =
      useState<AppearanceSection>("exterior"),
    [guide, setGuide] = useState<z.infer<typeof CloudGuideSchema> | null>(null),
    [guideError, setGuideError] = useState(false),
    [guideRevision, setGuideRevision] = useState(0),
    [planetBirth, setPlanetBirth] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [comment, setComment] = useState(""),
    [likeCounts, setLikeCounts] = useState<Record<string, number>>({}),
    [interactions, setInteractions] = useState<
      {
        id: string;
        kind: string;
        content: string;
        created_at?: string;
        learning_feedback?: PeerObservation | null;
        display_name: string;
        work_id: string | null;
        own?: boolean;
        can_remove?: boolean;
      }[]
    >([]);
  useEffect(() => {
    let active = true;
    void fetch(`${import.meta.env.BASE_URL}competition/example-work-dates.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((v) => {
        if (active) setExampleDates(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const detailVisible = Boolean(work && !editing);
  const observatoryPlanets = useMemo(
    () => [...(data?.planets ?? []), ...samples],
    [data, samples],
  );
  useEffect(() => {
    let active = true;
    void fetch(`${import.meta.env.BASE_URL}competition/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error("样本暂不可用");
        return r.json();
      })
      .then((v) => {
        const defaults = z
          .array(
            z.object({
              id: z.string(),
              display_name: z.string(),
              document: CloudPlanetDocumentSchema,
            }),
          )
          .max(5)
          .parse(v.defaults);
        if (active)
          setSamples(defaults.map((p) => ({ ...p, sample: true, works: [] })));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!detailVisible) return;
    const previous = document.activeElement as HTMLElement | null,
      x = window.scrollX,
      y = window.scrollY;
    const dialog = document.querySelector<HTMLElement>(
      '[aria-label="云端作品展示"]',
    );
    const frame = requestAnimationFrame(() =>
      dialog
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      requestAnimationFrame(() => {
        if (previous?.isConnected) {
          previous.focus({ preventScroll: true });
          window.scrollTo(x, y);
        }
      });
    };
  }, [detailVisible]);
  const acceptInteractions = (value: {
    interactions: typeof interactions;
    counts?: { workId: string | null; likes: number }[];
  }) => {
    setInteractions(value.interactions);
    setLikeCounts(
      Object.fromEntries(
        (value.counts ?? []).map((c) => [c.workId ?? "planet", c.likes]),
      ),
    );
  };
  const loadedClass = useRef("");
  const generation = useRef(0),
    requestId = useRef(crypto.randomUUID()),
    stage = useRef<HTMLDivElement>(null),
    settings = useRef<HTMLDivElement>(null),
    social = useRef<HTMLElement>(null);
  const pending =
    taskPending ||
    Boolean(
      observation.visualEvidence ||
      observation.suggestion ||
      observation.customMood ||
      observation.perceivedMoods.length,
    ) ||
    busy ||
    editing ||
    uploadOpen ||
    appearanceDirty ||
    reviewPending ||
    Boolean(confirmation) ||
    Boolean(comment.trim());
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  const refresh = async (select?: string) => {
    const result = Gallery.parse(
      await (await classroomRequest(`classes/${classId}/planets`)).json(),
    );
    loadedClass.current = classId;
    setData(result);
    try {
      const v = await (
        await classroomRequest(`classes/${classId}/learning-tasks`)
      ).json();
      setTasks(v.tasks.map((t: unknown) => LearningTaskSettingSchema.parse(t)));
    } catch {
      /* Free exhibition remains available; submit rechecks the selected task on the server. */
    }
    if (select) {
      setPlanetId(select);
      setExploring(true);
    } else
      setPlanetId((current) =>
        result.planets.some((p) => p.id === current)
          ? current
          : (result.planets.find(
              (p) => p.owner_enrollment_id === result.actorId,
            )?.id ??
            (memberships.find((m) => m.classId === classId)?.role === "student"
              ? ""
              : result.planets[0]?.id) ??
            ""),
      );
    return result;
  };
  useEffect(() => {
    let active = true;
    const current = ++generation.current;
    setData(null);
    setGuide(null);
    setGuideError(false);
    setWork(null);
    setTasks([]);
    setTaskId("");
    setIntent(blankIntent());
    setComparisonGroup("");
    setVariantLabel("");
    setObservation(blankObservation());
    setSettingsOpen(false);
    setPlanetBirth("");
    setNotice("");
    setBusy(true);
    void classroomRequest(`classes/${classId}/planets`)
      .then((r) => r.json())
      .then((value) => {
        if (active && current === generation.current) {
          const result = Gallery.parse(value);
          loadedClass.current = classId;
          setData(result);
          setExploring(
            Boolean(initialPlanetId) ||
              (!experience &&
                memberships.find((m) => m.classId === classId)?.role ===
                  "student"),
          );
          setPlanetId(
            initialPlanetId ??
              result.planets.find(
                (p) => p.owner_enrollment_id === result.actorId,
              )?.id ??
              (memberships.find((m) => m.classId === classId)?.role ===
              "student"
                ? ""
                : result.planets[0]?.id) ??
              "",
          );
        }
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [classId, session.identity.id, initialPlanetId]);
  useEffect(() => {
    let active = true;
    void classroomRequest(`classes/${classId}/learning-tasks`)
      .then((r) => r.json())
      .then((v) => {
        if (active)
          setTasks(
            v.tasks.map((t: unknown) => LearningTaskSettingSchema.parse(t)),
          );
      })
      .catch((e) => {
        if (active) setNotice(`教学任务暂不可用：${e.message}；仍可自由展示。`);
      });
    return () => {
      active = false;
    };
  }, [classId, session.identity.id]);
  const selected = data?.planets.find((p) => p.id === planetId),
    owned =
      selected?.owner_enrollment_id === data?.actorId &&
      memberships.find((m) => m.classId === classId)?.role === "student",
    myPlanet = data?.planets.find(
      (p) => p.owner_enrollment_id === data.actorId,
    ),
    student =
      memberships.find((m) => m.classId === classId)?.role === "student";
  useEffect(() => {
    onViewChange?.(
      mysteryOpen
        ? "knowledge"
        : settingsOpen
          ? "edit"
          : student && !myPlanet && !creationDismissed
            ? "create"
            : exploring
              ? "room"
              : "universe",
    );
  }, [
    mysteryOpen,
    settingsOpen,
    exploring,
    student,
    myPlanet?.id,
    creationDismissed,
    onViewChange,
  ]);
  const handledNavigation = useRef(-1);
  useEffect(() => {
    if (
      !navigation ||
      !data ||
      loadedClass.current !== classId ||
      handledNavigation.current === navigation.sequence
    )
      return;
    handledNavigation.current = navigation.sequence;
    setWork(null);
    setEditing(false);
    setSettingsOpen(false);
    setSample(null);
    setMysteryOpen(false);
    if (navigation.action === "knowledge") {
      setMysteryOpen(true);
      return;
    }
    if (navigation.action === "submit") {
      if (!myPlanet) {
        setExploring(false);
        setNotice("请先创建自己的星球，再提交作业。");
        return;
      }
      setPlanetId(myPlanet.id);
      setExploring(true);
      setTaskId(navigation.taskId ?? "");
      setIntent(blankIntent());
      setTitle("");
      setDescription("");
      setFile(null);
      requestId.current = crypto.randomUUID();
      setUploadOpen(true);
      return;
    }
    if (navigation.action === "feedback") {
      const target = data.planets.find((p) => p.id === navigation.planetId);
      if (!target) {
        setNotice("这个星球已删除或暂不可访问，请刷新列表。");
        return;
      }
      setPlanetId(target.id);
      setExploring(true);
      setWork(target.works.find((w) => w.id === navigation.workId) ?? null);
      if (
        navigation.workId &&
        !target.works.some((w) => w.id === navigation.workId && !w.withdrawn)
      )
        setNotice("这份作业已撤下或暂不可访问。");
      return;
    }
    if (experience && navigation.action === "edit") {
      const target =
        staff && navigation.planetId
          ? data.planets.find((p) => p.id === navigation.planetId)
          : myPlanet;
      setCreationDismissed(false);
      setEditLaunch(false);
      if (target) {
        setPlanetId(target.id);
        setExploring(true);
        setSettingsOpen(true);
      } else setExploring(false);
      return;
    }
    if (experience && navigation.planetId && navigation.action === "room") {
      setPlanetId(navigation.planetId);
      setExploring(true);
      return;
    }
    setEditLaunch(navigation.action === "edit");
    if (navigation.action === "universe") {
      setExploring(false);
      return;
    }
    if (myPlanet) setPlanetId(myPlanet.id);
    setExploring(false);
    if (navigation.action === "room" && myPlanet)
      setFocusRequest({ id: myPlanet.id, sequence: navigation.sequence });
  }, [navigation, data, myPlanet]);
  useEffect(() => {
    let active = true;
    if (!student || !myPlanet) return;
    void classroomRequest(`classes/${classId}/guide`)
      .then((r) => r.json())
      .then((value) => {
        if (active) {
          const result = CloudGuideSchema.parse(value);
          setGuide(result);
          setGuideError(false);
          onGuideProgress?.({
            identityId: session.identity.id,
            classId,
            completed: result.completed.length,
          });
        }
      })
      .catch(() => {
        if (active) {
          setGuideError(true);
          onGuideProgress?.({
            identityId: session.identity.id,
            classId,
            completed: null,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    classId,
    student,
    data,
    guideRevision,
    onGuideProgress,
    session.identity.id,
  ]);
  useEffect(() => {
    let active = true;
    if (!student || !myPlanet || !selected || owned) return;
    void classroomRequest(`classes/${classId}/guide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planetId: selected.id }),
    })
      .then(() => {
        if (active) setGuideRevision((r) => r + 1);
      })
      .catch(() => {
        if (active) setGuideError(true);
      });
    return () => {
      active = false;
    };
  }, [classId, student, myPlanet?.id, selected?.id, owned]);
  const background = usePlanetImage(
    classId,
    selected?.id ?? "",
    "interior",
    selected?.document.media.interior?.id,
  );
  useEffect(() => {
    if (!planetBirth) return;
    stage.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setPlanetBirth(""), 4500);
    return () => clearTimeout(timer);
  }, [planetBirth]);
  useEffect(() => {
    let active = true;
    setInteractions([]);
    if (planetId)
      void classroomRequest(
        `classes/${classId}/interactions?planetId=${planetId}`,
      )
        .then((r) => r.json())
        .then((value) => {
          if (active) acceptInteractions(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [classId, planetId, work?.id]);
  useEffect(() => {
    if (!birth) return;
    const timer = setTimeout(() => setBirth(""), 4500);
    return () => clearTimeout(timer);
  }, [birth]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy || reviewPending) return;
      if (confirmation) setConfirmation(null);
      else if (uploadOpen) setUploadOpen(false);
      else if (work && !editing) {
        setWork(null);
        setObservation(blankObservation());
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, reviewPending, uploadOpen, work, editing, confirmation]);
  const perform = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const interact = (
    kind: "like" | "emoji" | "comment",
    content: string,
    observation?: PeerObservation,
  ) =>
    void perform(async () => {
      if (!selected) return;
      await classroomRequest(`classes/${classId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planetId: selected.id,
          workId: work?.id ?? null,
          kind,
          content,
          ...(observation ? { observation } : {}),
          requestId: crypto.randomUUID(),
        }),
      });
      const response = await classroomRequest(
        `classes/${classId}/interactions?planetId=${planetId}`,
      );
      acceptInteractions(await response.json());
      if (observation) setObservation(blankObservation());
      if (kind === "comment")
        setComment((current) =>
          current.trim() === content.trim() ? "" : current,
        );
      setGuideRevision((r) => r + 1);
      setNotice("互动已记录，教师端刷新后可以查看。");
    });
  const staff = memberships.some(
    (m) => m.classId === classId && ["teacher", "assistant"].includes(m.role),
  );
  const targetReactions = interactions.filter(
    (i) => i.own && i.work_id === (work?.id ?? null),
  );
  const reaction = (kind: "like" | "emoji") =>
    targetReactions.find((i) => i.kind === kind);
  const removeInteraction = async (id: string) => {
    await classroomRequest(`classes/${classId}/interactions/${id}`, {
      method: "DELETE",
    });
    const response = await classroomRequest(
      `classes/${classId}/interactions?planetId=${planetId}`,
    );
    acceptInteractions(await response.json());
    setGuideRevision((r) => r + 1);
    setNotice("互动已移除，教师统计刷新后同步更新。");
  };
  const toggleReaction = (kind: "like" | "emoji", content: string) => {
    const current = reaction(kind);
    if (current) void perform(() => removeInteraction(current.id));
    else interact(kind, content);
  };
  const interactionRow = (
    i: (typeof interactions)[number],
    subject: string,
  ) => (
    <div key={i.id} className="cloud-message-row">
      <p>
        <strong>{presentationName(i.display_name)}</strong>{" "}
        {i.kind === "like" ? (
          <>
            <span className="like-heart is-liked" aria-hidden="true">
              ♥
            </span>{" "}
            点赞了{subject}
          </>
        ) : (
          i.content.replace(/^演示留言(?:（[^）]*）)?[：:]\s*/, "")
        )}
        {i.learning_feedback && (
          <>
            <br />
            感受：
            {[
              ...i.learning_feedback.perceivedMoods,
              i.learning_feedback.customMood,
            ]
              .filter(Boolean)
              .join("、")}
            <br />
            画面依据：{i.learning_feedback.visualEvidence}
            {i.learning_feedback.suggestion && (
              <>
                <br />
                建议：{i.learning_feedback.suggestion}
              </>
            )}
          </>
        )}
      </p>
      {i.created_at && (
        <time className="message-time" dateTime={i.created_at}>
          {new Date(i.created_at).toLocaleString("zh-CN", { hour12: false })}
        </time>
      )}
      {i.can_remove && (
        <button
          disabled={busy}
          onClick={() => {
            if (i.kind === "comment")
              setConfirmation({
                kind: "interaction",
                id: i.id,
                label: i.own ? "撤回留言" : "移除留言",
              });
            else void perform(() => removeInteraction(i.id));
          }}
        >
          {i.own ? "撤回" : "移除留言"}
        </button>
      )}
    </div>
  );
  const cancelElement = () => {
    setEditing(false);
    setDraft(null);
    setWork(null);
  };
  const saveElement = async (next: WorkData) => {
    await classroomRequest(`classes/${classId}/works/${next.id}/element`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetId: next.presetId,
        color: next.color,
        ...next.params,
        revision: next.revision,
      }),
    });
    await refresh();
    setEditing(false);
    setWork(null);
    setDraft(null);
    setNotice("元素已保存到云端");
  };
  const guideAction = (id: CloudGuideStepId) => {
    if (
      !myPlanet ||
      busy ||
      editing ||
      birth ||
      planetBirth ||
      uploadOpen ||
      appearanceDirty ||
      work
    )
      return;
    setWork(null);
    setDraft(null);
    setSettingsOpen(false);
    if (["visit", "reaction", "comment"].includes(id)) {
      const peer =
        !owned && selected
          ? selected
          : data?.planets.find((p) => p.owner_enrollment_id !== data.actorId);
      if (!peer) return;
      setPlanetId(peer.id);
      setExploring(true);
      requestAnimationFrame(() => {
        (id === "visit" ? stage.current : social.current)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        if (id === "comment")
          social.current
            ?.querySelector("input")
            ?.focus({ preventScroll: true });
      });
      return;
    }
    setPlanetId(myPlanet.id);
    setExploring(true);
    if (id === "work") {
      requestId.current = crypto.randomUUID();
      setTitle("");
      setDescription("");
      setFile(null);
      setUploadOpen(true);
    } else if (id === "element") {
      const first = myPlanet.works.find((w) => !w.withdrawn);
      if (first) {
        setWork(first);
        setDraft(structuredClone(first));
        setEditing(true);
        requestAnimationFrame(() =>
          stage.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
        );
      }
    } else {
      setSettingsSection(id as AppearanceSection);
      setSettingsOpen(true);
      requestAnimationFrame(() =>
        settings.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  };
  const createPlanet = (random = false) =>
    void perform(async () => {
      const preset = CloudPlanetPresets[creationSkin];
      const result = await (
        await classroomRequest(`classes/${classId}/planets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            random
              ? { random: true }
              : {
                  skin: creationSkin,
                  name: preset.name,
                  color: colorCase?.hex ?? preset.color,
                  summary: preset.summary,
                  reflection: preset.reflection,
                  learningIntent: {
                    ...blankIntent(),
                    ...(colorCase ? { referenceCaseId: colorCase.id } : {}),
                    customMood: preset.mood,
                    paletteColors: [colorCase?.hex ?? preset.color],
                  },
                },
          ),
        })
      ).json();
      await refresh(result.id);
      if (result.created) {
        setPlanetBirth(result.id);
        setNotice("你的星球诞生了，随时可以继续编辑。");
      }
    });
  const finishDesign = async (id: string) => {
    await refresh(id);
    setSettingsOpen(false);
    setExploring(false);
    setEditLaunch(false);
    setFocusRequest({ id, sequence: Date.now() });
  };
  if (
    experience &&
    data &&
    student &&
    !myPlanet &&
    !creationDismissed &&
    !mysteryOpen
  )
    return (
      <main className="experience-editor">
        <CloudPlanetCreator
          classId={classId}
          initialColor={colorCase}
          onPendingChange={onPendingChange}
          onSaved={finishDesign}
          onClose={() => setCreationDismissed(true)}
        />
      </main>
    );
  if (
    experience &&
    selected &&
    settingsOpen &&
    (owned || staff) &&
    !mysteryOpen
  )
    return (
      <main className="experience-editor">
        <CloudPlanetAppearance
          key={selected.id}
          classId={classId}
          id={selected.id}
          document={selected.document}
          works={selected.works.filter((w) => !w.withdrawn)}
          initialSection={settingsSection}
          initialColorCase={colorCase}
          busy={busy}
          run={perform}
          onSaved={() => refresh(selected.id)}
          onClose={() => {
            setSettingsOpen(false);
            setExploring(false);
            setFocusRequest({ id: selected.id, sequence: Date.now() });
          }}
          onDirtyChange={setAppearanceDirty}
        />
      </main>
    );
  return (
    <main
      className={`classroom-main cloud-gallery ${experience && mysteryOpen ? "experience-knowledge" : exploring ? "scene-exploring" : editLaunch ? "editing-launch" : "cloud-main-universe"}`}
    >
      <header className="classroom-heading">
        <div>
          <p className="eyebrow">COLORVERSE · CLASSROOM GALLERY</p>
          <h1>
            {student ? "让你的作品，点亮一颗星球。" : "浏览班级星球与作品。"}
          </h1>
          <p className="muted">
            云端课堂作品 · 班级内可见 · 上传后自动长出一个新元素
          </p>
        </div>
        <div className="row-buttons">
          {onBack && (
            <button disabled={pending} onClick={onBack}>
              返回班级统计
            </button>
          )}
          <select
            aria-label="作品班级"
            disabled={pending}
            value={classId}
            onChange={(e) => {
              setWork(null);
              setEditing(false);
              setClassId(e.target.value);
            }}
          >
            {memberships.map((m) => (
              <option key={m.classId} value={m.classId}>
                {m.title}
              </option>
            ))}
          </select>
          <button
            disabled={pending}
            onClick={() =>
              void perform(async () => {
                await refresh();
              })
            }
          >
            刷新作品
          </button>
        </div>
      </header>
      <button className="mystery-entry" onClick={() => setMysteryOpen(true)}>
        色彩的奥秘 ✧
      </button>
      {staff && !experience && (
        <TaskSettings
          key={`${session.identity.id}:${classId}`}
          classId={classId}
          onTasks={setTasks}
          onPendingChange={setTaskPending}
        />
      )}
      {notice && (
        <p role="status" className="cloud-notice">
          {notice}
        </p>
      )}
      {background.error && (
        <button className="small" onClick={retryPlanetImages}>
          重新读取星球图片
        </button>
      )}
      {student && data && !myPlanet && !experience && (
        <section className="cloud-create">
          <span>✧</span>
          <div>
            <p className="eyebrow">YOUR UNIVERSE STARTS HERE</p>
            <h2>选一个起点，让你的星球诞生</h2>
            <p>先用模板的外观、寄语和场景，之后再上传图片，写下自己的故事。</p>
            <div
              className="cloud-starter-picker"
              role="group"
              aria-label="选择创建模板"
            >
              {CloudPlanetPresets.map((preset, i) => (
                <button
                  key={preset.name}
                  disabled={busy}
                  aria-pressed={creationSkin === i}
                  aria-label={`创建模板 ${preset.name}`}
                  onClick={() => setCreationSkin(i)}
                >
                  <img
                    src={`${import.meta.env.BASE_URL}demo/v2/body-${i}.webp`}
                    alt=""
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
            <h3>{CloudPlanetPresets[creationSkin].name}</h3>
            <p>{CloudPlanetPresets[creationSkin].summary}</p>
            <div className="row-buttons">
              <button
                className="primary"
                disabled={busy}
                onClick={() => createPlanet()}
              >
                {busy ? "正在创造…" : "用这个模板创建星球"}
              </button>
              <button disabled={busy} onClick={() => createPlanet(true)}>
                随机选一颗
              </button>
            </div>
          </div>
        </section>
      )}
      {showLearningGuide && student && myPlanet && (guide || guideError) && (
        <CloudStudentGuide
          key={`${session.identity.id}-${classId}`}
          storageKey={`colorverse-guide-${session.identity.id}-${classId}`}
          openRequest={guideOpenRequest}
          completed={guide?.completed ?? []}
          hasPeers={guide?.hasPeers ?? false}
          busy={
            busy ||
            editing ||
            Boolean(birth || planetBirth || work) ||
            uploadOpen ||
            appearanceDirty ||
            Boolean(comment.trim())
          }
          error={guideError}
          onRetry={() => setGuideRevision((r) => r + 1)}
          onAction={guideAction}
        />
      )}
      {data &&
        data.planets.some(
          (p) => p.stats.likes + p.stats.emojis + p.stats.comments > 0,
        ) && (
          <section className="cloud-highlights" aria-label="班级互动亮点">
            <h2>同学们正在回应这些星球</h2>
            <p className="muted">
              按当前有效点赞、表情和留言总数排列，不代表成绩。
            </p>
            <div>
              {[...data.planets]
                .filter(
                  (p) => p.stats.likes + p.stats.emojis + p.stats.comments > 0,
                )
                .sort(
                  (a, b) =>
                    b.stats.likes +
                      b.stats.emojis +
                      b.stats.comments -
                      (a.stats.likes + a.stats.emojis + a.stats.comments) ||
                    a.id.localeCompare(b.id),
                )
                .slice(0, 3)
                .map((p) => (
                  <button
                    key={p.id}
                    disabled={pending}
                    aria-label={`查看互动亮点：${p.display_name}`}
                    onClick={() => {
                      setPlanetId(p.id);
                      setExploring(true);
                      setExploring(true);
                      setSettingsOpen(false);
                      requestAnimationFrame(() =>
                        stage.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        }),
                      );
                    }}
                  >
                    <CloudPlanetOrb
                      classId={classId}
                      id={p.id}
                      document={p.document}
                    />
                    <span>
                      <strong>{p.document.metadata.name}</strong>
                      <small>
                        ♥ {p.stats.likes} · 表情 {p.stats.emojis} · 留言{" "}
                        {p.stats.comments}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}
      {editLaunch && (
        <section className="own-planet-launch" aria-label="编辑我的星球入口">
          <p className="eyebrow">MY PLANET · YOUR DESIGN</p>
          <h1>编辑我的星球</h1>
          {myPlanet ? (
            <>
              <p>双击自己的星球，修改外貌、内部背景和色彩细节。</p>
              <button
                className="own-planet-preview"
                aria-label="双击编辑我的星球"
                onDoubleClick={() => {
                  setEditLaunch(false);
                  setExploring(true);
                  setSettingsOpen(true);
                }}
              >
                <CloudPlanetOrb
                  classId={classId}
                  id={myPlanet.id}
                  document={myPlanet.document}
                />
                <strong>{myPlanet.document.metadata.name}</strong>
                <small>{myPlanet.display_name}</small>
              </button>
              <button
                onClick={() => {
                  setEditLaunch(false);
                  setExploring(true);
                  setSettingsOpen(true);
                }}
              >
                打开星球编辑器 ↗
              </button>
            </>
          ) : (
            <p>当前账户尚未创建自己的星球。教师可通过教师管理查看学生作品。</p>
          )}
        </section>
      )}
      {data && !exploring && !editLaunch && !mysteryOpen && (
        <CloudObservatory
          movablePlanetIds={
            pending
              ? []
              : staff
                ? data.planets.map((p) => p.id)
                : student && myPlanet
                  ? [myPlanet.id]
                  : []
          }
          onPlanetMove={async (id, position, revision) => {
            if (pending) throw Error("请先完成当前操作，再移动星球。");
            await classroomRequest(
              `classes/${classId}/planets/${id}/position`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ position, revision }),
              },
            );
            await refresh();
          }}
          focusRequest={focusRequest}
          classId={classId}
          planets={observatoryPlanets.filter(
            (p) => staff || p.document.visible !== false,
          )}
          ownId={myPlanet?.id}
          selectedId={planetId}
          onEnter={(id) => {
            if (pending) return;
            const style = samples.find((p) => p.id === id);
            if (style) {
              if (experience) {
                if (student) {
                  setCreationDismissed(false);
                  if (myPlanet) {
                    setPlanetId(myPlanet.id);
                    setSettingsSection("exterior");
                    setColorCase(undefined);
                    setSettingsOpen(true);
                    setExploring(true);
                  }
                }
                return;
              }
              setSample(style);
              return;
            }
            setPlanetId(id);
            setExploring(true);
            setWork(null);
            setSettingsOpen(false);
            requestAnimationFrame(() =>
              stage.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              }),
            );
          }}
        />
      )}
      {selected && exploring && !mysteryOpen && (
        <>
          <div className="cloud-room-heading">
            <div className="row-buttons">
              <button disabled={pending} onClick={() => setExploring(false)}>
                ← 返回宇宙
              </button>
              {onBack && (
                <button disabled={pending} onClick={onBack}>
                  返回班级统计
                </button>
              )}
            </div>
            <div>
              <h2>{selected.document.metadata.name}</h2>
              {selected.document.metadata.summary && (
                <p className="cloud-planet-summary">
                  {selected.document.metadata.summary}
                </p>
              )}
              <p className="muted">
                {editing
                  ? "拖动元素移动，调整细节后点击保存。"
                  : "点击成长元素欣赏对应的作业；选择「编辑元素」再修改。"}
              </p>
            </div>
            {!student && (
              <div className="row-buttons">
                <button
                  disabled={pending}
                  onClick={() => {
                    setSettingsSection("exterior");
                    setColorCase(undefined);
                    setSettingsOpen(true);
                  }}
                >
                  修改星球
                </button>
                <button
                  disabled={pending || Boolean(planetBirth || birth)}
                  onClick={() => {
                    setPlanetBirth(selected.id);
                    setNotice("正在回放星球诞生，不会创建新星球。");
                  }}
                >
                  回看星球诞生
                </button>
                <button
                  disabled={
                    pending ||
                    Boolean(planetBirth || birth) ||
                    !selected.works.some((w) => !w.withdrawn)
                  }
                  onClick={() => {
                    const first = selected.works.find((w) => !w.withdrawn);
                    if (first) {
                      setBirth(first.id);
                      setNotice("正在回放元素生长，不会重复提交作业。");
                    }
                  }}
                >
                  回看元素生长
                </button>
              </div>
            )}
            {owned && (
              <div className="row-buttons">
                <button
                  className="primary"
                  disabled={
                    busy || editing || appearanceDirty || Boolean(planetBirth)
                  }
                  onClick={() => {
                    requestId.current = crypto.randomUUID();
                    setTitle("");
                    setDescription("");
                    setFile(null);
                    setUploadOpen(true);
                  }}
                >
                  ＋ 提交作品 · 点亮新元素
                </button>
              </div>
            )}
          </div>
          {editing && draft && (
            <div className="cloud-edit-toolbar" aria-label="元素编辑操作">
              <span>
                正在编辑「{GrowthPresets[draft.presetId].name}」
                <small>保存或退出后，即可继续自由编辑星球。</small>
              </span>
              <div className="row-buttons">
                <button disabled={busy} onClick={cancelElement}>
                  退出元素编辑
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void perform(() => saveElement(draft))}
                >
                  保存并结束编辑
                </button>
              </div>
            </div>
          )}
          {(owned || staff) && settingsOpen && (
            <div ref={settings}>
              <CloudPlanetAppearance
                key={selected.id}
                classId={classId}
                id={selected.id}
                document={selected.document}
                works={selected.works.filter((w) => !w.withdrawn)}
                initialSection={settingsSection}
                initialColorCase={colorCase}
                busy={busy}
                run={perform}
                onSaved={() => refresh(selected.id)}
                onClose={() => setSettingsOpen(false)}
                onDirtyChange={setAppearanceDirty}
              />
            </div>
          )}
          {background.loading && <p role="status">正在读取星球内部背景…</p>}
          {background.error && (
            <p role="status">
              内部背景读取失败，请点击「重新读取星球图片」重试。
            </p>
          )}
          <SceneLayout
            showReviewStatus={
              staff || selected.owner_enrollment_id === data?.actorId
            }
            onOpenWork={(id) =>
              setWork(selected.works.find((w) => w.id === id) ?? null)
            }
            story={selected.document.metadata}
            author={selected.display_name}
            works={selected.works
              .filter((w) => !w.withdrawn)
              .map((w) => ({ ...w, exampleDate: exampleDates[w.id] }))}
          >
            <PlanetExplorer
              sceneId={`${session.identity.id}:${selected.id}`}
              disabled={editing}
            >
              <div
                className={`cloud-room ${planetBirth === selected.id ? "planet-born" : ""}`}
                ref={stage}
                aria-label="云端星球内部"
                style={{ backgroundColor: selected.document.color }}
              >
                <div
                  className="cloud-room-scenery"
                  style={{
                    filter: `brightness(${selected.document.interiorView.brightness}) saturate(${selected.document.interiorView.saturation})`,
                  }}
                >
                  {
                    <FramedImage
                      placement={selected.document.imagePlacement.interior}
                      color={selected.document.color}
                      className="cloud-room-background"
                      style={{
                        objectFit: selected.document.interiorView.fit,
                        visibility: selected.document.interiorView
                          .backgroundVisible
                          ? "visible"
                          : "hidden",
                      }}
                      src={
                        background.url ||
                        `${import.meta.env.BASE_URL}demo/room-${selected.document.skin}.png`
                      }
                      alt="星球内部背景"
                    />
                  }
                  <div
                    className="cloud-room-tint"
                    style={{ backgroundColor: selected.document.color }}
                  />
                </div>
                <div
                  className="design-ambient"
                  style={
                    {
                      "--preview-color": selected.document.color,
                      "--ambient-strength":
                        selected.document.interiorView.environmentLight,
                    } as React.CSSProperties
                  }
                />
                {selected.document.interiorView.particlesVisible && (
                  <CloudAtmosphere kind={selected.document.atmosphere} />
                )}
                {planetBirth === selected.id && (
                  <div className="cloud-planet-birth" role="status">
                    <CloudPlanetOrb
                      classId={classId}
                      id={selected.id}
                      document={selected.document}
                    />
                    <h3>{selected.document.metadata.name} · 为你诞生</h3>
                    <p>从这里开始，留下你的色彩。</p>
                  </div>
                )}
                {selected.document.interiorView.elementsVisible &&
                  selected.works
                    .filter((w) => !w.withdrawn)
                    .map((w, index) => {
                      const current = editing && draft?.id === w.id ? draft : w;
                      return (
                        <button
                          key={w.id}
                          className={`cloud-growth ${birth === w.id ? "born" : ""} motion-${current.params.motion} ${editing && draft?.id === w.id ? "editing" : ""}`}
                          data-work-id={w.id}
                          title={w.title}
                          aria-label={`查看作品 ${w.title}`}
                          style={{
                            left: `${current.params.x * 100}%`,
                            top: `${current.params.y * 100}%`,
                            width: 110 * current.params.size,
                            height: 110 * current.params.size,
                            animationDelay:
                              birth === w.id ? "0s" : `${index * 0.13}s`,
                          }}
                          onClick={() => {
                            if (editing) return;
                            setWork(w);
                            setDraft(null);
                          }}
                          onPointerDown={(e) => {
                            if (!editing || draft?.id !== w.id || busy) return;
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            if (
                              !editing ||
                              draft?.id !== w.id ||
                              !e.currentTarget.hasPointerCapture(e.pointerId)
                            )
                              return;
                            const bounds =
                              stage.current?.getBoundingClientRect();
                            if (bounds)
                              setDraft({
                                ...draft,
                                params: {
                                  ...draft.params,
                                  x: Math.max(
                                    0.05,
                                    Math.min(
                                      0.95,
                                      (e.clientX - bounds.left) / bounds.width,
                                    ),
                                  ),
                                  y: Math.max(
                                    0.1,
                                    Math.min(
                                      0.9,
                                      (e.clientY - bounds.top) / bounds.height,
                                    ),
                                  ),
                                },
                              });
                          }}
                          onKeyDown={(e) => {
                            if (!editing || draft?.id !== w.id) return;
                            const d = {
                              ArrowLeft: [-0.01, 0],
                              ArrowRight: [0.01, 0],
                              ArrowUp: [0, -0.01],
                              ArrowDown: [0, 0.01],
                            }[e.key];
                            if (d) {
                              e.preventDefault();
                              setDraft({
                                ...draft,
                                params: {
                                  ...draft.params,
                                  x: Math.max(
                                    0.05,
                                    Math.min(0.95, draft.params.x + d[0]),
                                  ),
                                  y: Math.max(
                                    0.1,
                                    Math.min(0.9, draft.params.y + d[1]),
                                  ),
                                },
                              });
                            }
                          }}
                        >
                          <GrowthPresetPreview
                            id={current.presetId}
                            color={current.color}
                          />
                          <span>{w.title}</span>
                        </button>
                      );
                    })}
                {!selected.works.some((w) => !w.withdrawn) && (
                  <div className="cloud-room-empty">
                    ✧
                    <p>
                      {owned
                        ? "上传第一件作品，让星球开始生长。"
                        : "这颗星球正在等待第一件作品。"}
                    </p>
                  </div>
                )}
                {birth && (
                  <div className="cloud-birth-caption">
                    一件作品，长成了一束新的光。
                  </div>
                )}
              </div>
            </PlanetExplorer>
          </SceneLayout>
          {(owned || staff) && selected.works.some((w) => w.withdrawn) && (
            <details className="cloud-withdrawn-list">
              <summary>
                已撤下的作品（{selected.works.filter((w) => w.withdrawn).length}
                ）
              </summary>
              <p className="muted">
                仅作者和教师可查看，原图保留，可恢复展示。仍占用存储空间。
              </p>
              <div className="cloud-work-list">
                {selected.works
                  .filter((w) => w.withdrawn)
                  .map((w) => (
                    <button
                      key={w.id}
                      disabled={busy || editing}
                      onClick={() => setWork(w)}
                    >
                      <GrowthPresetPreview id={w.presetId} color={w.color} />
                      <strong>{w.title}</strong>
                      <small>查看与恢复</small>
                    </button>
                  ))}
              </div>
            </details>
          )}
          {editing && draft && (
            <section
              className="cloud-element-controls"
              aria-label="云端元素编辑"
            >
              <h2>编辑「{GrowthPresets[draft.presetId].name}」</h2>
              <GrowthLibraryChooser
                selected={draft.presetId}
                color={draft.color}
                seed={42}
                disabled={busy}
                onSelect={(id) => setDraft({ ...draft, presetId: id })}
              />
              <div className="cloud-element-settings">
                <label>
                  颜色
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) =>
                      setDraft({ ...draft, color: e.target.value })
                    }
                  />
                </label>
                <label>
                  大小
                  <input
                    type="range"
                    min=".3"
                    max="1.5"
                    step=".05"
                    value={draft.params.size}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        params: {
                          ...draft.params,
                          size: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  运动
                  <select
                    aria-label="元素运动"
                    value={draft.params.motion}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        params: {
                          ...draft.params,
                          motion: e.target
                            .value as WorkData["params"]["motion"],
                        },
                      })
                    }
                  >
                    <option value="still">静止</option>
                    <option value="float">轻轻漂浮</option>
                    <option value="breathe">光亮呼吸</option>
                    <option value="rotate">缓慢旋转</option>
                  </select>
                </label>
                <button
                  disabled={busy}
                  onClick={() => setDraft(structuredClone(work!))}
                >
                  重置本次修改
                </button>
                <button disabled={busy} onClick={cancelElement}>
                  取消修改
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void perform(() => saveElement(draft))}
                >
                  保存元素
                </button>
              </div>
            </section>
          )}
          <section className="cloud-messages" aria-label="星球互动记录">
            <h3>留在星球上的回声</h3>
            {!interactions.some((i) => !i.work_id) && (
              <p className="muted">还没有星球留言，等待下一位旅人留下回应。</p>
            )}
            {interactions
              .filter((i) => !i.work_id)
              .map((i) => interactionRow(i, "这颗星球"))}
          </section>
          {owned && (
            <section className="planet-quick-message">
              <strong>
                星球留言板 ·{" "}
                <span className="like-heart is-liked" aria-hidden="true">
                  ♥
                </span>{" "}
                {likeCounts.planet ?? 0}
              </strong>
              <input
                aria-label="星球留言"
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="欢迎来串门，给朋友们留一句话～"
              />
              <button
                disabled={busy || !comment.trim()}
                onClick={() => interact("comment", comment)}
              >
                发送留言
              </button>
            </section>
          )}
          {!owned && !work && (
            <section className="cloud-social planet-quick-message" ref={social}>
              <strong>为这颗星球留下回应</strong>
              <button
                disabled={busy}
                onClick={() => toggleReaction("like", "")}
              >
                <span
                  className={
                    "like-heart " + (reaction("like") ? "is-liked" : "")
                  }
                  aria-hidden="true"
                >
                  {reaction("like") ? "♥" : "♡"}
                </span>{" "}
                {reaction("like") ? "已点赞" : "点赞星球"} ·{" "}
                {likeCounts.planet ?? 0}
              </button>
              {["✨", "💙", "👏", "🔥", "🌈"].map((emoji) => (
                <button
                  disabled={
                    busy ||
                    Boolean(
                      reaction("emoji") && reaction("emoji")?.content !== emoji,
                    )
                  }
                  key={emoji}
                  aria-pressed={reaction("emoji")?.content === emoji}
                  onClick={() => toggleReaction("emoji", emoji)}
                >
                  {emoji}
                </button>
              ))}
              <input
                aria-label="星球留言"
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="这一趟星球旅行，让你想到什么？留下感受或建议…"
              />
              <button
                disabled={busy || !comment.trim()}
                onClick={() => interact("comment", comment)}
              >
                发送留言
              </button>
            </section>
          )}
        </>
      )}
      {sample && (
        <div className="cloud-modal-backdrop">
          <section
            className="cloud-modal"
            role="dialog"
            aria-modal="true"
            aria-label="默认星球风格"
          >
            <button className="modal-close" onClick={() => setSample(null)}>
              ×
            </button>
            <p className="eyebrow">PLANET STYLE · INSPIRATION</p>
            <h2>{sample.document.metadata.name}</h2>
            <CloudPlanetOrb
              classId={classId}
              id={sample.id}
              document={sample.document}
            />
            <p>
              这是默认外貌风格样本，没有学生作业。可在「编辑我的星球」中选择风格并上传自己的外貌和内部背景。
            </p>
          </section>
        </div>
      )}
      {uploadOpen && (
        <div className="cloud-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="上传云端展示作品"
            className="cloud-modal"
          >
            <button
              className="modal-close"
              disabled={busy}
              onClick={() => setUploadOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">YOUR WORK · YOUR LIGHT</p>
            <h2>展示你最满意的作品</h2>
            {notice && (
              <p role="status" className="cloud-notice">
                {notice}
              </p>
            )}
            <label>
              选择教学任务
              <select
                aria-label="选择教学任务"
                disabled={busy}
                value={taskId}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  setComparisonGroup("");
                }}
              >
                <option value="">自由展示</option>
                {tasks
                  .filter((t) => t.published)
                  .map((t) => (
                    <option key={t.taskId} value={t.taskId}>
                      {t.definition?.title ??
                        AssignmentCatalog.find((task) => task.id === t.taskId)
                          ?.title ??
                        t.taskId}
                    </option>
                  ))}
              </select>
            </label>
            <TaskPrompt
              id={taskId}
              definition={tasks.find((t) => t.taskId === taskId)?.definition}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  if (!file) throw new Error("请选择作品图片");
                  if (file.size > 8388608) throw new Error("图片最多 8 MB");
                  const query = new URLSearchParams({
                    requestId: requestId.current,
                  });
                  const form = new FormData();
                  form.set("image", file);
                  const groupId = taskId
                    ? comparisonGroup || crypto.randomUUID()
                    : null;
                  if (groupId && !comparisonGroup) setComparisonGroup(groupId);
                  form.set(
                    "metadata",
                    JSON.stringify({
                      title,
                      description,
                      learning: {
                        ...intent,
                        taskId: taskId || null,
                        comparisonGroupId: groupId,
                        variantLabel,
                      },
                    }),
                  );
                  const response = await classroomRequest(
                    `classes/${classId}/works?${query}`,
                    {
                      method: "POST",
                      body: form,
                    },
                  );
                  const result = await response.json();
                  await refresh(myPlanet?.id);
                  setUploadOpen(false);
                  setWork(null);
                  if (result.created) setBirth(result.id);
                  setNotice("作品已提交到云端，教师端刷新后可以查看。");
                });
              }}
            >
              <label>
                作品名称
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                作品图片
                <input
                  required
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="muted">
                PNG / JPEG / WebP，最多 8 MB。保留原图，展示图自动优化。
              </p>
              <label>
                想表达什么
                <textarea
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <IntentFields
                value={intent}
                onChange={setIntent}
                disabled={busy}
              />
              {taskId && (
                <>
                  <label>
                    比较组
                    <select
                      aria-label="比较组"
                      value={comparisonGroup}
                      disabled={busy}
                      onChange={(e) => setComparisonGroup(e.target.value)}
                    >
                      <option value="">新建比较组</option>
                      {Array.from(
                        new Set(
                          myPlanet?.works
                            .filter((w) => w.learning?.taskId === taskId)
                            .map((w) => w.learning?.comparisonGroupId)
                            .filter((x): x is string => Boolean(x)) ?? [],
                        ),
                      ).map((id) => (
                        <option key={id} value={id}>
                          关联：
                          {
                            myPlanet?.works.find(
                              (w) => w.learning?.comparisonGroupId === id,
                            )?.title
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    版本标记
                    <input
                      maxLength={40}
                      value={variantLabel}
                      disabled={busy}
                      onChange={(e) => setVariantLabel(e.target.value)}
                      placeholder="例如：宁静版 / 活跃版"
                    />
                  </label>
                  <p className="muted">
                    {tasks.find((t) => t.taskId === taskId)?.requireExplanation
                      ? "本任务要求氛围与理由。"
                      : "说明可选。"}{" "}
                    {tasks.find((t) => t.taskId === taskId)?.showIntentToPeers
                      ? "同伴可查看作者意图。"
                      : "同伴先观察，作者意图仅本人和教师可见。"}
                  </p>
                </>
              )}
              <button
                className="primary"
                disabled={busy || !file || !title.trim()}
              >
                {busy ? "正在保存和生成元素…" : "提交并点亮星球"}
              </button>
            </form>
          </section>
        </div>
      )}
      {work && !editing && (
        <div className="cloud-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="云端作品展示"
            className="cloud-modal cloud-artwork"
          >
            <button
              className="modal-close"
              disabled={busy || reviewPending || Boolean(confirmation)}
              onClick={() => {
                setWork(null);
                setComment("");
                setObservation(blankObservation());
              }}
            >
              ×
            </button>
            <PrivateImage classId={classId} id={work.id} />
            <h2>{work.title}</h2>
            <p>{work.description}</p>
            <WorkIntentView learning={work.learning} />
            {work.learning?.comparisonGroupId && (
              <div className="row-buttons">
                {selected?.works
                  .filter(
                    (w) =>
                      !w.withdrawn &&
                      w.learning?.comparisonGroupId ===
                        work.learning?.comparisonGroupId &&
                      w.id !== work.id,
                  )
                  .map((w) => (
                    <button
                      key={w.id}
                      disabled={busy || reviewPending}
                      onClick={() => {
                        setWork(w);
                        setObservation(blankObservation());
                      }}
                    >
                      查看同组：{w.learning?.variantLabel || w.title}
                    </button>
                  ))}
              </div>
            )}
            <p className="muted">
              {selected?.display_name} ·{" "}
              {new Date(work.createdAt).toLocaleDateString("zh-CN")}
            </p>
            {work.withdrawn && (
              <p className="cloud-withdrawn-note">
                作品已撤下，仅作者和教师可查看。原图、元素设置和互动保留；仍计入存储限额。
              </p>
            )}
            <CloudWorkReview
              key={`${session.identity.id}:${classId}:${work.id}`}
              classId={classId}
              workId={work.id}
              staff={staff}
              withdrawn={work.withdrawn}
              onSaved={() => refresh(selected?.id)}
              onPendingChange={setReviewPending}
            />
            <div className="row-buttons">
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const response = await classroomRequest(
                      `classes/${classId}/works/${work.id}/original`,
                    );
                    const blob = await response.blob();
                    const extension =
                      blob.type === "image/jpeg"
                        ? "jpg"
                        : blob.type === "image/png"
                          ? "png"
                          : "webp";
                    download(blob, `${work.title}-原图.${extension}`);
                  })
                }
              >
                下载原图
              </button>
              <section className="work-community" aria-label="作品互动记录">
                <h3>这件作品收到的回应</h3>
                {!interactions.some((i) => i.work_id === work.id) && (
                  <p>还没有回应。邀请同学进入这颗星球，留下他们的观察。</p>
                )}
                {interactions
                  .filter((i) => i.work_id === work.id)
                  .map((i) => interactionRow(i, "作品"))}
              </section>
              {owned && !work.withdrawn && (
                <button
                  className="primary"
                  onClick={() => {
                    setDraft(structuredClone(work));
                    setEditing(true);
                  }}
                >
                  编辑元素
                </button>
              )}
              {(owned || staff) &&
                (!work.withdrawn || staff || work.canRestore) && (
                  <button
                    disabled={busy || reviewPending}
                    onClick={() =>
                      setConfirmation({
                        kind: "work",
                        id: work.id,
                        label: work.withdrawn ? "恢复展示" : "撤下作品",
                        withdrawn: !work.withdrawn,
                        revision: work.revision,
                      })
                    }
                  >
                    {work.withdrawn ? "恢复展示" : "撤下作品"}
                  </button>
                )}
              {owned && work.withdrawn && !work.canRestore && !staff && (
                <span className="muted">教师撤下的作品，请联系教师恢复。</span>
              )}
            </div>
            {owned && !work.withdrawn && (
              <section
                className="cloud-social work-community"
                aria-label="回复同学"
              >
                <h3>
                  这件作品 ·{" "}
                  <span className="like-heart is-liked" aria-hidden="true">
                    ♥
                  </span>{" "}
                  {likeCounts[work.id] ?? 0}
                </h3>
                <input
                  aria-label="作品留言"
                  maxLength={500}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="回应同学的感受，说说你的新想法…"
                />
                <button
                  disabled={busy || !comment.trim()}
                  onClick={() => interact("comment", comment)}
                >
                  发送回复
                </button>
              </section>
            )}
            {!owned && !work.withdrawn && (
              <section
                className="cloud-social work-community"
                aria-label="同学互动"
              >
                <h3>点赞、表情与留言</h3>
                <p className="muted">
                  以下互动保存在当前班级，作者和同学可重新打开查看。
                </p>
                <button
                  disabled={busy}
                  onClick={() => toggleReaction("like", "")}
                >
                  <span
                    className={
                      "like-heart " + (reaction("like") ? "is-liked" : "")
                    }
                    aria-hidden="true"
                  >
                    {reaction("like") ? "♥" : "♡"}
                  </span>{" "}
                  {reaction("like") ? "已点赞" : "点赞作品"} ·{" "}
                  {likeCounts[work.id] ?? 0}
                </button>
                {["✨", "💙", "👏", "🔥", "🌈"].map((emoji) => (
                  <button
                    key={emoji}
                    disabled={
                      busy ||
                      Boolean(
                        reaction("emoji") &&
                        reaction("emoji")?.content !== emoji,
                      )
                    }
                    aria-pressed={reaction("emoji")?.content === emoji}
                    onClick={() => toggleReaction("emoji", emoji)}
                  >
                    {emoji}
                  </button>
                ))}
                {student && work.learning?.policy.allowPeerReview !== false && (
                  <details className="guided-peer-feedback">
                    <summary>写一条有依据的配色反馈（可选）</summary>
                    <ObservationFields
                      value={observation}
                      onChange={setObservation}
                      disabled={busy}
                    />
                    <button
                      disabled={busy || !validObservation(observation)}
                      onClick={() =>
                        interact("comment", "教学观察反馈", observation)
                      }
                    >
                      提交观察反馈
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setObservation(blankObservation())}
                    >
                      清除反馈草稿
                    </button>
                  </details>
                )}
                <label className="quick-peer-comment">
                  写下你的感受
                  <input
                    aria-label="作品留言"
                    value={comment}
                    maxLength={500}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="这件作品让你想到了什么？"
                  />
                </label>
                <button
                  disabled={busy || !comment.trim()}
                  onClick={() => interact("comment", comment)}
                >
                  发送留言
                </button>
              </section>
            )}
          </section>
        </div>
      )}
      {mysteryOpen && (
        <div className={experience ? "" : "cloud-modal-backdrop"}>
          <section
            className={experience ? "" : "cloud-modal mystery-modal"}
            role={experience ? undefined : "dialog"}
            aria-modal={experience ? undefined : true}
            aria-label="色彩的奥秘"
          >
            {!experience && (
              <button
                className="modal-close"
                aria-label="关闭色彩的奥秘"
                onClick={() => setMysteryOpen(false)}
              >
                ×
              </button>
            )}
            <KnowledgePanel
              expanded
              onBack={() => setMysteryOpen(false)}
              backLabel={exploring ? "返回星球" : "返回宇宙"}
              onApplyColor={
                student || myPlanet
                  ? (c) => {
                      if (!myPlanet) {
                        if (!student) {
                          setNotice("请使用学生账户，把颜色带回自己的星球。");
                          return;
                        }
                        setColorCase(c);
                        setMysteryOpen(false);
                        setExploring(false);
                        setNotice(
                          `已选中${c.name}，创建自己的星球后即可继续设计。`,
                        );
                        return;
                      }
                      if (
                        appearanceDirty &&
                        !window.confirm(
                          "应用案例色会更新主色调。是否保留其他编辑并继续？",
                        )
                      )
                        return;
                      setColorCase(c);
                      setMysteryOpen(false);
                      setPlanetId(myPlanet.id);
                      setEditLaunch(false);
                      setExploring(true);
                      setSettingsSection("tone");
                      setSettingsOpen(true);
                    }
                  : undefined
              }
            />
          </section>
        </div>
      )}
      {confirmation && (
        <div className="cloud-modal-backdrop cloud-confirm-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="确认管理操作"
            className="cloud-modal cloud-confirm"
          >
            <h2>{confirmation.label}？</h2>
            <p>
              {confirmation.kind === "interaction"
                ? "留言移除后无法恢复，对应互动次数也会减少。"
                : confirmation.withdrawn
                  ? "作品和对应元素会一起退出展示。原图、元素设置和互动保留，可恢复；教师统计只计入正在展示的作品及互动。"
                  : "恢复后，作品、元素和原有互动将重新展示，教师统计也会恢复。"}
            </p>
            {notice && <p role="status">{notice}</p>}
            <div className="row-buttons">
              <button
                disabled={busy}
                onClick={() => setConfirmation(null)}
                autoFocus
              >
                取消
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (confirmation.kind === "interaction")
                      await removeInteraction(confirmation.id);
                    else {
                      await classroomRequest(
                        `classes/${classId}/works/${confirmation.id}/visibility`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            withdrawn: confirmation.withdrawn,
                            revision: confirmation.revision,
                          }),
                        },
                      );
                      setWork(null);
                      setDraft(null);
                      setComment("");
                      await refresh();
                      setNotice(
                        confirmation.withdrawn
                          ? "作品已撤下，可在已撤下的作品中恢复。原图保留，仍占用存储空间。"
                          : "作品、元素和原有互动已恢复展示。",
                      );
                    }
                    setConfirmation(null);
                  })
                }
              >
                {busy ? "正在保存…" : `确认${confirmation.label}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
