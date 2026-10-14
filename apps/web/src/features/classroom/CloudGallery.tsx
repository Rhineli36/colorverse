import { CloudUniverse } from "./CloudUniverse";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  GrowthPresetIds,
  GrowthPresets,
  CloudPlanetDocumentSchema,
  CloudGuideSchema,
  type CloudGuideStepId,
  type CloudSession,
} from "@colorverse/contracts";
import { classroomRequest } from "./CloudClassroomView";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import { GrowthLibraryChooser } from "../studio/GrowthLibraryChooser";
import { download } from "../../app/download";
import "./classroom.css";
import {
  CloudPlanetAppearance,
  CloudPlanetOrb,
  usePlanetImage,
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
  title: z.string(),
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
  display_name: z.string(),
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
const Gallery = z.object({ actorId: z.uuid(), planets: z.array(Planet) });
type WorkData = z.infer<typeof Work>;
function PrivateImage({ classId, id }: { classId: string; id: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    setUrl("");
    setError(false);
    void classroomRequest(`classes/${classId}/works/${id}/image`)
      .then((r) => r.blob())
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [classId, id]);
  return url ? (
    <img src={url} alt="提交的展示作品" />
  ) : (
    <p className="cloud-image-loading">
      {error ? "图片读取失败，请重新打开作品" : "正在读取作品…"}
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
}: {
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
}) {
  const memberships = session.access === "active" ? session.memberships : [],
    [classId, setClassId] = useState(
      memberships.find((m) => m.classId === initialClassId)?.classId ??
        memberships[0]?.classId ??
        "",
    ),
    [data, setData] = useState<z.infer<typeof Gallery> | null>(null),
    [planetId, setPlanetId] = useState(initialPlanetId ?? ""),
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
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [settingsOpen, setSettingsOpen] = useState(false),
    [appearanceDirty, setAppearanceDirty] = useState(false),
    [settingsSection, setSettingsSection] =
      useState<AppearanceSection>("exterior"),
    [guide, setGuide] = useState<z.infer<typeof CloudGuideSchema> | null>(null),
    [guideError, setGuideError] = useState(false),
    [guideRevision, setGuideRevision] = useState(0),
    [planetBirth, setPlanetBirth] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [comment, setComment] = useState(""),
    [interactions, setInteractions] = useState<
      {
        id: string;
        kind: string;
        content: string;
        display_name: string;
        work_id: string | null;
        own?: boolean;
        can_remove?: boolean;
      }[]
    >([]);
  const generation = useRef(0),
    requestId = useRef(crypto.randomUUID()),
    stage = useRef<HTMLDivElement>(null),
    settings = useRef<HTMLDivElement>(null),
    social = useRef<HTMLElement>(null);
  const pending =
    busy ||
    editing ||
    uploadOpen ||
    appearanceDirty ||
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
    setData(result);
    if (select) setPlanetId(select);
    else
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
    setSettingsOpen(false);
    setPlanetBirth("");
    setNotice("");
    setBusy(true);
    void classroomRequest(`classes/${classId}/planets`)
      .then((r) => r.json())
      .then((value) => {
        if (active && current === generation.current) {
          const result = Gallery.parse(value);
          setData(result);
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
          if (active) setInteractions(value.interactions);
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
      if (event.key !== "Escape" || busy) return;
      if (confirmation) setConfirmation(null);
      else if (uploadOpen) setUploadOpen(false);
      else if (work && !editing) setWork(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, uploadOpen, work, editing, confirmation]);
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
  const interact = (kind: "like" | "emoji" | "comment", content: string) =>
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
          requestId: crypto.randomUUID(),
        }),
      });
      const response = await classroomRequest(
        `classes/${classId}/interactions?planetId=${planetId}`,
      );
      setInteractions((await response.json()).interactions);
      setComment("");
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
    setInteractions((await response.json()).interactions);
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
        <strong>{i.display_name}</strong>{" "}
        {i.kind === "like" ? `♡ 点赞了${subject}` : i.content}
      </p>
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
  return (
    <main className="classroom-main cloud-gallery">
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
      {notice && (
        <p role="status" className="cloud-notice">
          {notice}
        </p>
      )}
      {student && data && !myPlanet && (
        <section className="cloud-create">
          <span>✧</span>
          <div>
            <p className="eyebrow">YOUR UNIVERSE STARTS HERE</p>
            <h2>让宇宙为你诞生一颗星球</h2>
            <p>
              一键随机生成外观，之后自由改名和设计。每个班级只创建一颗属于你的星球。
            </p>
            <p>建议尽快上传自己的星球外貌和内部背景，让它拥有你的风格。</p>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const result = await (
                  await classroomRequest(`classes/${classId}/planets`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ random: true }),
                  })
                ).json();
                await refresh(result.id);
                if (result.created) {
                  setPlanetBirth(result.id);
                  setNotice("你的星球诞生了。欣赏一下，再开始你的设计吧。");
                }
              })
            }
          >
            {busy ? "正在召唤你的星球…" : "一键随机创建我的星球 ✦"}
          </button>
        </section>
      )}
      {student && myPlanet && (guide || guideError) && (
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
      {data && data.planets.length > 0 && (
        <CloudUniverse
          classId={classId}
          planets={data.planets}
          actorId={data.actorId}
          selectedId={planetId}
          disabled={pending}
          teacher={!student}
          onSelect={(id) => {
            if (pending) return;
            setPlanetId(id);
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
      <div className="cloud-planets" aria-label="班级云端星球">
        {data?.planets.map((p) => (
          <button
            key={p.id}
            disabled={pending}
            aria-pressed={planetId === p.id}
            onClick={() => {
              setPlanetId(p.id);
              setWork(null);
              setEditing(false);
              setSettingsOpen(false);
            }}
          >
            <CloudPlanetOrb classId={classId} id={p.id} document={p.document} />
            <span>
              <strong>{p.document.metadata.name}</strong>
              <small>
                {p.display_name} · {p.works.filter((w) => !w.withdrawn).length}{" "}
                件作品
                {p.owner_enrollment_id === data.actorId ? " · 我的星球" : ""}
              </small>
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <>
          <div className="cloud-room-heading">
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
                  disabled={
                    busy || editing || appearanceDirty || Boolean(planetBirth)
                  }
                  onClick={() => setSettingsOpen((v) => !v)}
                >
                  编辑星球外貌与背景
                </button>
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
                  ＋ 上传展示作品
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
          {owned && settingsOpen && (
            <div ref={settings}>
              <CloudPlanetAppearance
                key={selected.id}
                classId={classId}
                id={selected.id}
                document={selected.document}
                initialSection={settingsSection}
                busy={busy}
                run={perform}
                onSaved={() => refresh(selected.id)}
                onClose={() => setSettingsOpen(false)}
                onDirtyChange={setAppearanceDirty}
              />
            </div>
          )}
          {background.error && (
            <p role="status">内部背景读取失败，请刷新作品重试。</p>
          )}
          <div
            className={`cloud-room ${planetBirth === selected.id ? "planet-born" : ""}`}
            ref={stage}
            aria-label="云端星球内部"
            style={{ backgroundColor: selected.document.color }}
          >
            <div
              className="cloud-room-scenery"
              style={{
                filter: `brightness(${selected.document.brightness}) saturate(${selected.document.saturation})`,
              }}
            >
              {background.url ? (
                <img
                  className="cloud-room-background"
                  src={background.url}
                  alt="星球内部背景"
                />
              ) : (
                <>
                  <div className="cloud-room-moon" />
                  <div className="cloud-room-land" />
                </>
              )}
              <div
                className="cloud-room-tint"
                style={{ backgroundColor: selected.document.color }}
              />
            </div>
            <CloudAtmosphere kind={selected.document.atmosphere} />
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
            {selected.works
              .filter((w) => !w.withdrawn)
              .map((w, index) => {
                const current = editing && draft?.id === w.id ? draft : w;
                return (
                  <button
                    key={w.id}
                    className={`cloud-growth ${birth === w.id ? "born" : ""} motion-${current.params.motion} ${editing && draft?.id === w.id ? "editing" : ""}`}
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
                      const bounds = stage.current?.getBoundingClientRect();
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
          {!owned && !work && (
            <section className="cloud-social" ref={social}>
              <strong>为这颗星球留下回应</strong>
              <button
                disabled={busy}
                onClick={() => toggleReaction("like", "")}
              >
                {reaction("like") ? "♥ 已点赞 · 点击取消" : "♡ 点赞星球"}
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
                placeholder="写下你的感受…"
              />
              <button
                disabled={busy || !comment.trim()}
                onClick={() => interact("comment", comment)}
              >
                发送留言
              </button>
            </section>
          )}
          <section className="cloud-work-list" aria-label="云端展示作品">
            {selected.works
              .filter((w) => !w.withdrawn)
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    if (!editing) setWork(w);
                  }}
                >
                  <GrowthPresetPreview id={w.presetId} color={w.color} />
                  <strong>{w.title}</strong>
                  <small>
                    {new Date(w.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                </button>
              ))}
          </section>
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
            {interactions
              .filter((i) => !i.work_id)
              .slice(0, 20)
              .map((i) => interactionRow(i, "这颗星球"))}
          </section>
        </>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  if (!file) throw new Error("请选择作品图片");
                  if (file.size > 8388608) throw new Error("图片最多 8 MB");
                  const query = new URLSearchParams({
                    requestId: requestId.current,
                    title,
                    description,
                  });
                  const response = await classroomRequest(
                    `classes/${classId}/works?${query}`,
                    {
                      method: "POST",
                      body: file,
                      headers: { "Content-Type": file.type },
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
              disabled={busy || Boolean(confirmation)}
              onClick={() => {
                setWork(null);
                setComment("");
              }}
            >
              ×
            </button>
            <PrivateImage classId={classId} id={work.id} />
            <h2>{work.title}</h2>
            <p>{work.description}</p>
            <p className="muted">
              {selected?.display_name} ·{" "}
              {new Date(work.createdAt).toLocaleDateString("zh-CN")}
            </p>
            {work.withdrawn && (
              <p className="cloud-withdrawn-note">
                作品已撤下，仅作者和教师可查看。原图、元素设置和互动保留；仍计入存储限额。
              </p>
            )}
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
                    disabled={busy}
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
            {!owned && !work.withdrawn && (
              <section className="cloud-social">
                <button
                  disabled={busy}
                  onClick={() => toggleReaction("like", "")}
                >
                  {reaction("like") ? "♥ 已点赞 · 点击取消" : "♡ 点赞作品"}
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
                <input
                  aria-label="作品留言"
                  value={comment}
                  maxLength={500}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="这件作品让你想到了什么？"
                />
                <button
                  disabled={busy || !comment.trim()}
                  onClick={() => interact("comment", comment)}
                >
                  发送留言
                </button>
              </section>
            )}
            {interactions
              .filter((i) => i.work_id === work.id)
              .map((i) => interactionRow(i, "作品"))}
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
