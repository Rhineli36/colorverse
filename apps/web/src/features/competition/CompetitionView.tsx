import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  CloudPlanetDocumentSchema,
  GrowthPresetIds,
  GrowthPresets,
} from "@colorverse/contracts";
import { CloudUniverse } from "../classroom/CloudUniverse";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import { CloudAtmosphere } from "../classroom/CloudStudentGuide";
import "../classroom/classroom.css";
import "./competition.css";
const Work = z.strictObject({
  id: z.string(),
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
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState("universe"),
    [selected, setSelected] = useState(""),
    [work, setWork] = useState<Artwork | null>(null),
    [birth, setBirth] = useState(false),
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
  const student = data?.students.find((s) => s.id === selected);
  const defaultPlanet = data?.defaults.find((s) => s.id === selected);
  return (
    <div className="competition-app">
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
            ["gallery", "作品展览"],
            ["teacher", "教师视角"],
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
                <div
                  className="competition-room"
                  style={
                    {
                      "--room-color": student.document.color,
                      ...(student.interior
                        ? {
                            backgroundImage: `linear-gradient(#07121e55,#07121e33),url(${root + student.interior})`,
                          }
                        : {}),
                    } as React.CSSProperties
                  }
                >
                  <CloudAtmosphere kind={student.document.atmosphere} />
                  <div className="competition-room-heading">
                    {student.exterior && (
                      <img
                        className="competition-room-portrait"
                        src={root + student.exterior}
                        alt="作品风格星球外貌"
                      />
                    )}
                    <div>
                      <p className="eyebrow">A WORLD OF CREATIVE GROWTH</p>
                      <h2>{student.document.metadata.name}</h2>
                      {student.style && (
                        <p className="competition-style-label">
                          作品风格：{student.style}
                        </p>
                      )}
                      <p>点击成长元素，欣赏它所收藏的作品。</p>
                    </div>
                    <button disabled={birth} onClick={() => setBirth(true)}>
                      {birth ? "新元素正在生长…" : "回看元素生长 ✦"}
                    </button>
                  </div>
                  <div className="competition-elements">
                    {student.works.map((w, i) => (
                      <button
                        key={w.id}
                        className={`competition-element ${birth && i === 0 ? "born" : ""}`}
                        aria-label={`欣赏作品：${w.title}`}
                        onClick={() => setWork(w)}
                      >
                        <GrowthPresetPreview
                          id={w.presetId}
                          color={student.document.color}
                        />
                        <span>{GrowthPresets[w.presetId].name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="competition-work-grid">
                  {student.works.map((w) => (
                    <button key={w.id} onClick={() => setWork(w)}>
                      <img
                        src={root + w.image}
                        alt={w.title}
                        loading="lazy"
                        decoding="async"
                        width="400"
                        height="400"
                      />
                      <strong>{w.title}</strong>
                      <small>打开作品 · 查看点评 ↗</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        <footer className="competition-footer">
          往届设计色彩课程作品的演示预览 · 学生身份匿名展示 ·
          不包含真实账号、密码或班级成绩
        </footer>
      </main>
      {work && (
        <dialog
          ref={dialog}
          aria-label="比赛作品展示"
          onCancel={() => setWork(null)}
          className="competition-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWork(null);
          }}
        >
          <section className="competition-modal">
            <button
              className="modal-close"
              aria-label="关闭作品"
              onClick={() => setWork(null)}
            >
              ×
            </button>
            <img src={root + work.image} alt={work.title} />
            <h2>{work.title}</h2>
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
