import { useEffect, useRef, useState } from "react";
import "./course.css";
import type {
  Assignment,
  CourseClass,
  CourseUser,
  SubmissionDraft,
  SubmissionDetail,
  SubmissionSummary,
} from "@colorverse/contracts";
import { classDeadlineToUtc } from "@colorverse/domain";
import { CourseApi, courseApiBase } from "./course-api";
const states = {
  draft: "草稿",
  submitted: "已提交",
  returned: "已退回",
  graded: "已批改",
};
const empty: SubmissionDraft = { description: "", colorTags: [], assets: [] };
export function CourseView({
  onPendingChange,
}: {
  onPendingChange: (pending: boolean) => void;
}) {
  const api = useRef(new CourseApi()).current;
  const [user, setUser] = useState<CourseUser | null>(null),
    [accounts, setAccounts] = useState<CourseUser[]>([]),
    [classes, setClasses] = useState<CourseClass[]>([]),
    [classId, setClassId] = useState(""),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [assignmentId, setAssignmentId] = useState(""),
    [detail, setDetail] = useState<SubmissionDetail | null>(null),
    [summaries, setSummaries] = useState<SubmissionSummary[]>([]),
    [draft, setDraft] = useState<SubmissionDraft>(empty),
    [tagsText, setTagsText] = useState(""),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [connected, setConnected] = useState(false),
    [development, setDevelopment] = useState(false),
    [versionIndex, setVersionIndex] = useState(-1),
    [createOpen, setCreateOpen] = useState(false),
    [decision, setDecision] = useState<"graded" | "returned">("graded"),
    [score, setScore] = useState(""),
    [comment, setComment] = useState("");
  const pending = useRef<{ id: string; revision: number; key: string } | null>(
    null,
  );
  useEffect(() => {
    onPendingChange(dirty || busy);
    return () => onPendingChange(false);
  }, [dirty, busy, onPendingChange]);
  const classroom = classes.find((c) => c.id === classId),
    assignment = assignments.find((a) => a.id === assignmentId),
    teacher = classroom?.role === "teacher";
  const activeVersion =
    detail?.versions[
      versionIndex < 0 ? detail.versions.length - 1 : versionIndex
    ];
  const date = (time: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: classroom?.timezone || "Asia/Shanghai",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(time));
  const execute = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const loadClasses = async () => {
    const result = await api.classes();
    setClasses(result.classes);
    setClassId(result.classes[0]?.id || "");
  };
  useEffect(() => {
    if (!courseApiBase) return;
    let current = true;
    void (async () => {
      try {
        const health = await api.request<{ development: boolean }>("/health");
        if (!current) return;
        setConnected(true);
        setDevelopment(health.development);
        try {
          const session = await api.session();
          if (!current) return;
          setUser(session.user);
          await loadClasses();
        } catch {
          if (health.development) {
            const result = await api.request<{ accounts: CourseUser[] }>(
              "/dev/accounts",
            );
            if (current) setAccounts(result.accounts);
          }
        }
      } catch (e) {
        if (current)
          setError(e instanceof Error ? e.message : "课程服务未连接");
      }
    })();
    return () => {
      current = false;
    };
  }, [api]);
  useEffect(() => {
    if (!classId) return;
    let current = true;
    setDetail(null);
    setAssignments([]);
    setAssignmentId("");
    setCreateOpen(false);
    void api
      .assignments(classId)
      .then((result) => {
        if (current) {
          setAssignments(result.assignments);
          setAssignmentId(result.assignments[0]?.id || "");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [classId, api]);
  useEffect(() => {
    if (!assignmentId || !classroom) return;
    let current = true;
    setDetail(null);
    setSummaries([]);
    setDirty(false);
    setVersionIndex(-1);
    pending.current = null;
    void (async () => {
      try {
        if (classroom.role === "teacher") {
          const result = await api.summaries(assignmentId);
          if (current) setSummaries(result.submissions);
        } else if (classroom.role === "student") {
          const sub = await api.open(assignmentId),
            result = await api.detail(sub.id);
          if (current) {
            setDetail(result);
            setDraft(result.submission.draft);
            setTagsText(result.submission.draft.colorTags.join(" "));
          }
        }
      } catch (e) {
        if (current) setError(e instanceof Error ? e.message : "作业加载失败");
      }
    })();
    return () => {
      current = false;
    };
  }, [assignmentId, classroom, api]);
  const reload = async (id = detail?.submission.id) => {
    if (!id) return;
    const result = await api.detail(id);
    setDetail(result);
    if (!teacher) {
      setDraft(result.submission.draft);
      setTagsText(result.submission.draft.colorTags.join(" "));
    }
    if (id !== detail?.submission.id) {
      setScore("");
      setComment("");
      setDecision("graded");
    }
    setDirty(false);
    setVersionIndex(-1);
    if (teacher && assignmentId)
      setSummaries((await api.summaries(assignmentId)).submissions);
  };
  const save = async () => {
    if (!detail) return;
    const sub = await api.save(
      detail.submission.id,
      detail.submission.revision,
      draft,
    );
    setDetail({ ...detail, submission: sub });
    setDirty(false);
    return sub;
  };
  const submit = () =>
    execute(async () => {
      if (!detail) return;
      const sub = dirty ? await save() : detail.submission;
      if (!sub) return;
      if (!pending.current || pending.current.id !== sub.id)
        pending.current = {
          id: sub.id,
          revision: sub.revision,
          key: crypto.randomUUID(),
        };
      const request = pending.current;
      const result = await api.submit(
        request.id,
        request.revision,
        request.key,
      );
      pending.current = null;
      await reload(result.submission.id);
      setNotice(
        `提交成功 · 第${result.version.versionNo}版${result.version.isLate ? " · 迟交" : ""}。已固定保存，后续编辑不会覆盖这一版。`,
      );
    });
  const upload = async (files: FileList | null) => {
    if (!files) return;
    await execute(async () => {
      if (draft.assets.length + files.length > 3)
        throw new Error("每份作业最多三张图片");
      const additions: SubmissionDraft["assets"] = [];
      for (const file of [...files]) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error("每张图片不能超过20 MiB");
        const image = await api.upload(file);
        additions.push({
          assetId: image.id,
          role: draft.assets.length + additions.length ? "process" : "final",
        });
      }
      setDraft({ ...draft, assets: [...draft.assets, ...additions] });
      setDirty(true);
    });
  };
  if (!courseApiBase || !connected)
    return (
      <main className="course-page">
        <p className="eyebrow">COLORVERSE · CLASSROOM</p>
        <h1>课程作业</h1>
        <div className="course-empty">
          <h2>在线课堂即将开放</h2>
          <p>此演示暂未连接课程服务。你仍可编辑星球、保存草稿和导出作品。</p>
          {error && <p role="alert">{error}</p>}
        </div>
      </main>
    );
  if (!user)
    return (
      <main className="course-page">
        <p className="eyebrow">COLORVERSE · CLASSROOM</p>
        <h1>进入课程课堂</h1>
        {development && (
          <div className="course-test-banner">
            本机测试课堂 · 以下都是测试账户，尚未接入正式登录
          </div>
        )}
        <div className="course-login">
          {accounts.map((a) => (
            <button
              key={a.id}
              disabled={busy}
              onClick={() =>
                void execute(async () => {
                  const session = await api.login(a.id);
                  setUser(session.user);
                  setAccounts([]);
                  await loadClasses();
                })
              }
            >
              {a.displayName}
              <span>进入课堂 ↗</span>
            </button>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <main className="course-page">
      <div className="course-heading">
        <div>
          <p className="eyebrow">COLORVERSE · CLASSROOM</p>
          <h1>{teacher ? "班级作业" : "我的课程作业"}</h1>
        </div>
        <div>
          <span>{user.displayName}</span>
          <button
            disabled={busy}
            onClick={() =>
              void execute(async () => {
                if (dirty) throw new Error("请先保存作业草稿，再刷新课堂");
                if (teacher && assignmentId)
                  setSummaries((await api.summaries(assignmentId)).submissions);
                if (detail) await reload();
              })
            }
          >
            刷新课堂
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void execute(async () => {
                if (dirty) throw new Error("请先保存作业草稿，再退出课堂");
                await api.request("/logout", "POST", {});
                setUser(null);
                setClasses([]);
                setClassId("");
                setDetail(null);
                setAccounts(
                  (
                    await api.request<{ accounts: CourseUser[] }>(
                      "/dev/accounts",
                    )
                  ).accounts,
                );
              })
            }
          >
            退出课堂
          </button>
        </div>
      </div>
      {development && (
        <div className="course-test-banner">
          本机测试课堂 · 作业保存到本机课程后端；未发布到公开宇宙
        </div>
      )}
      {error && (
        <div className="course-message error" role="alert">
          {error}
          <button disabled={busy} onClick={() => void execute(() => reload())}>
            重新载入作业
          </button>
        </div>
      )}
      {notice && (
        <div className="course-message" role="status">
          {notice}
        </div>
      )}
      <div className="course-layout">
        <aside className="course-sidebar">
          <label>
            班级
            <select
              aria-label="课程班级"
              value={classId}
              disabled={busy}
              onChange={(e) => {
                if (dirty) {
                  setError("请先保存作业草稿，再切换班级");
                  return;
                }
                setClassId(e.target.value);
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <p className="course-zone">班级时区 · {classroom?.timezone}</p>
          <div className="course-assignment-list" aria-label="课程作业列表">
            {assignments.map((a) => (
              <button
                key={a.id}
                aria-pressed={a.id === assignmentId}
                onClick={() => {
                  if (dirty) {
                    setError("请先保存作业草稿，再切换作业");
                    return;
                  }
                  setAssignmentId(a.id);
                  setCreateOpen(false);
                  setError("");
                  setNotice("");
                }}
              >
                <strong>{a.title}</strong>
                <span>
                  {date(a.dueAt)} ·{" "}
                  {a.status === "closed"
                    ? "已关闭"
                    : a.status === "draft"
                      ? "未发布"
                      : "已发布"}
                </span>
              </button>
            ))}
          </div>
          {teacher && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => setCreateOpen(true)}
            >
              ＋ 布置作业
            </button>
          )}
        </aside>
        <section className="course-content">
          {createOpen && classroom ? (
            <AssignmentForm
              busy={busy}
              timezone={classroom.timezone}
              onSave={(input) =>
                void execute(async () => {
                  const a = await api.create(classId, input);
                  setAssignments([...assignments, a]);
                  setAssignmentId(a.id);
                  setCreateOpen(false);
                  setNotice("作业已发布给班级学生。");
                })
              }
            />
          ) : assignment ? (
            <>
              <div className="course-assignment-header">
                <span className="course-badge">{assignment.module}</span>
                <h2>{assignment.title}</h2>
                <p>{assignment.instructions}</p>
                <div className="course-deadlines">
                  <span>截止 · {date(assignment.dueAt)}</span>
                  {assignment.lateUntil && (
                    <span>补交截止 · {date(assignment.lateUntil)}</span>
                  )}
                  <span>满分 {assignment.maxScore}</span>
                </div>
              </div>
              {teacher ? (
                <div className="course-submissions">
                  <h3>学生提交 · {summaries.length}份</h3>
                  {summaries.length === 0 ? (
                    <p>还没有学生提交。私人草稿不会出现在这里。</p>
                  ) : (
                    summaries.map((s) => (
                      <button
                        key={s.id}
                        aria-pressed={detail?.submission.id === s.id}
                        onClick={() => void execute(() => reload(s.id))}
                      >
                        <strong>{s.studentName}</strong>
                        <span>
                          {states[s.state]}
                          {s.isLate ? " · 迟交" : ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                detail && (
                  <div className="course-draft">
                    <div className="course-section-heading">
                      <h3>我的作业草稿</h3>
                      <span>
                        {states[detail.submission.state]} ·{" "}
                        {dirty ? "尚未保存" : "已保存"}
                      </span>
                    </div>
                    <p className="course-hint">
                      最多3张图片，每张不超过20
                      MiB；提交版本只对你和本班老师可见。
                    </p>
                    <label className="course-upload">
                      ＋ 添加作品图片
                      <input
                        type="file"
                        aria-label="上传作业图片"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={busy}
                        onChange={(e) => {
                          void upload(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <div className="course-image-grid">
                      {draft.assets.map((a, i) => (
                        <div key={a.assetId}>
                          <img
                            src={api.display(a.assetId)}
                            alt={`作业图片 ${i + 1}`}
                          />
                          <select
                            aria-label={`作业图片 ${i + 1}用途`}
                            value={a.role}
                            disabled={busy}
                            onChange={(e) => {
                              setDraft({
                                ...draft,
                                assets: draft.assets.map((v) =>
                                  v.assetId === a.assetId
                                    ? {
                                        ...v,
                                        role: e.target.value as
                                          "final" | "process",
                                      }
                                    : v,
                                ),
                              });
                              setDirty(true);
                            }}
                          >
                            <option value="final">最终作品</option>
                            <option value="process">过程图</option>
                          </select>
                          <button
                            disabled={busy}
                            aria-label={`移除作业图片 ${i + 1}`}
                            onClick={() => {
                              setDraft({
                                ...draft,
                                assets: draft.assets.filter(
                                  (v) => v.assetId !== a.assetId,
                                ),
                              });
                              setDirty(true);
                            }}
                          >
                            移除图片
                          </button>
                        </div>
                      ))}
                    </div>
                    <label>
                      创作说明
                      <textarea
                        aria-label="作业创作说明"
                        maxLength={6000}
                        value={draft.description}
                        disabled={busy}
                        onChange={(e) => {
                          setDraft({ ...draft, description: e.target.value });
                          setDirty(true);
                        }}
                        placeholder="说说你选择的颜色与创作过程…"
                      />
                    </label>
                    <label>
                      色彩关键词
                      <input
                        aria-label="作业色彩关键词"
                        value={tagsText}
                        disabled={busy}
                        onChange={(e) => {
                          setTagsText(e.target.value);
                          setDraft({
                            ...draft,
                            colorTags: e.target.value
                              .split(/\s+/)
                              .filter(Boolean),
                          });
                          setDirty(true);
                        }}
                        placeholder="温暖 宁静 对比"
                      />
                    </label>
                    <div className="course-actions">
                      <button
                        disabled={busy || !dirty}
                        onClick={() =>
                          void execute(async () => {
                            await save();
                            setNotice("作业草稿已保存，尚未提交给老师。");
                          })
                        }
                      >
                        保存作业草稿
                      </button>
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          assignment.status !== "published" ||
                          (detail.submission.state === "graded" &&
                            !assignment.allowResubmission)
                        }
                        onClick={() => void submit()}
                      >
                        {busy
                          ? "正在处理…"
                          : detail.versions.length
                            ? "提交新版本"
                            : "提交作业"}
                      </button>
                    </div>
                    {detail.submission.state === "graded" &&
                      !assignment.allowResubmission && (
                        <p className="course-hint">
                          这份作业已批改，需要老师退回后才能重新提交。
                        </p>
                      )}
                  </div>
                )
              )}
              {detail && detail.versions.length > 0 && (
                <section className="course-history">
                  <div className="course-section-heading">
                    <h3>已提交版本</h3>
                    <select
                      aria-label="选择作业版本"
                      value={activeVersion?.id || ""}
                      onChange={(e) =>
                        setVersionIndex(
                          detail.versions.findIndex(
                            (v) => v.id === e.target.value,
                          ),
                        )
                      }
                    >
                      {detail.versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          第{v.versionNo}版 · {date(v.submittedAt)}
                          {v.isLate ? " · 迟交" : ""}
                          {i === detail.versions.length - 1
                            ? " · 当前版本"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {activeVersion && (
                    <>
                      <p>{activeVersion.description || "未填写创作说明"}</p>
                      <div className="course-tags">
                        {activeVersion.colorTags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <div className="course-image-grid">
                        {activeVersion.assets.map((a) => (
                          <figure key={a.assetId}>
                            <img
                              src={api.display(a.assetId)}
                              alt={
                                a.role === "final"
                                  ? "已提交的最终作品"
                                  : "已提交的过程图"
                              }
                            />
                            <figcaption>
                              {a.role === "final" ? "最终作品" : "过程图"}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                      <p className="course-hint">
                        此版本已固定保存；编辑草稿不会改变它。
                      </p>
                      <div className="course-reviews">
                        {detail.reviews
                          .filter(
                            (r) => r.submissionVersionId === activeVersion.id,
                          )
                          .map((r) => (
                            <article key={r.id}>
                              <strong>
                                {r.decision === "returned"
                                  ? "退回修改"
                                  : `评分 ${r.score} / ${assignment.maxScore}`}
                              </strong>
                              <p>{r.comment || "老师未填写评语"}</p>
                              <small>
                                {date(r.createdAt)}
                                {r.supersedesId ? " · 更新评阅" : ""}
                              </small>
                            </article>
                          ))}
                      </div>
                      {teacher && (
                        <div className="course-review-form">
                          <h3>评阅第{activeVersion.versionNo}版</h3>
                          <label>
                            评阅方式
                            <select
                              aria-label="评阅方式"
                              value={decision}
                              disabled={busy}
                              onChange={(e) =>
                                setDecision(
                                  e.target.value as "graded" | "returned",
                                )
                              }
                            >
                              <option value="graded">批改评分</option>
                              <option value="returned">退回修改</option>
                            </select>
                          </label>
                          {decision === "graded" && (
                            <label>
                              分数
                              <input
                                aria-label="作业评分"
                                type="number"
                                min={0}
                                max={assignment.maxScore}
                                value={score}
                                disabled={busy}
                                onChange={(e) => setScore(e.target.value)}
                              />
                            </label>
                          )}
                          <label>
                            评语
                            <textarea
                              aria-label="作业评语"
                              value={comment}
                              disabled={busy}
                              maxLength={6000}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="给学生具体的反馈…"
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={
                              busy || (decision === "graded" && score === "")
                            }
                            onClick={() =>
                              void execute(async () => {
                                await api.review(
                                  detail.submission.id,
                                  activeVersion.id,
                                  detail.submission.revision,
                                  decision,
                                  decision === "graded" ? Number(score) : null,
                                  comment,
                                );
                                await reload();
                                setComment("");
                                setScore("");
                                setNotice(
                                  decision === "returned"
                                    ? "作业已退回，学生可以修改后重新提交。"
                                    : "评阅已保存，学生可以查看分数和评语。",
                                );
                              })
                            }
                          >
                            {decision === "returned"
                              ? "退回这份作业"
                              : "保存评阅"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="course-empty">
              <h2>选择一项作业</h2>
              <p>
                {teacher
                  ? "可以先为班级布置第一项作业。"
                  : "老师发布的作业会出现在这里。"}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
function AssignmentForm({
  timezone,
  busy,
  onSave,
}: {
  timezone: string;
  busy: boolean;
  onSave: (input: import("@colorverse/contracts").AssignmentInput) => void;
}) {
  const [title, setTitle] = useState(""),
    [instructions, setInstructions] = useState(""),
    [module, setModule] = useState("色彩练习"),
    [due, setDue] = useState(""),
    [late, setLate] = useState(""),
    [max, setMax] = useState("100"),
    [error, setError] = useState("");
  return (
    <form
      className="course-assignment-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          setError("");
          onSave({
            title,
            instructions,
            module,
            dueAt: classDeadlineToUtc(due, timezone),
            lateUntil: late ? classDeadlineToUtc(late, timezone) : null,
            maxScore: Number(max),
            status: "published",
            allowResubmission: false,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "截止时间不正确");
        }
      }}
    >
      <h2>布置新作业</h2>
      <label>
        作业名称
        <input
          aria-label="新作业名称"
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        教学模块
        <input
          aria-label="新作业模块"
          required
          maxLength={80}
          value={module}
          onChange={(e) => setModule(e.target.value)}
        />
      </label>
      <label>
        作业要求
        <textarea
          aria-label="新作业要求"
          maxLength={6000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label>
        截止时间 · {timezone}
        <input
          aria-label="新作业截止时间"
          required
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <label>
        允许补交至（可选）
        <input
          aria-label="新作业补交截止"
          type="datetime-local"
          value={late}
          onChange={(e) => setLate(e.target.value)}
        />
      </label>
      <label>
        满分
        <input
          aria-label="新作业满分"
          required
          type="number"
          min={1}
          max={1000}
          value={max}
          onChange={(e) => setMax(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy} type="submit">
        发布作业
      </button>
    </form>
  );
}
