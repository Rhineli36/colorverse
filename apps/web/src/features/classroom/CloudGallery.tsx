import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  GrowthPresetIds,
  GrowthPresets,
  type CloudSession,
} from "@colorverse/contracts";
import { classroomRequest } from "./CloudClassroomView";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import { GrowthLibraryChooser } from "../studio/GrowthLibraryChooser";
import { download } from "../../app/download";
import "./classroom.css";
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
});
const Planet = z.object({
  id: z.uuid(),
  owner_enrollment_id: z.uuid(),
  display_name: z.string(),
  document: z.object({
    metadata: z.object({ name: z.string() }),
    color: z.string(),
  }),
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
  onBack,
}: {
  session: CloudSession;
  initialPlanetId?: string;
  onBack?: () => void;
}) {
  const memberships = session.access === "active" ? session.memberships : [],
    [classId, setClassId] = useState(memberships[0]?.classId ?? ""),
    [data, setData] = useState<z.infer<typeof Gallery> | null>(null),
    [planetId, setPlanetId] = useState(initialPlanetId ?? ""),
    [work, setWork] = useState<WorkData | null>(null),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<WorkData | null>(null),
    [birth, setBirth] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploadOpen, setUploadOpen] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [name, setName] = useState("我的色彩星球"),
    [file, setFile] = useState<File | null>(null),
    [comment, setComment] = useState(""),
    [interactions, setInteractions] = useState<
      {
        id: string;
        kind: string;
        content: string;
        display_name: string;
        work_id: string | null;
      }[]
    >([]);
  const generation = useRef(0),
    requestId = useRef(crypto.randomUUID()),
    stage = useRef<HTMLDivElement>(null);
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
            result.planets[0]?.id ??
            ""),
      );
    return result;
  };
  useEffect(() => {
    let active = true;
    const current = ++generation.current;
    setData(null);
    setWork(null);
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
              result.planets[0]?.id ??
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
    owned = selected?.owner_enrollment_id === data?.actorId,
    myPlanet = data?.planets.find(
      (p) => p.owner_enrollment_id === data.actorId,
    ),
    student =
      memberships.find((m) => m.classId === classId)?.role === "student";
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
      if (uploadOpen) setUploadOpen(false);
      else if (work && !editing) setWork(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, uploadOpen, work, editing]);
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
      setNotice("互动已记录，教师端刷新后可以查看。");
    });
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
          {onBack && <button onClick={onBack}>返回班级统计</button>}
          <select
            aria-label="作品班级"
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
            disabled={busy}
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
            <h2>第一次来，创建你的云端星球</h2>
            <p>每个班级一颗星球，之后可以持续添加自己最满意的作品。</p>
          </div>
          <input
            aria-label="云端星球名称"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="primary"
            disabled={busy || !name.trim()}
            onClick={() =>
              void perform(async () => {
                await classroomRequest(`classes/${classId}/planets`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, color: "#82c9c7" }),
                });
                await refresh();
              })
            }
          >
            创建我的云端星球
          </button>
        </section>
      )}
      <div className="cloud-planets" aria-label="班级云端星球">
        {data?.planets.map((p) => (
          <button
            key={p.id}
            aria-pressed={planetId === p.id}
            onClick={() => {
              setPlanetId(p.id);
              setWork(null);
              setEditing(false);
            }}
          >
            <span className="student-orb" />
            <span>
              <strong>{p.document.metadata.name}</strong>
              <small>
                {p.display_name} · {p.works.length} 件作品
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
              <p className="muted">
                {editing
                  ? "拖动元素移动，调整细节后点击保存。"
                  : "点击成长元素欣赏对应的作业；选择「编辑元素」再修改。"}
              </p>
            </div>
            {owned && (
              <button
                className="primary"
                disabled={busy || editing}
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
            )}
          </div>
          <div className="cloud-room" ref={stage} aria-label="云端星球内部">
            <div className="cloud-room-moon" />
            <div className="cloud-room-land" />
            {selected.works.map((w, index) => {
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
                    animationDelay: birth === w.id ? "0s" : `${index * 0.13}s`,
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
            {!selected.works.length && (
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
            <section className="cloud-social">
              <strong>为这颗星球留下回应</strong>
              <button disabled={busy} onClick={() => interact("like", "")}>
                ♡ 点赞星球
              </button>
              {["✨", "💙", "👏", "🔥", "🌈"].map((emoji) => (
                <button
                  disabled={busy}
                  key={emoji}
                  onClick={() => interact("emoji", emoji)}
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
            {selected.works.map((w) => (
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
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setDraft(null);
                    setWork(null);
                  }}
                >
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
              .map((i) => (
                <p key={i.id}>
                  <strong>{i.display_name}</strong>{" "}
                  {i.kind === "like" ? "♡ 点赞了这颗星球" : i.content}
                </p>
              ))}
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
            <button className="modal-close" onClick={() => setWork(null)}>
              ×
            </button>
            <PrivateImage classId={classId} id={work.id} />
            <h2>{work.title}</h2>
            <p>{work.description}</p>
            <p className="muted">
              {selected?.display_name} ·{" "}
              {new Date(work.createdAt).toLocaleDateString("zh-CN")}
            </p>
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
              {owned && (
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
            </div>
            {!owned && (
              <section className="cloud-social">
                <button disabled={busy} onClick={() => interact("like", "")}>
                  ♡ 点赞作品
                </button>
                {["✨", "💙", "👏", "🔥", "🌈"].map((emoji) => (
                  <button
                    key={emoji}
                    disabled={busy}
                    onClick={() => interact("emoji", emoji)}
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
              .map((i) => (
                <p key={i.id}>
                  <strong>{i.display_name}</strong>{" "}
                  {i.kind === "like" ? "♡ 点赞了作品" : i.content}
                </p>
              ))}
          </section>
        </div>
      )}
    </main>
  );
}
