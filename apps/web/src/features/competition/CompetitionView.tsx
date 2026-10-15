import { PlanetExplorer } from "../classroom/PlanetExplorer";
import { KnowledgePanel } from "../classroom/LearningPanels";
import { nextGrowthPlacement } from "@colorverse/domain";
import { TaskPrompt } from "../classroom/LearningPanels";
import { LearningContent } from "@colorverse/contracts";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  CloudPlanetDocumentSchema,
  GrowthPresetIds,
} from "@colorverse/contracts";
import { CloudUniverse } from "../classroom/CloudUniverse";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import { CloudAtmosphere } from "../classroom/CloudStudentGuide";
import "../classroom/classroom.css";
import "./competition.css";
const Work = z.strictObject({
  id: z.string(),
  params: z
    .object({
      x: z.number(),
      y: z.number(),
      size: z.number(),
      motion: z.string(),
    })
    .optional(),
  createdAt: z.string().nullable().optional(),
  description: z.string().optional(),
  interactions: z
    .array(
      z.object({
        kind: z.enum(["like", "emoji", "comment"]),
        content: z.string(),
        author: z.string(),
      }),
    )
    .optional(),
  title: z.string(),
  image: z.string().regex(/^[a-z0-9-]+\.webp$/),
  presetId: z.enum(GrowthPresetIds),
  score: z.number().min(0).max(100),
  comment: z.string(),
});
const Snapshot = z.strictObject({
  version: z.literal(1),
  students: z
    .array(
      z.strictObject({
        id: z.string(),
        display_name: z.string(),
        document: CloudPlanetDocumentSchema,
        exterior: z
          .string()
          .regex(/^[a-z0-9-]+\.webp$/)
          .optional(),
        interior: z
          .string()
          .regex(/^[a-z0-9-]+\.webp$/)
          .optional(),
        style: z.string().optional(),
        sent: z.number().int().nonnegative(),
        received: z.number().int().nonnegative(),
        works: z.array(Work).length(5),
      }),
    )
    .length(5),
  defaults: z
    .array(
      z.strictObject({
        id: z.string(),
        display_name: z.string(),
        document: CloudPlanetDocumentSchema,
        works: z.array(Work).length(0),
      }),
    )
    .length(5),
});
type Data = z.infer<typeof Snapshot>;
type Artwork = z.infer<typeof Work>;
const root = `${import.meta.env.BASE_URL}competition/`;
export function CompetitionView() {
  const dialog = useRef<HTMLDialogElement>(null);
  const detailReturn = useRef<{
    x: number;
    y: number;
    focus: HTMLElement | null;
  } | null>(null);
  const openWork = (w: Artwork) => {
    detailReturn.current = {
      x: scrollX,
      y: scrollY,
      focus: document.activeElement as HTMLElement,
    };
    setWork(w);
  };
  const closeWork = () => {
    setWork(null);
    requestAnimationFrame(() => {
      const v = detailReturn.current;
      if (v) {
        v.focus?.focus({ preventScroll: true });
        scrollTo(v.x, v.y);
      }
    });
  };
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState("universe"),
    [taskId, setTaskId] = useState("T01"),
    [selected, setSelected] = useState(""),
    [work, setWork] = useState<Artwork | null>(null),
    [birth, setBirth] = useState(false),
    [listOpen, setListOpen] = useState(false),
    [imageZoom, setImageZoom] = useState(false),
    [imageFailed, setImageFailed] = useState(false),
    [imageRetry, setImageRetry] = useState(0),
    [sceneFailed, setSceneFailed] = useState(false),
    [sceneRetry, setSceneRetry] = useState(0),
    [liked, setLiked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    setError(false);
    void fetch(root + "manifest.json", { signal: AbortSignal.timeout(10000) })
      .then((r) => {
        if (!r.ok) throw new Error("LOAD_FAILED");
        return r.json();
      })
      .then((v) => {
        const result = Snapshot.parse(v);
        if (active) {
          setData(result);
          setSelected(result.students[0].id);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    if (!birth) return;
    const timer = setTimeout(() => setBirth(false), 4500);
    return () => clearTimeout(timer);
  }, [birth]);
  useEffect(() => {
    if (work && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [work]);
  useEffect(() => {
    setImageZoom(false);
    setImageFailed(false);
    setImageRetry(0);
  }, [work?.id]);
  useEffect(() => {
    setListOpen(false);
    setSceneFailed(false);
    setSceneRetry(0);
  }, [selected]);
  const student = data?.students.find((s) => s.id === selected);
  const defaultPlanet = data?.defaults.find((s) => s.id === selected);
  return (
    <div className={`competition-app ${tab === "gallery" ? "exploring" : ""}`}>
      <header className="competition-header">
        <button
          className="competition-brand"
          onClick={() => {
            setTab("universe");
            setWork(null);
          }}
        >
          ◉ COLORVERSE <span>色彩宇宙</span>
        </button>
        <nav aria-label="比赛展示导航">
          {[
            ["universe", "探索宇宙"],
            ["gallery", "星球内部"],
            ["teacher", "教师视角"],
            ["learning", "色彩的奥秘"],
          ].map(([id, title]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                setWork(null);
              }}
            >
              {title}
            </button>
          ))}
        </nav>
        <span className="competition-badge">智慧教学 · 演示数据</span>
      </header>
      <main className="competition-main">
        <div className="competition-intro">
          <p className="eyebrow">COLORVERSE · LEARNING THROUGH COLOR</p>
          <h1>
            让每一次创作，
            <br />
            成为宇宙中的一次生长。
          </h1>
          <p>
            用星球收藏色彩作品，让成长、互访与教师反馈成为看得见的学习过程。5
            个作品风格案例，5 个默认创作起点。
          </p>
          <small>比赛展示版 · 无需登录 · 演示操作仅在当前页面生效</small>
        </div>
        {error && (
          <div role="alert">
            展示素材读取失败。
            <button onClick={() => setRetry((n) => n + 1)}>重新加载展览</button>
          </div>
        )}
        {!data && !error && <p role="status">正在展开色彩宇宙…</p>}
        {data && (
          <>
            {tab === "learning" && (
              <section className="learning-panel" aria-label="色彩的奥秘">
                <div className="mystery-intro">
                  <p className="eyebrow">THE SECRETS OF COLOR</p>
                  <h2>色彩的奥秘</h2>
                  <p>{LearningContent.introduction}</p>
                  <p>{LearningContent.notice}</p>
                </div>
                <KnowledgePanel />
                <h3>试着为星球讲一个色彩故事</h3>
                <p>
                  这里可以浏览模板与知识卡片。静态备用版不记录任务提交、互评或成绩；真实教学流程在登录后的云端课堂中完成。
                </p>
                <label>
                  练习模板
                  <select
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                  >
                    {LearningContent.tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
                <TaskPrompt id={taskId} />
              </section>
            )}
            {tab === "universe" && (
              <CloudUniverse
                exhibition
                classId="competition"
                actorId="visitor"
                selectedId={selected}
                disabled={false}
                teacher
                planets={[
                  ...data.students.map((s) => ({
                    ...s,
                    owner_enrollment_id: s.id,
                    display_name: `${s.display_name} · 作品风格案例`,
                    previewImage: s.exterior ? root + s.exterior : undefined,
                    works: s.works.map(() => ({ withdrawn: false })),
                  })),
                  ...data.defaults.map((s) => ({
                    ...s,
                    owner_enrollment_id: s.id,
                    sample: true,
                    works: [],
                  })),
                ]}
                onSelect={(id) => {
                  setSelected(id);
                  setTab("gallery");
                }}
              />
            )}
            {tab === "teacher" && (
              <section
                aria-label="演示教师管理"
                className="competition-teacher"
              >
                <p className="eyebrow">CLASSROOM OBSERVATORY</p>
                <h2>看见每位学生的参与和成长</h2>
                <div className="classroom-metrics">
                  {[
                    ["演示学生", 5],
                    ["展示作品", 25],
                    ["学生互动", 36],
                    ["点评建议", 25],
                  ].map(([label, n]) => (
                    <article key={label}>
                      <span>{label}</span>
                      <strong>{n}</strong>
                    </article>
                  ))}
                </div>
                <div className="classroom-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>学生 / 星球</th>
                        <th>展示作品</th>
                        <th>发起互动</th>
                        <th>收到互动</th>
                        <th>教师点评</th>
                        <th>查看</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.display_name}</strong>
                            <small>{s.document.metadata.name}</small>
                          </td>
                          <td>5 件</td>
                          <td>{s.sent} 次</td>
                          <td>{s.received} 次</td>
                          <td>5 条演示建议</td>
                          <td>
                            <button
                              onClick={() => {
                                setSelected(s.id);
                                setTab("gallery");
                              }}
                            >
                              查看作品与点评
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">
                  这里展示演示快照。建议分不代表原课程成绩，真实教学中的教师确认、修改与评分保留在登录后的教学版。
                </p>
              </section>
            )}
            {tab === "gallery" && defaultPlanet && (
              <section
                className="competition-default"
                aria-label="默认星球风格"
              >
                <img
                  src={`${import.meta.env.BASE_URL}demo/v2/body-${defaultPlanet.document.skin}.webp`}
                  alt={defaultPlanet.document.metadata.name}
                />
                <div>
                  <p className="eyebrow">A STARTING POINT FOR YOUR WORLD</p>
                  <h2>{defaultPlanet.document.metadata.name}</h2>
                  <p>
                    这是系统预制的默认外貌样本。学生可以从默认星球出发，再用自己的作品配色和图形语言设计专属星球。
                  </p>
                  <button
                    onClick={() => {
                      setSelected(data.students[0].id);
                      setTab("gallery");
                    }}
                  >
                    看看学生作品风格案例 ↗
                  </button>
                </div>
              </section>
            )}
            {tab === "gallery" && student && (
              <section
                aria-label="演示星球作品"
                className="competition-gallery"
              >
                <div
                  className="competition-planets"
                  role="group"
                  aria-label="选择演示学生"
                >
                  {data.students.map((s) => (
                    <button
                      key={s.id}
                      aria-pressed={s.id === selected}
                      onClick={() => {
                        setSelected(s.id);
                        setBirth(false);
                      }}
                    >
                      {s.display_name}
                    </button>
                  ))}
                </div>
                <div className="competition-room-heading">
                  <button onClick={() => setTab("universe")}>← 返回宇宙</button>
                  <div>
                    <p className="eyebrow">
                      {student.display_name} · {student.style}
                    </p>
                    <h2>{student.document.metadata.name}</h2>
                    <p className="scene-invitation">
                      寻找微光，走近这颗星球收藏的作品。
                    </p>
                  </div>
                  <div className="row-buttons">
                    <button
                      onClick={() => setListOpen((v) => !v)}
                      aria-expanded={listOpen}
                    >
                      作品目录 · {student.works.length}
                    </button>
                    <button disabled={birth} onClick={() => setBirth(true)}>
                      {birth ? "新元素正在生长…" : "回看元素生长 ✦"}
                    </button>
                  </div>
                </div>
                {listOpen && (
                  <section
                    className="cloud-work-list"
                    aria-label="星球作品目录"
                  >
                    {student.works.map((w) => (
                      <button key={w.id} onClick={() => openWork(w)}>
                        {w.title}
                      </button>
                    ))}
                  </section>
                )}
                <PlanetExplorer sceneId={student.id}>
                  <div
                    className="competition-room"
                    data-planet-id={student.id}
                    style={
                      {
                        "--room-color": student.document.color,
                      } as React.CSSProperties
                    }
                  >
                    {student.interior ? (
                      <img
                        key={sceneRetry}
                        className="scene-saved-background"
                        src={
                          root +
                          student.interior +
                          (sceneRetry ? `?retry=${sceneRetry}` : "")
                        }
                        alt={`${student.display_name}保存的内部背景`}
                        onError={() => setSceneFailed(true)}
                        onLoad={() => setSceneFailed(false)}
                      />
                    ) : (
                      <span className="scene-default-note">
                        默认内部背景 · 真实课堂可由学生自行设置
                      </span>
                    )}
                    {sceneFailed && (
                      <div className="scene-image-error" role="status">
                        <p>内部背景暂时无法读取，作品元素仍可打开。</p>
                        <button
                          onClick={() => {
                            setSceneFailed(false);
                            setSceneRetry((n) => n + 1);
                          }}
                        >
                          重新读取背景
                        </button>
                      </div>
                    )}
                    <CloudAtmosphere kind={student.document.atmosphere} />
                    {student.works.map((w, i) => {
                      const params =
                        w.params ??
                        nextGrowthPlacement(
                          student.works
                            .slice(0, i)
                            .map(
                              (p, j) =>
                                p.params ?? { x: 0.16 + j * 0.16, y: 0.6 },
                            ),
                          i,
                        );
                      return (
                        <button
                          key={w.id}
                          className={`scene-growth ${birth && i === 0 ? "born" : ""}`}
                          data-work-id={w.id}
                          aria-label={`欣赏作品：${w.title}`}
                          title={w.title}
                          style={{
                            left: `${params.x * 100}%`,
                            top: `${params.y * 100}%`,
                          }}
                          onClick={() => openWork(w)}
                        >
                          <GrowthPresetPreview
                            id={w.presetId}
                            color={student.document.color}
                          />
                          <span>{w.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </PlanetExplorer>
              </section>
            )}
          </>
        )}
        <footer className="competition-footer">
          往届设计色彩课程作品的演示预览 · 学生身份匿名展示 ·
          不包含真实账号、密码或班级成绩 · 星球外貌与场景为 AI 辅助素材
        </footer>
      </main>
      {work && (
        <dialog
          ref={dialog}
          aria-label="比赛作品展示"
          onCancel={() => closeWork()}
          className="competition-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeWork();
          }}
        >
          <section className="competition-modal">
            <button
              className="modal-close"
              aria-label="关闭作品"
              onClick={() => closeWork()}
            >
              ×
            </button>
            {imageFailed ? (
              <div role="status">
                <p>作品图片读取失败。</p>
                <button
                  onClick={() => {
                    setImageFailed(false);
                    setImageRetry((n) => n + 1);
                  }}
                >
                  重新读取作品图片
                </button>
              </div>
            ) : (
              <button
                className={`work-image-button ${imageZoom ? "zoomed" : ""}`}
                aria-label={imageZoom ? "还原作品图片" : "放大作品图片"}
                onClick={() => setImageZoom((v) => !v)}
              >
                <img
                  src={
                    root +
                    work.image +
                    (imageRetry ? `?retry=${imageRetry}` : "")
                  }
                  alt={work.title}
                  onError={() => setImageFailed(true)}
                />
              </button>
            )}
            <p className="muted">
              点击图片可放大 · {student?.display_name} ·{" "}
              {work.createdAt
                ? `演示入库时间：${new Date(work.createdAt).toLocaleString("zh-CN")}`
                : "历史作业预览，原提交时间未记录"}
            </p>
            <h2>{work.title}</h2>
            {work.description && <p>{work.description}</p>}
            <section className="cloud-work-review" aria-label="演示教师点评">
              <div className="cloud-review-heading">
                <h3>教师点评示例</h3>
                <span>演示建议 · 非正式成绩</span>
              </div>
              <strong className="cloud-review-score">
                {work.score}
                <small> / 100 · 建议分</small>
              </strong>
              <p>{work.comment}</p>
            </section>
            <section className="work-community" aria-label="同学互动">
              <h3>同学的回应</h3>
              <p>
                当前为只读展示快照。真实点赞、表情和留言请登录云端课堂，记录会保存到后端。
              </p>
              {work.interactions?.length ? (
                work.interactions.map((i, n) => (
                  <p className="peer-message" key={n}>
                    <strong>{i.author}</strong> ·{" "}
                    {i.kind === "like" ? "♡ 点赞了这件作品" : i.content}
                  </p>
                ))
              ) : (
                <p className="muted">本快照尚未收录这件作品的同伴留言。</p>
              )}
              <a
                className="community-login"
                href="https://colorverse-dev.2999346.workers.dev/"
                target="_blank"
                rel="noreferrer"
              >
                进入真实课堂，留下你的回应 ↗
              </a>
            </section>
            <button
              aria-pressed={Boolean(liked[work.id])}
              onClick={() =>
                setLiked((v) => ({ ...v, [work.id]: !v[work.id] }))
              }
            >
              {liked[work.id] ? "♥ 已欣赏 · 点击取消" : "♡ 欣赏这件作品"}
            </button>
            <p className="muted">
              点赞仅演示即时反馈，不写入课堂互动记录。此处展示压缩预览；原图保留在教学版。
            </p>
          </section>
        </dialog>
      )}
    </div>
  );
}
