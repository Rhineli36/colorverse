import { useEffect, useRef, useState } from "react";
import {
  ExperienceHeader,
  RoleChoices,
  type ExperienceDestination,
} from "../classroom/ExperienceHeader";
import "../classroom/experience.css";
import { TeacherDashboard } from "../classroom/TeacherDashboard";
import { ReviewPanel } from "../classroom/ReviewPanel";
import { FramedImage } from "../classroom/FramedImage";
import { StudentIdentityForm } from "../classroom/StudentIdentityForm";
import { PendingSubmissions } from "../classroom/PendingSubmissions";
import {
  GrowthPresetIds,
  hasTeacherReview,
  GrowthPresets,
  type EmotionCase,
  AssignmentCatalog,
  type ClassroomNotification,
} from "@colorverse/contracts";
import { nextGrowthPlacement, growthElementColor } from "@colorverse/domain";
import {
  Snapshot,
  type Data,
  type Artwork,
  type ExperiencePlanetData,
} from "./competition-model";
import {
  OfflineExperienceStore,
  blankExperience,
  type OfflineState,
  type ExperienceRole,
} from "./offline-store";
import { OfflinePlanetEditor, importOfflineImage } from "./OfflinePlanetEditor";
import {
  AssignmentPublisher,
  AssignmentMail,
  ClassroomInbox,
} from "../classroom/ClassroomMail";
import { AssignmentBrief } from "../classroom/AssignmentBrief";
import { CloudObservatory } from "../classroom/CloudObservatory";
import { presentationName } from "../classroom/presentation-name";
import { PlanetExplorer } from "../classroom/PlanetExplorer";
import { SceneLayout } from "../classroom/SceneLayout";
import { KnowledgePanel } from "../classroom/LearningPanels";
import { CloudAtmosphere } from "../classroom/CloudStudentGuide";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import "../classroom/classroom.css";
import "./competition.css";
import "./offline-experience.css";
const root = `${import.meta.env.BASE_URL}competition/`;
const roleKey = "colorverse.offline.role.v1";
function rememberedRole(): ExperienceRole {
  try {
    const r = sessionStorage.getItem(roleKey);
    return r === "teacher" || r === "student" ? r : "guest";
  } catch {
    return "guest";
  }
}
export function CompetitionView({
  readOnly = false,
  hideHeader = false,
  navigation,
  onRequestLogin,
  onViewChange,
}: {
  readOnly?: boolean;
  hideHeader?: boolean;
  navigation?: { destination: ExperienceDestination; sequence: number };
  onRequestLogin?: (colorCase?: EmotionCase) => void;
  onViewChange?: (view: string) => void;
} = {}) {
  const store = useRef<OfflineExperienceStore | null>(null);
  store.current ??= new OfflineExperienceStore();
  const [data, setData] = useState<Data | null>(null),
    [state, setState] = useState<OfflineState>(blankExperience),
    [ready, setReady] = useState(false),
    [role, setRole] = useState<ExperienceRole>(() =>
      readOnly ? "guest" : rememberedRole(),
    ),
    [loginOpen, setLoginOpen] = useState(false),
    [tab, setTab] = useState("universe"),
    [selected, setSelected] = useState("demo-1"),
    [focusRequest, setFocusRequest] = useState<{
      id: string;
      sequence: number;
    }>(),
    [editTarget, setEditTarget] = useState<
      ExperiencePlanetData | null | undefined
    >(),
    [colorCase, setColorCase] = useState<EmotionCase>(),
    [work, setWork] = useState<Artwork | null>(null),
    [elementDraft, setElementDraft] = useState<Artwork | null>(null),
    [uploadOpen, setUploadOpen] = useState(false),
    [resetOpen, setResetOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [urls, setUrls] = useState(new Map<string, string>()),
    [birth, setBirth] = useState(""),
    [imageZoom, setImageZoom] = useState(false),
    [grade, setGrade] = useState(""),
    [review, setReview] = useState("");
  useEffect(() => {
    if (navigation)
      setTab(navigation.destination === "knowledge" ? "learning" : "universe");
  }, [navigation?.sequence]);
  useEffect(() => {
    onViewChange?.(editTarget !== undefined ? "edit" : tab);
  }, [tab, editTarget, onViewChange]);
  const reviewDirty =
    role === "teacher" &&
    Boolean(
      work &&
      (grade !== (work.score?.toString() ?? "") ||
        review !== (work.comment ?? "")),
    );
  const assignmentCatalog = [...AssignmentCatalog, ...state.customTasks];
  const [mailTask, setMailTask] = useState<string>(),
    [uploadTaskId, setUploadTaskId] = useState("");
  const [sceneFailed, setSceneFailed] = useState(false),
    [workFailed, setWorkFailed] = useState(false),
    [imageRetry, setImageRetry] = useState(0);
  const workDialog = useRef<HTMLDialogElement>(null),
    loginDialog = useRef<HTMLDialogElement>(null),
    editorDirty = useRef(false),
    resetDialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null),
    [comment, setComment] = useState(""),
    [workTitle, setWorkTitle] = useState(""),
    [rationale, setRationale] = useState(""),
    [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (loginOpen && readOnly) {
      onRequestLogin?.(colorCase);
      setLoginOpen(false);
      return;
    }
    if (loginOpen && !loginDialog.current?.open)
      loginDialog.current?.showModal();
  }, [loginOpen, readOnly, onRequestLogin]);
  useEffect(() => {
    let active = true;
    setError("");
    void Promise.all([
      fetch(root + "manifest.json", { signal: AbortSignal.timeout(10000) })
        .then((r) => {
          if (!r.ok) throw Error("星球资料读取失败，请重新加载。");
          return r.json();
        })
        .then((v) => Snapshot.parse(v)),
      readOnly ? Promise.resolve(blankExperience()) : store.current!.load(),
    ])
      .then(([d, s]) => {
        if (active) {
          setData(d);
          setState(s);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "本机空间读取失败，请重新加载。",
          );
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    let active = true;
    const values = new Map<string, string>();
    const planets = [
      ...(state.ownPlanet ? [state.ownPlanet] : []),
      ...Object.values(state.overrides),
    ];
    const keys = new Set(
      planets
        .flatMap((p) => [
          p.exterior,
          p.interior,
          ...p.works.map((w) => w.image),
        ])
        .filter((s): s is string => Boolean(s?.startsWith("local:"))),
    );
    void Promise.all(
      Array.from(keys, async (key) => {
        const blob = await store.current!.media(key);
        if (blob) values.set(key, URL.createObjectURL(blob));
      }),
    ).then(() => {
      if (active) setUrls(values);
      else for (const u of values.values()) URL.revokeObjectURL(u);
    });
    return () => {
      active = false;
      for (const u of values.values()) URL.revokeObjectURL(u);
    };
  }, [state.revision]);
  useEffect(() => {
    setSceneFailed(false);
  }, [selected, state.revision]);
  useEffect(() => {
    if (work && !workDialog.current?.open) workDialog.current?.showModal();
    setWorkFailed(false);
    setImageZoom(false);
    setComment("");
    setGrade(work?.score?.toString() ?? "");
    setReview(work?.comment ?? "");
  }, [work?.id]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (resetOpen && !resetDialog.current?.open)
      resetDialog.current?.showModal();
  }, [resetOpen]);
  useEffect(() => {
    if (!birth) return;
    const timer = setTimeout(() => setBirth(""), 4500);
    return () => clearTimeout(timer);
  }, [birth]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const image = (key?: string) =>
    key?.startsWith("local:") ? urls.get(key) : key ? root + key : undefined;
  const examples: ExperiencePlanetData[] =
    data?.students.map(
      (p) => state.overrides[p.id] ?? { ...p, visible: true },
    ) ?? [];
  const planets = [...examples, ...(state.ownPlanet ? [state.ownPlanet] : [])],
    planet = planets.find((p) => p.id === selected),
    owned = planet?.id === "my-offline-planet";
  const chooseRole = (r: ExperienceRole) => {
    setRole(r);
    setLoginOpen(false);
    try {
      sessionStorage.setItem(roleKey, r);
    } catch {}
    setWork(null);
    setTab("universe");
    setNotice("");
    setEditTarget(undefined);
    if (r === "student" && !state.identity) return;
    if (r === "student" && colorCase) setEditTarget(state.ownPlanet ?? null);
    else if (r === "student" && !state.ownPlanet) setEditTarget(null);
    else if (r === "student" && state.ownPlanet) {
      setSelected(state.ownPlanet.id);
      setFocusRequest({ id: state.ownPlanet.id, sequence: Date.now() });
    }
  };
  const leaveEditor = () => {
    if (
      editTarget !== undefined &&
      editorDirty.current &&
      !confirm("还有未保存的修改，离开编辑？")
    )
      return false;
    editorDirty.current = false;
    setEditTarget(undefined);
    return true;
  };
  const logout = () => {
    if (busy || !leaveEditor()) return;
    setRole("guest");
    setTab("universe");
    setWork(null);
    setUploadOpen(false);
    setResetOpen(false);
    setColorCase(undefined);
    setNotice("");
    try {
      sessionStorage.removeItem(roleKey);
    } catch {}
  };
  const myPlanet = () => {
    if (!leaveEditor()) return;
    if (!state.ownPlanet) {
      setEditTarget(null);
      return;
    }
    setTab("universe");
    setSelected(state.ownPlanet.id);
    setFocusRequest({ id: state.ownPlanet.id, sequence: Date.now() });
  };
  const savePlanet = async (
    p: ExperiencePlanetData,
    media = new Map<string, Blob>(),
  ) => {
    if (!role) return;
    const next = await store.current!.savePlanet(
      state.revision,
      role,
      p,
      media,
    );
    setState(next);
    setNotice("已保存");
  };
  const records = (workId: string | null) => {
    const initial = workId
      ? planet?.works.find((w) => w.id === workId)?.interactions
      : planet?.planetInteractions;
    return [
      ...(initial ?? []).map((r, i) => ({
        ...r,
        id: "preset-" + i,
        createdAt: "",
      })),
      ...state.interactions.filter(
        (i) => i.planetId === selected && i.workId === workId,
      ),
    ];
  };
  const interact = (
    kind: "like" | "emoji" | "comment",
    content: string,
    workId: string | null,
  ) =>
    void run(async () => {
      if (!role) return;
      if (kind === "comment" && !content.trim()) return;
      const next = await store.current!.interact(state.revision, role, {
        planetId: selected,
        workId,
        kind,
        content: content.trim(),
      });
      setState(next);
      setComment("");
      setNotice("已保存");
    });
  const social = (workId: string | null) => (
    <section
      className={
        workId ? "work-community offline-social" : "offline-planet-social"
      }
      aria-label={workId ? "作品交流" : "星球留言"}
    >
      <h3>
        {workId ? "同学的回应" : "来这颗星球坐坐"}{" "}
        <small>
          <span className="like-heart is-liked" aria-hidden="true">
            ♥
          </span>{" "}
          {records(workId).filter((r) => r.kind === "like").length}
        </small>
      </h3>
      <div className="offline-replies">
        {records(workId).length ? (
          records(workId).map((r) => (
            <article key={r.id}>
              <strong>{presentationName(r.author)}</strong>
              <p>
                {r.kind === "like" ? (
                  <>
                    <span className="like-heart is-liked" aria-hidden="true">
                      ♥
                    </span>{" "}
                    点亮了一份喜欢
                  </>
                ) : (
                  r.content.replace(/^演示留言[：:]\s*/, "")
                )}
              </p>
              {r.createdAt && (
                <time dateTime={r.createdAt}>
                  {new Date(r.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </time>
              )}
            </article>
          ))
        ) : (
          <p className="muted">
            {workId
              ? "说说你的色彩感受，让不同的理解在这里相遇。"
              : "还没有人留下脚印，下一位旅人会是谁？"}
          </p>
        )}
      </div>
      {role && role !== "guest" && (
        <div className="offline-comment-composer">
          <button
            className="like-toggle"
            aria-pressed={state.interactions.some(
              (i) =>
                i.planetId === selected &&
                i.workId === workId &&
                i.kind === "like" &&
                (i.actor
                  ? i.actor === role
                  : i.author ===
                    (role === "teacher" ? "体验教师" : "体验同学")),
            )}
            disabled={busy}
            onClick={() => interact("like", "", workId)}
          >
            <span
              className={
                "like-heart " +
                (state.interactions.some(
                  (i) =>
                    i.planetId === selected &&
                    i.workId === workId &&
                    i.kind === "like" &&
                    (i.actor
                      ? i.actor === role
                      : i.author ===
                        (role === "teacher" ? "体验教师" : "体验同学")),
                )
                  ? "is-liked"
                  : "")
              }
              aria-hidden="true"
            >
              {state.interactions.some(
                (i) =>
                  i.planetId === selected &&
                  i.workId === workId &&
                  i.kind === "like" &&
                  (i.actor
                    ? i.actor === role
                    : i.author ===
                      (role === "teacher" ? "体验教师" : "体验同学")),
              )
                ? "♥"
                : "♡"}
            </span>{" "}
            {workId ? "喜欢作品" : "喜欢这颗星球"} ·{" "}
            {records(workId).filter((r) => r.kind === "like").length}
          </button>
          {["✨", "💙", "👏", "🔥", "🌈"].map((e) => (
            <button
              disabled={busy}
              key={e}
              aria-label={`发送${e}`}
              onClick={() => interact("emoji", e, workId)}
            >
              {e}
            </button>
          ))}
          <input
            aria-label={workId ? "作品留言" : "星球留言"}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              workId
                ? "你感受到怎样的氛围？是哪种颜色或细节带来了这种感受？"
                : "来踩踩，或者夸夸这颗星球的颜色～"
            }
          />
          <button
            disabled={busy || !comment.trim()}
            onClick={() => interact("comment", comment, workId)}
          >
            发送
          </button>
        </div>
      )}
    </section>
  );
  if (error)
    return (
      <main className="offline-failure">
        <p role="alert">{error}</p>
        <button onClick={() => setRetry((n) => n + 1)}>重新加载</button>
      </main>
    );
  if (!ready || !data) return <p role="status">正在展开色彩宇宙…</p>;
  const visible = planets.filter((p) => p.visible || role === "teacher");
  const notifications: ClassroomNotification[] = [
    ...(role === "teacher" && state.ownPlanet && state.planetCreatedAt
      ? [
          {
            id: `planet-created:${state.ownPlanet.id}`,
            kind: "planet-created" as const,
            title: `${state.identity?.realName ?? state.ownPlanet.display_name}创建了「${state.ownPlanet.document.metadata.name}」`,
            content: "评审体验班级 · 演示内容",
            createdAt: state.planetCreatedAt,
            planetId: state.ownPlanet.id,
          },
        ]
      : []),
    ...(role === "teacher"
      ? planets.flatMap((p) =>
          p.works.map((w) => ({
            id: `submission:${w.id}`,
            kind: "submission" as const,
            title: `${p.display_name} · ${w.title}`,
            createdAt: w.exampleDate ?? w.createdAt ?? "2026-01-01T00:00:00Z",
            planetId: p.id,
            workId: w.id,
            pending: !hasTeacherReview(w.score, w.comment),
          })),
        )
      : []),
    ...state.assignments.map((a) => ({
      id: a.id,
      kind: "assignment" as const,
      taskId: a.taskId,
      title: `老师发布了作业：${assignmentCatalog.find((t) => t.id === a.taskId)?.title}`,
      createdAt: a.publishedAt,
    })),
    ...state.interactions
      .filter(
        (i) =>
          role === "student" &&
          i.planetId === state.ownPlanet?.id &&
          (i.actor ? i.actor !== "student" : i.author !== "体验同学"),
      )
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        title: `${i.author}${i.kind === "like" ? "点赞了" : "回应了"}你的${i.workId ? "作品" : "星球"}`,
        createdAt: i.createdAt,
        content: i.content,
        planetId: i.planetId,
        workId: i.workId,
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div
      className={`${hideHeader ? "experience-guest" : "competition-app offline-app"} ${tab === "universe" && editTarget === undefined ? "universe-active" : ""} ${tab === "gallery" ? "exploring" : ""}`}
    >
      {!hideHeader && (
        <ExperienceHeader
          pendingCount={
            notifications.filter((n) => n.kind === "submission" && n.pending)
              .length
          }
          disabled={busy || reviewDirty}
          role={role}
          onNavigate={(destination) => {
            if (destination === "room") {
              myPlanet();
              return;
            }
            if (destination === "edit") {
              if (editTarget !== undefined) return;
              setColorCase(undefined);
              setEditTarget(state.ownPlanet);
              return;
            }
            if (!leaveEditor()) return;
            setTab(destination === "knowledge" ? "learning" : destination);
            if (destination === "universe") setEditTarget(undefined);
          }}
          account={
            <>
              {role !== "guest" && (
                <ClassroomInbox
                  notifications={notifications}
                  readIds={state.readNotifications
                    .filter((id) => id.startsWith(role + ":"))
                    .map((id) => id.slice(role.length + 1))}
                  onRead={(id) =>
                    void run(async () =>
                      setState(
                        await store.current!.readNotification(
                          state.revision,
                          role,
                          id,
                        ),
                      ),
                    )
                  }
                  onAssignment={setMailTask}
                  onReaction={(n) => {
                    if (!leaveEditor()) return;
                    const p = planets.find((p) => p.id === n.planetId);
                    if (p) {
                      setSelected(p.id);
                      setTab("gallery");
                      setWork(p.works.find((w) => w.id === n.workId) ?? null);
                    }
                  }}
                />
              )}
              {role !== "guest" ? (
                <button onClick={logout} disabled={busy}>
                  退出登录
                </button>
              ) : (
                <button onClick={() => setLoginOpen(true)}>登录</button>
              )}
              {role !== "guest" && (
                <button disabled={busy} onClick={() => setResetOpen(true)}>
                  重新开始
                </button>
              )}
            </>
          }
        />
      )}
      {notice && (
        <p role="status" className="offline-notice">
          {notice}
        </p>
      )}
      <main className="competition-main">
        {!hideHeader && (
          <small className="experience-mode-label">
            离线展示体验 · 示例数据与点评仅用于演示
          </small>
        )}
        {role === "student" && !state.identity ? (
          <StudentIdentityForm
            offline
            onSave={async (identity) => {
              const next = await store.current!.commit(
                state.revision,
                "student",
                (s) => ({
                  ...s,
                  identity,
                  ownPlanet: s.ownPlanet
                    ? {
                        ...s.ownPlanet,
                        display_name: `${identity.realName} · 学号 ${identity.studentNumber}`,
                        realName: identity.realName,
                        studentNumber: identity.studentNumber,
                      }
                    : null,
                }),
              );
              setState(next);
              setEditTarget(next.ownPlanet ?? null);
            }}
          />
        ) : editTarget !== undefined ? (
          <OfflinePlanetEditor
            key={editTarget?.id ?? "create"}
            planet={editTarget}
            initialCase={colorCase}
            busy={busy}
            resolveImage={image}
            onDirtyChange={(dirty) => {
              editorDirty.current = dirty;
            }}
            onClose={() => {
              setEditTarget(undefined);
              setColorCase(undefined);
            }}
            onSave={async (p, m) => {
              await run(async () => {
                await savePlanet(p, m);
                setEditTarget(undefined);
                setColorCase(undefined);
                setSelected(p.id);
                setTab("universe");
                setFocusRequest({ id: p.id, sequence: Date.now() });
              });
            }}
          />
        ) : tab === "learning" ? (
          <KnowledgePanel
            expanded
            onBack={() => setTab("universe")}
            onApplyColor={(c) => {
              setColorCase(c);
              if (role !== "student") {
                setNotice("请选择学生身份，开启自己的创作。");
                setLoginOpen(true);
                return;
              }
              setEditTarget(state.ownPlanet ?? null);
            }}
          />
        ) : tab === "teacher" ? (
          <>
            <PendingSubmissions
              items={notifications}
              readIds={state.readNotifications
                .filter((id) => id.startsWith("teacher:"))
                .map((id) => id.slice(8))}
              onOpen={(n) => {
                void run(async () => {
                  setState(
                    await store.current!.readNotification(
                      state.revision,
                      role,
                      n.id,
                    ),
                  );
                  const p = planets.find((p) => p.id === n.planetId);
                  if (p) {
                    setSelected(p.id);
                    setTab("gallery");
                    setWork(p.works.find((w) => w.id === n.workId) ?? null);
                  } else setNotice("这份作业已不可访问，请刷新列表。");
                });
              }}
            />
            <TeacherDashboard
              busy={busy}
              rows={planets.map((p) => ({
                id: p.id,
                name: p.document.metadata.name,
                author: p.display_name,
                works: p.works.length,
                sent: p.sent,
                received:
                  (p.planetInteractions?.length ?? 0) +
                  state.interactions.filter((i) => i.planetId === p.id).length,
                reviewed: p.works.filter((w) => w.score !== undefined).length,
                visible: p.visible,
                stationary: p.document.motion.mode === "stationary",
                hasPlanet: true,
              }))}
              onEnter={(id) => {
                setSelected(id);
                setTab("gallery");
              }}
              onEdit={(id) => {
                setColorCase(undefined);
                setEditTarget(planets.find((p) => p.id === id));
              }}
              onVisibility={async (id, visible) => {
                const p = planets.find((p) => p.id === id);
                if (p) await run(() => savePlanet({ ...p, visible }));
              }}
              publisher={
                <AssignmentPublisher
                  disabled={busy}
                  catalog={assignmentCatalog}
                  onCreate={async (draft, image, requestId) => {
                    let dataUrl = "";
                    if (image) {
                      const prepared = await importOfflineImage(image);
                      dataUrl = await new Promise<string>((ok, bad) => {
                        const reader = new FileReader();
                        reader.onload = () => ok(String(reader.result));
                        reader.onerror = () => bad(Error("无法读取示范图片"));
                        reader.readAsDataURL(prepared.blob);
                      });
                      if (dataUrl.length > 2000000)
                        throw Error("请缩小示范图片后重试");
                    }
                    setState(
                      await store.current!.createAssignment(
                        state.revision,
                        role,
                        draft,
                        dataUrl,
                        requestId,
                      ),
                    );
                  }}
                  onPublish={async (id) =>
                    setState(
                      await store.current!.publishAssignment(
                        state.revision,
                        role,
                        id,
                      ),
                    )
                  }
                />
              }
            />
          </>
        ) : tab === "gallery" && planet ? (
          <section className="competition-gallery" aria-label="星球内部">
            <div className="competition-room-heading compact-room-heading">
              <button onClick={() => setTab("universe")}>← 返回宇宙</button>
              <div className="row-buttons">
                {((owned && role === "student") || role === "teacher") && (
                  <button
                    onClick={() => {
                      setUploadOpen(true);
                      setUploadTaskId("");
                      setFile(null);
                      setWorkTitle("");
                      setRationale("");
                    }}
                  >
                    ＋ 提交作品 · 点亮新元素
                  </button>
                )}
                {role === "teacher" && (
                  <button onClick={() => setEditTarget(planet)}>
                    修改星球
                  </button>
                )}
              </div>
            </div>
            <SceneLayout
              story={{ ...planet.document.metadata, demoWriting: false }}
              author={planet.display_name}
              showReviewStatus={
                (owned && role === "student") || role === "teacher"
              }
              onOpenWork={(id) => {
                setWork(planet.works.find((w) => w.id === id) ?? null);
                setElementDraft(null);
              }}
              works={planet.works}
            >
              <PlanetExplorer sceneId={planet.id}>
                <div
                  ref={stage}
                  className="competition-room"
                  data-planet-id={planet.id}
                  style={
                    {
                      "--room-color": planet.document.color,
                    } as React.CSSProperties
                  }
                >
                  {
                    <FramedImage
                      placement={planet.document.imagePlacement.interior}
                      color={planet.document.color}
                      key={imageRetry}
                      className="scene-saved-background"
                      style={{
                        objectFit: planet.document.interiorView.fit,
                        visibility: planet.document.interiorView
                          .backgroundVisible
                          ? "visible"
                          : "hidden",
                        filter: `brightness(${planet.document.interiorView.brightness}) saturate(${planet.document.interiorView.saturation})`,
                      }}
                      src={
                        image(planet.interior) ??
                        `${import.meta.env.BASE_URL}demo/room-${planet.document.skin}.png`
                      }
                      alt={`${planet.document.metadata.name}的内部背景`}
                      onError={() => setSceneFailed(true)}
                    />
                  }
                  {sceneFailed && (
                    <div className="scene-image-error" role="alert">
                      <p>背景图暂时未能显示，仍可点击元素查看作品。</p>
                      <button
                        onClick={() => {
                          setSceneFailed(false);
                          setImageRetry((n) => n + 1);
                        }}
                      >
                        重新加载背景
                      </button>
                    </div>
                  )}
                  <div
                    className="design-ambient"
                    style={
                      {
                        "--preview-color": planet.document.color,
                        "--ambient-strength":
                          planet.document.interiorView.environmentLight,
                      } as React.CSSProperties
                    }
                  />
                  {planet.document.interiorView.particlesVisible && (
                    <CloudAtmosphere kind={planet.document.atmosphere} />
                  )}
                  {planet.document.interiorView.elementsVisible &&
                    planet.works.map((w, i) => (
                      <button
                        key={w.id}
                        className={`scene-growth motion-${w.params?.motion ?? "float"} ${birth === w.id ? "born" : ""}`}
                        data-work-id={w.id}
                        style={{
                          left: `${(w.params?.x ?? 0.2 + i * 0.12) * 100}%`,
                          top: `${(w.params?.y ?? 0.5) * 100}%`,
                          width: 86 * (w.params?.size ?? 0.9),
                          height: 86 * (w.params?.size ?? 0.9),
                        }}
                        aria-label={`查看作品 ${w.title}`}
                        title={w.title}
                        onClick={() => {
                          setWork(w);
                          setElementDraft(null);
                        }}
                      >
                        <GrowthPresetPreview
                          id={w.presetId}
                          color={
                            w.color ??
                            growthElementColor(planet.document.color, i)
                          }
                        />
                        <span>{w.title}</span>
                      </button>
                    ))}
                </div>
              </PlanetExplorer>
            </SceneLayout>
            {social(null)}
          </section>
        ) : (
          <CloudObservatory
            classId="competition"
            ownId={state.ownPlanet?.id}
            selectedId={selected}
            focusRequest={focusRequest}
            movablePlanetIds={
              busy
                ? []
                : role === "teacher"
                  ? visible.map((p) => p.id)
                  : role === "student" && state.ownPlanet
                    ? [state.ownPlanet.id]
                    : []
            }
            onPlanetMove={
              role === "guest"
                ? undefined
                : async (id, position, revision) => {
                    const p = planets.find((p) => p.id === id);
                    if (busy || !p || p.document.revision !== revision)
                      throw Error("星球已更新，请刷新后再移动。");
                    const next = await store.current!.savePlanet(
                      state.revision,
                      role,
                      { ...p, document: { ...p.document, position } },
                    );
                    setState(next);
                  }
            }
            planets={[
              ...visible.map((p) => ({
                ...p,
                document: { ...p.document, media: {} },
                previewImage:
                  image(p.exterior) ??
                  `${import.meta.env.BASE_URL}demo/v2/body-${p.document.skin}.webp`,
                works: p.works.map(() => ({ withdrawn: false })),
              })),
              ...data.defaults.map((p) => ({ ...p, sample: true, works: [] })),
            ]}
            onEnter={(id) => {
              if (data.defaults.some((p) => p.id === id)) {
                if (role === "student") {
                  setColorCase(undefined);
                  setEditTarget(state.ownPlanet ?? null);
                }
                return;
              }
              setSelected(id);
              setTab("gallery");
              setComment("");
            }}
          />
        )}
      </main>
      {loginOpen && !readOnly && (
        <dialog
          ref={loginDialog}
          className="offline-login-backdrop"
          aria-label="选择登录身份"
          onCancel={() => setLoginOpen(false)}
        >
          <section className="offline-login" aria-label="选择登录身份">
            <button
              className="offline-login-close"
              aria-label="关闭登录"
              onClick={() => setLoginOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">COLORVERSE · FIND YOUR COLORS</p>
            <h1>你的宇宙，从一种感受开始。</h1>
            <p>
              选择一种想表达的感受，为自己的星球找到颜色；也可以先去拜访其他星球，看看不同的色彩故事。
            </p>
            <RoleChoices onChoose={chooseRole} />
          </section>
        </dialog>
      )}
      {resetOpen && (
        <dialog
          ref={resetDialog}
          className="offline-confirm"
          aria-label="重新开始这次探索"
          onCancel={() => setResetOpen(false)}
        >
          <h2>重新开始这次探索？</h2>
          <p>
            这会清除你在本机创建的星球、添加的作品和本次互动，并恢复初始的星球。此操作无法撤销。
          </p>
          <button disabled={busy} onClick={() => setResetOpen(false)}>
            保留并返回
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const next = await store.current!.reset(state.revision, role);
                setState(next);
                setResetOpen(false);
                setEditTarget(undefined);
                setWork(null);
                setUploadOpen(false);
                setTab("universe");
                setSelected("demo-1");
                setRole("guest");
                try {
                  sessionStorage.removeItem(roleKey);
                } catch {}
                setNotice("新的色彩故事可以开始了。");
              })
            }
          >
            确认重新开始
          </button>
        </dialog>
      )}
      {uploadOpen && planet && (
        <div className="cloud-modal-backdrop">
          <form
            className="cloud-modal offline-upload"
            aria-label="提交作品"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!file || !workTitle.trim()) return;
                const imported = await importOfflineImage(file),
                  id = crypto.randomUUID(),
                  i = planet.works.length,
                  w: Artwork = {
                    taskId: uploadTaskId || null,
                    id,
                    title: workTitle.trim(),
                    description: rationale.trim(),
                    image: imported.key,
                    presetId: GrowthPresetIds[i % GrowthPresetIds.length],
                    color: growthElementColor(planet.document.color, i),
                    createdAt: new Date().toISOString(),
                    params: nextGrowthPlacement(
                      planet.works.map((w) => w.params ?? { x: 0.5, y: 0.5 }),
                      i,
                    ),
                  };
                await savePlanet(
                  { ...planet, works: [...planet.works, w] },
                  new Map([
                    [imported.key, imported.blob],
                    [imported.key + "-original", imported.original],
                  ]),
                );
                setUploadOpen(false);
                setBirth(id);
              });
            }}
          >
            <h2>让作品点亮这颗星球</h2>
            <label>
              选择教学任务
              <select
                aria-label="选择教学任务"
                value={uploadTaskId}
                onChange={(e) => setUploadTaskId(e.target.value)}
              >
                <option value="">自由展示</option>
                {assignmentCatalog
                  .filter((t) =>
                    state.assignments.some((a) => a.taskId === t.id),
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            {assignmentCatalog
              .filter((task) => task.id === uploadTaskId)
              .map((task) => (
                <details key={task.id} className="submission-assignment-brief">
                  <summary>查看作业要求与范例</summary>
                  <AssignmentBrief task={task} />
                </details>
              ))}
            <label>
              作品名称
              <input
                required
                maxLength={120}
                aria-label="作品名称"
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
              />
            </label>
            <label>
              作品图像
              <input
                required
                type="file"
                aria-label="作品图像"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              想表达的感受与配色理由
              <textarea
                aria-label="配色理由"
                maxLength={2000}
                rows={4}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => setUploadOpen(false)}
            >
              返回星球
            </button>
            <button
              className="primary"
              disabled={busy || !file || !workTitle.trim()}
            >
              {busy ? "正在点亮…" : "提交作品"}
            </button>
          </form>
        </div>
      )}
      {mailTask && (
        <AssignmentMail
          taskId={mailTask}
          definition={state.customTasks.find((t) => t.id === mailTask)}
          onClose={() => setMailTask(undefined)}
          onSubmit={
            role === "student"
              ? () => {
                  if (!leaveEditor()) return;
                  setMailTask(undefined);
                  if (!state.ownPlanet) {
                    setEditTarget(null);
                    setNotice("先创建自己的星球，再提交作业。");
                    return;
                  }
                  setSelected(state.ownPlanet.id);
                  setTab("gallery");
                  setUploadTaskId(mailTask);
                  setWorkTitle("");
                  setRationale("");
                  setFile(null);
                  setUploadOpen(true);
                }
              : undefined
          }
        />
      )}
      {work && planet && (
        <dialog
          ref={workDialog}
          className="competition-backdrop"
          aria-label="作品详情"
          onCancel={(e) => {
            if (busy || reviewDirty) {
              e.preventDefault();
              return;
            }
            setWork(null);
            setElementDraft(null);
          }}
        >
          <section className="competition-modal">
            <button
              className="modal-close"
              aria-label="关闭作品"
              disabled={busy || reviewDirty}
              onClick={() => {
                setWork(null);
                setElementDraft(null);
              }}
            >
              ×
            </button>
            {workFailed ? (
              <div role="alert" className="offline-work-image-error">
                <p>作品图像暂时未能显示，文字与交流仍可查看。</p>
                <button
                  onClick={() => {
                    setWorkFailed(false);
                    setImageRetry((n) => n + 1);
                  }}
                >
                  重新加载作品图
                </button>
              </div>
            ) : image(work.image) ? (
              <button
                className={`work-image-button ${imageZoom ? "zoomed" : ""}`}
                aria-label={imageZoom ? "还原作品图片" : "放大作品图片"}
                onClick={() => setImageZoom((v) => !v)}
              >
                <img
                  key={imageRetry}
                  src={image(work.image)}
                  alt={work.title}
                  onError={() => setWorkFailed(true)}
                />
              </button>
            ) : (
              <p role="status">正在读取作品图像…</p>
            )}
            <h2>{work.title}</h2>
            <p className="muted">
              {planet.display_name}
              {(work.exampleDate ?? work.createdAt) && (
                <>
                  {" "}
                  ·{" "}
                  <time
                    dateTime={work.exampleDate ?? work.createdAt ?? undefined}
                  >
                    {new Date(
                      work.exampleDate ?? work.createdAt!,
                    ).toLocaleString("zh-CN", { hour12: false })}
                  </time>
                </>
              )}
            </p>
            {work.description && <p>{work.description}</p>}
            <ReviewPanel
              record={
                work.score !== undefined || work.comment
                  ? { score: work.score, comment: work.comment ?? "" }
                  : null
              }
              staff={role === "teacher"}
              score={grade}
              comment={review}
              onScore={setGrade}
              onComment={setReview}
              busy={busy}
              dirty={
                grade !== (work.score?.toString() ?? "") ||
                review !== (work.comment ?? "")
              }
              onReset={() => {
                setGrade(work.score?.toString() ?? "");
                setReview(work.comment ?? "");
              }}
              onSave={() =>
                void run(async () => {
                  const updated = {
                    ...work,
                    score: grade.trim() ? Number(grade) : undefined,
                    comment: review.trim(),
                  };
                  await savePlanet({
                    ...planet,
                    works: planet.works.map((w) =>
                      w.id === work.id ? updated : w,
                    ),
                  });
                  setWork(updated);
                })
              }
            />
            {((owned && role === "student") || role === "teacher") && (
              <>
                <button onClick={() => setElementDraft(structuredClone(work))}>
                  编辑元素
                </button>
                {elementDraft && (
                  <section
                    className="offline-element-editor"
                    aria-label="编辑作品元素"
                  >
                    <label>
                      元素形状
                      <select
                        aria-label="元素形状"
                        value={elementDraft.presetId}
                        onChange={(e) =>
                          setElementDraft({
                            ...elementDraft,
                            presetId: e.target.value as Artwork["presetId"],
                          })
                        }
                      >
                        {GrowthPresetIds.filter(
                          (id) => !/(ring|orbit)/.test(id),
                        ).map((id) => (
                          <option key={id} value={id}>
                            {GrowthPresets[id].name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      元素颜色
                      <input
                        aria-label="元素颜色"
                        type="color"
                        value={elementDraft.color ?? planet.document.color}
                        onChange={(e) =>
                          setElementDraft({
                            ...elementDraft,
                            color: e.target.value,
                          })
                        }
                      />
                    </label>
                    {(["x", "y", "size"] as const).map((key) => (
                      <label key={key}>
                        {key === "size"
                          ? "大小"
                          : key === "x"
                            ? "横向位置"
                            : "纵向位置"}
                        <input
                          aria-label={
                            key === "size"
                              ? "元素大小"
                              : key === "x"
                                ? "元素横向位置"
                                : "元素纵向位置"
                          }
                          type="range"
                          min={key === "size" ? 0.3 : 0.05}
                          max={key === "size" ? 1.5 : 0.95}
                          step=".01"
                          value={elementDraft.params?.[key] ?? 0.5}
                          onChange={(e) =>
                            setElementDraft({
                              ...elementDraft,
                              params: {
                                x: 0.5,
                                y: 0.5,
                                size: 0.9,
                                motion: "float",
                                ...elementDraft.params,
                                [key]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                    <GrowthPresetPreview
                      id={elementDraft.presetId}
                      color={elementDraft.color ?? planet.document.color}
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await savePlanet({
                            ...planet,
                            works: planet.works.map((w) =>
                              w.id === work.id ? elementDraft : w,
                            ),
                          });
                          setWork(elementDraft);
                          setElementDraft(null);
                        })
                      }
                    >
                      保存元素
                    </button>
                  </section>
                )}
              </>
            )}
            {social(work.id)}
          </section>
        </dialog>
      )}
    </div>
  );
}
