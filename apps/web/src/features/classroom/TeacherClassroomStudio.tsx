import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  AssignmentCatalog,
  PublicationSchema,
  RosterStudentSchema,
  SubmissionRowSchema,
  type CloudSession,
  type Publication,
  type RosterStudent,
  type SubmissionRow,
} from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import { CloudClassroomView } from "./CloudClassroomView";
import { CloudWorkReview } from "./CloudWorkReview";
import { Gallery } from "./CloudGallery";
import { usePrivateImage, retryPlanetImages } from "./CloudPlanetAppearance";
import { StudentImporter } from "./StudentImporter";
import { AssignmentPublisher } from "./ClassroomMail";
import { download } from "../../app/download";
import "./classroom-studio.css";
const json = async (path: string, body?: unknown) =>
  (
    await classroomRequest(
      path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    )
  ).json();
const statusLabel = (r: SubmissionRow) =>
  r.status === "missing"
    ? "未提交"
    : r.status === "reviewed"
      ? "已批改"
      : r.updated
        ? "已更新，待复核"
        : "待批改";
function WorkPicture({
  classId,
  id,
  small = false,
  index = 0,
}: {
  classId: string;
  id: string;
  small?: boolean;
  index?: number;
}) {
  const image = usePrivateImage(
    `classes/${classId}/works/${id}/image?index=${index}`,
    id + ":" + index,
  );
  return image.url ? (
    <img
      className={small ? "submission-thumb" : "review-picture"}
      src={image.url}
      alt={small ? "作品缩略图" : "学生作品"}
    />
  ) : (
    <span>
      {image.error ? (
        <button onClick={retryPlanetImages}>图片重试</button>
      ) : (
        "读取图片…"
      )}
    </span>
  );
}
type Props = {
  session: CloudSession;
  initialClassId?: string;
  onPendingChange?: (v: boolean) => void;
  onPlanetAction?: (
    id: string,
    action: "room" | "edit" | "feedback",
    classId: string,
    workId?: string,
  ) => void;
  initialWorkId?: string;
  initialWorkRequest?: number;
};
export function TeacherClassroomStudio(props: Props) {
  const memberships =
    props.session.access === "active"
      ? props.session.memberships.filter((m) => m.role !== "student")
      : [];
  const [classId, setClassId] = useState(
    props.initialClassId ?? memberships[0]?.classId ?? "",
  );
  const [tab, setTab] = useState("roster"),
    [students, setStudents] = useState<RosterStudent[]>([]),
    [publications, setPublications] = useState<Publication[]>([]),
    [selected, setSelected] = useState<Publication>(),
    [rows, setRows] = useState<SubmissionRow[]>([]);
  const [student, setStudent] = useState<RosterStudent>(),
    [work, setWork] = useState<SubmissionRow>(),
    [dirty, setDirty] = useState(false),
    [reviewEpoch, setReviewEpoch] = useState(0),
    [gallery, setGallery] = useState<z.infer<typeof Gallery>>(),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [detailBusy, setDetailBusy] = useState(false),
    [draftTask, setDraftTask] = useState<string>(),
    [targets, setTargets] = useState<string[]>([]),
    [deadline, setDeadline] = useState(""),
    [publishRequest, setPublishRequest] = useState(""),
    [resetMessage, setResetMessage] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  useEffect(() => setImageIndex(0), [work?.workId]);
  const [unlinked, setUnlinked] = useState<
    { id: string; title: string; owner_enrollment_id: string }[]
  >([]);
  const [catalog, setCatalog] = useState(
    AssignmentCatalog.map((t) => ({ ...t })),
  );
  const root = `classes/${classId}/`,
    generation = useRef(0),
    handledNotice = useRef(""),
    table = useRef<HTMLDivElement>(null);
  const refresh = () => setRevision((n) => n + 1);
  const discard = () =>
    !dirty || window.confirm("有尚未保存的评分或评语，确定放弃并继续吗？");
  useEffect(() => {
    if (props.initialClassId && props.initialClassId !== classId) {
      setClassId(props.initialClassId);
      setSelected(undefined);
      setWork(undefined);
      setStudent(undefined);
      setGallery(undefined);
      setPublications([]);
      setQuery("");
      setFilter("all");
    }
  }, [props.initialClassId, props.initialWorkRequest]);
  useEffect(() => {
    props.onPendingChange?.(dirty);
  }, [dirty, props.onPendingChange]);
  useEffect(
    () => () => props.onPendingChange?.(false),
    [props.onPendingChange],
  );
  useEffect(() => {
    const attempt = ++generation.current;
    setBusy(true);
    setError("");
    Promise.all([
      json(root + "management/roster"),
      json(root + "publications"),
      json(root + "planets"),
      json(root + "learning-tasks"),
      json(root + "management/unlinked"),
    ])
      .then(([s, p, g, t, u]) => {
        if (attempt !== generation.current) return;
        setStudents(z.array(RosterStudentSchema).parse(s.students));
        setPublications(z.array(PublicationSchema).parse(p.publications));
        setGallery(Gallery.parse(g));
        setUnlinked(u.works);
        setCatalog([
          ...AssignmentCatalog,
          ...t.tasks.flatMap(
            (x: { definition?: (typeof AssignmentCatalog)[number] }) =>
              x.definition ? [x.definition] : [],
          ),
        ]);
      })
      .catch((e) => {
        if (attempt === generation.current) setError(e.message);
      })
      .finally(() => {
        if (attempt === generation.current) setBusy(false);
      });
  }, [classId, revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetailBusy(true);
    setError("");
    json(root + "publications/" + selected.id)
      .then((v) => {
        if (active) {
          setSelected(PublicationSchema.parse(v.publication));
          setRows(z.array(SubmissionRowSchema).parse(v.students));
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setDetailBusy(false));
    return () => {
      active = false;
    };
  }, [selected?.id, classId, revision]);
  useEffect(() => {
    if (!props.initialWorkId || !gallery) return;
    if (props.initialClassId && props.initialClassId !== classId) return;
    const noticeKey = `${classId}:${props.initialWorkId}:${props.initialWorkRequest ?? 0}`;
    if (handledNotice.current === noticeKey) return;
    let active = true;
    Promise.all(
      publications.map(async (p) => ({
        p,
        data: await json(root + "publications/" + p.id),
      })),
    )
      .then((all) => {
        if (!active) return;
        for (const { p, data } of all) {
          const r = z
            .array(SubmissionRowSchema)
            .parse(data.students)
            .find((r) => r.workId === props.initialWorkId);
          if (r) {
            handledNotice.current = noticeKey;
            setTab("assignments");
            setSelected(p);
            setRows(data.students);
            setWork(r);
            return;
          }
        }
        const planet = gallery.planets.find((p) =>
          p.works.some((w) => w.id === props.initialWorkId),
        );
        handledNotice.current = noticeKey;
        if (planet)
          props.onPlanetAction?.(
            planet.id,
            "feedback",
            classId,
            props.initialWorkId,
          );
        else setError("该作品已删除或不可访问，请刷新消息列表。");
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [
    props.initialWorkId,
    props.initialWorkRequest,
    props.initialClassId,
    classId,
    gallery,
    publications.map((p) => p.id).join("|"),
  ]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const beginPublish = (taskId: string) => {
    setDraftTask(taskId);
    setTargets(students.map((s) => s.enrollmentId));
    setDeadline("");
    setPublishRequest(crypto.randomUUID());
  };
  const openWork = (row: SubmissionRow) => {
    if (!row.workId || !discard()) return;
    setDirty(false);
    setReviewEpoch((n) => n + 1);
    setWork(row);
  };
  const lookup = (workId: string) =>
    gallery?.planets.flatMap((p) => p.works).find((w) => w.id === workId);
  const activeWork = work?.workId ? lookup(work.workId) : undefined;
  const foundStudents = students.filter(
    (s) =>
      (s.name + " " + s.studentNumber).includes(query.trim()) &&
      (filter !== "no-planet" || !s.planetId) &&
      (filter !== "missing" || s.submitted < s.expected),
  );
  const foundRows = rows.filter(
    (r) =>
      (r.name + " " + r.studentNumber).includes(query.trim()) &&
      (filter === "all" || r.status === filter),
  );
  const metrics = (p: Publication) => (
    <div className="assignment-metrics">
      {[
        ["应交", p.expected],
        ["已交", p.submitted],
        ["未交", p.missing],
        ["待批改", p.pending],
        ["已批改", p.reviewed],
      ].map(([label, n]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{n}</strong>
        </div>
      ))}
    </div>
  );
  return (
    <section className="classroom-studio" aria-label="课堂教师管理">
      <header className="classroom-studio-heading">
        <h1>教师管理</h1>
        <select
          aria-label="管理班级"
          value={classId}
          disabled={dirty}
          onChange={(e) => {
            setClassId(e.target.value);
            setSelected(undefined);
            setStudent(undefined);
            setWork(undefined);
            setQuery("");
            setFilter("all");
          }}
        >
          {memberships.map((m) => (
            <option key={m.classId} value={m.classId}>
              {m.title}
            </option>
          ))}
        </select>
        <nav aria-label="教师管理分区">
          {[
            ["roster", "学生名单"],
            ["assignments", "作业管理"],
            ["planets", "星球管理"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                if (discard()) {
                  setDirty(false);
                  setWork(undefined);
                  setTab(id);
                  setQuery("");
                  setFilter("all");
                }
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      {error && (
        <div role="alert" className="classroom-error">
          {error}
          <button onClick={refresh}>重新读取</button>
        </div>
      )}
      {resetMessage && (
        <div className="classroom-secret" role="status">
          {resetMessage}
          <button onClick={() => setResetMessage("")}>已妥善记录，关闭</button>
        </div>
      )}
      {tab === "planets" ? (
        <CloudClassroomView {...props} initialClassId={classId} />
      ) : (
        <>
          <div className="classroom-studio-tools">
            <button disabled={busy} onClick={refresh}>
              刷新
            </button>
            <StudentImporter
              classes={memberships}
              initialClassId={classId}
              actorId={props.session.identity.id}
              disabled={busy}
              onChanged={refresh}
            />
            <AssignmentPublisher
              disabled={busy}
              catalog={catalog}
              onPublish={async (id) => beginPublish(id)}
              onCreate={async (definition, image, requestId) => {
                const body = new FormData();
                body.set("metadata", JSON.stringify({ requestId, definition }));
                if (image) body.set("image", image);
                const r = await (
                  await classroomRequest(root + "learning-tasks", {
                    method: "POST",
                    body,
                  })
                ).json();
                refresh();
                beginPublish(r.taskId);
              }}
            />
          </div>
          {busy && <p role="status">正在读取或保存课堂数据…</p>}
          {tab === "roster" ? (
            <div className="classroom-board">
              <div className="roster-metrics">
                {[
                  ["班级人数", students.length],
                  ["已创建星球", students.filter((s) => s.planetId).length],
                  ["尚未创建", students.filter((s) => !s.planetId).length],
                ].map(([t, n]) => (
                  <div key={t}>
                    <span>{t}</span>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
              <div className="classroom-list-tools">
                <input
                  aria-label="搜索学生名单"
                  placeholder="搜索姓名或学号"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="筛选学生名单"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">全部学生</option>
                  <option value="no-planet">尚未创建星球</option>
                  <option value="missing">有未交作业</option>
                </select>
              </div>
              <div className="classroom-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "学号",
                        "姓名",
                        "星球",
                        "已交 / 应交",
                        "待批改",
                        "操作",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {foundStudents.map((s) => (
                      <tr key={s.enrollmentId}>
                        <td>{s.studentNumber || "未登记"}</td>
                        <td>{s.name}</td>
                        <td>{s.planetName || "尚未创建"}</td>
                        <td>
                          {s.submitted} / {s.expected}
                        </td>
                        <td>{s.pending}</td>
                        <td>
                          <button
                            onClick={() => {
                              if (discard()) {
                                setWork(undefined);
                                setStudent(s);
                                setDirty(false);
                              }
                            }}
                          >
                            查看学生
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!busy && !foundStudents.length && (
                <p className="classroom-empty">
                  {students.length
                    ? "没有符合条件的学生。"
                    : "尚无学生，请先导入点名册。"}
                </p>
              )}
            </div>
          ) : !selected ? (
            <div className="classroom-board">
              <h2>已发布的作业</h2>
              {publications.map((p) => (
                <article className="publication-card" key={p.id}>
                  <h3>{p.definition.title}</h3>
                  <p>
                    {p.targetLabel} · 截止：
                    {p.dueAt
                      ? new Date(p.dueAt).toLocaleString("zh-CN")
                      : "未设置"}
                  </p>
                  {metrics(p)}
                  <button
                    onClick={() => {
                      setSelected(p);
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    查看提交 →
                  </button>
                </article>
              ))}
              {!busy && !publications.length && (
                <p className="classroom-empty">
                  尚未布置作业。发布时确认应交学生，历史作品不会自动归入新作业。
                </p>
              )}
              {unlinked.length > 0 && (
                <details>
                  <summary>{unlinked.length} 件历史作品待确认关联</summary>
                  <p>
                    保留原记录，不自动猜测作业归属。打开某项作业后可确认关联。
                  </p>
                </details>
              )}
            </div>
          ) : (
            <div className={`assignment-workspace ${work ? "has-review" : ""}`}>
              <article className="classroom-board assignment-board">
                <button
                  onClick={() => {
                    if (discard()) {
                      setDirty(false);
                      setWork(undefined);
                      setSelected(undefined);
                      setQuery("");
                      setFilter("all");
                    }
                  }}
                >
                  ← 返回作业列表
                </button>
                <h2>{selected.definition.title}</h2>
                <p>{selected.definition.description}</p>
                <p className="muted">
                  截止时间：
                  {selected.dueAt
                    ? new Date(selected.dueAt).toLocaleString("zh-CN")
                    : "未设置"}{" "}
                  · {selected.targetLabel}
                </p>
                {metrics(selected)}
                {selected.expected ? (
                  <div className="submission-progress">
                    提交率{" "}
                    {Math.round((selected.submitted / selected.expected) * 100)}
                    %{" "}
                    <progress
                      max={selected.expected}
                      value={selected.submitted}
                    />
                    <span>
                      {selected.submitted} / {selected.expected}
                    </span>
                  </div>
                ) : (
                  <p>暂无应交学生，可以明确补发给本班学生。</p>
                )}
                <div className="classroom-list-tools">
                  {[
                    ["all", "全部"],
                    ["missing", "未提交"],
                    ["pending", "待批改"],
                    ["reviewed", "已批改"],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                    >
                      {name}
                    </button>
                  ))}
                  <input
                    aria-label="搜索作业提交"
                    placeholder="搜索姓名或学号"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {detailBusy && <p role="status">正在读取提交情况…</p>}
                <div className="classroom-table-scroll" ref={table}>
                  <table>
                    <thead>
                      <tr>
                        {[
                          "学生",
                          "作品",
                          "状态",
                          "最近提交",
                          "评分",
                          "操作",
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {foundRows.map((r) => (
                        <tr
                          key={r.enrollmentId}
                          className={
                            work?.workId && r.workId === work.workId
                              ? "is-selected"
                              : ""
                          }
                        >
                          <td>
                            <strong>{r.name}</strong>
                            <small>{r.studentNumber || "未登记学号"}</small>
                          </td>
                          <td>
                            {r.workId ? (
                              <WorkPicture
                                classId={classId}
                                id={r.workId}
                                small
                              />
                            ) : (
                              <span className="submission-placeholder">—</span>
                            )}
                          </td>
                          <td>
                            <span className={"submission-status " + r.status}>
                              {statusLabel(r)}
                            </span>
                          </td>
                          <td>
                            {r.submittedAt
                              ? new Date(r.submittedAt).toLocaleString("zh-CN")
                              : "—"}
                          </td>
                          <td>{r.score ?? "—"}</td>
                          <td>
                            {r.workId ? (
                              <button onClick={() => openWork(r)}>
                                {r.status === "reviewed"
                                  ? "查看"
                                  : "查看并评分"}{" "}
                                →
                              </button>
                            ) : (
                              <span className="muted">尚未提交</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!detailBusy && !foundRows.length && (
                  <p className="classroom-empty">没有符合条件的提交记录。</p>
                )}
                <details>
                  <summary>明确补发给新增学生</summary>
                  <p>
                    不会自动改变历史应交人数。确认后才将选定学生加入本次作业。
                  </p>
                  {students
                    .filter(
                      (s) =>
                        !rows.some((r) => r.enrollmentId === s.enrollmentId),
                    )
                    .map((s) => (
                      <button
                        key={s.enrollmentId}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(`确认将本次作业补发给 ${s.name}？`)
                          )
                            void run(() =>
                              json(
                                root +
                                  "publications/" +
                                  selected.id +
                                  "/recipients",
                                { enrollmentIds: [s.enrollmentId] },
                              ),
                            );
                        }}
                      >
                        补发给 {s.name} · {s.studentNumber}
                      </button>
                    ))}
                </details>
                {unlinked.length > 0 && (
                  <details>
                    <summary>确认历史作品关联</summary>
                    {unlinked
                      .filter((w) =>
                        rows.some(
                          (r) => r.enrollmentId === w.owner_enrollment_id,
                        ),
                      )
                      .map((w) => (
                        <p key={w.id}>
                          {w.title}
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `确认将「${w.title}」关联到本次作业？原作品与评分保留。`,
                                )
                              )
                                void run(() =>
                                  json(
                                    root +
                                      "publications/" +
                                      selected.id +
                                      "/link",
                                    { workId: w.id },
                                  ),
                                );
                            }}
                          >
                            确认关联
                          </button>
                        </p>
                      ))}
                  </details>
                )}
              </article>
              {work?.workId && (
                <aside
                  className="classroom-review-drawer"
                  aria-label="作品批改"
                >
                  <header>
                    <h2>作品批改</h2>
                    <button
                      aria-label="关闭批改面板"
                      onClick={() => {
                        if (discard()) {
                          setDirty(false);
                          setWork(undefined);
                        }
                      }}
                    >
                      ×
                    </button>
                  </header>
                  <p>
                    {work.name} · {work.studentNumber}
                  </p>
                  <h3>{activeWork?.title ?? work.title}</h3>
                  <WorkPicture
                    classId={classId}
                    id={work.workId}
                    index={imageIndex}
                  />
                  {(activeWork?.imageCount ?? 1) > 1 && (
                    <div className="row-buttons">
                      {Array.from(
                        { length: activeWork!.imageCount },
                        (_, i) => (
                          <button
                            key={i}
                            aria-pressed={imageIndex === i}
                            onClick={() => setImageIndex(i)}
                          >
                            图片 {i + 1}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      void run(async () => {
                        const response = await classroomRequest(
                          root +
                            `works/${work.workId}/original?index=${imageIndex}`,
                        );
                        download(await response.blob(), "作品原图");
                      })
                    }
                  >
                    查看 / 下载原图 ↗
                  </button>
                  <p>{activeWork?.description || "暂无创作说明。"}</p>
                  <small>
                    提交时间：
                    {work.submittedAt
                      ? new Date(work.submittedAt).toLocaleString("zh-CN")
                      : "未记录"}
                  </small>
                  <CloudWorkReview
                    key={`${work.workId}:${reviewEpoch}`}
                    classId={classId}
                    workId={work.workId}
                    staff
                    withdrawn={false}
                    onPendingChange={setDirty}
                    onSaved={async () => refresh()}
                  />
                  <button
                    className="primary"
                    onClick={() => {
                      const next = rows.find(
                        (r) =>
                          r.status === "pending" && r.workId !== work.workId,
                      );
                      if (next) openWork(next);
                      else setError("没有其他待批改作品。");
                    }}
                  >
                    下一份待批改 →
                  </button>
                  <details>
                    <summary>该学生的历史提交与评分</summary>
                    {gallery?.planets
                      .flatMap((p) => p.works)
                      .filter(
                        (w) =>
                          w.learning?.publicationId === selected.id &&
                          gallery.planets.find((p) =>
                            p.works.some((x) => x.id === w.id),
                          )?.owner_enrollment_id === work.enrollmentId,
                      )
                      .map((w) => (
                        <p key={w.id}>
                          {w.title} ·{" "}
                          {new Date(w.createdAt).toLocaleString("zh-CN")} ·{" "}
                          {w.score == null ? "暂无评分" : `${w.score} 分`}
                          <span>{w.comment}</span>
                        </p>
                      ))}
                  </details>
                </aside>
              )}
            </div>
          )}
        </>
      )}
      {student && (
        <aside className="classroom-student-drawer" aria-label="学生详情">
          <header>
            <h2>{student.name}</h2>
            <button
              aria-label="关闭学生详情"
              onClick={() => setStudent(undefined)}
            >
              ×
            </button>
          </header>
          <p>学号：{student.studentNumber || "未登记"}</p>
          <p>
            {student.loggedIn ? "已登录过" : "尚未登录"} ·{" "}
            {student.activated ? "已激活" : "未激活"}
          </p>
          {student.planetId ? (
            <button
              onClick={() =>
                props.onPlanetAction?.(student.planetId!, "room", classId)
              }
            >
              进入「{student.planetName}」→
            </button>
          ) : (
            <p className="classroom-empty">
              尚未创建星球；该学生仍在班级名单和应交统计中。
            </p>
          )}
          <StudentAssignments
            classId={classId}
            student={student}
            publications={publications}
          />
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `已核实 ${student.name} 的身份，确认将密码重置为 88888888（8个8）？学生登录后须立即修改。`,
                )
              )
                void run(async () => {
                  const r = await json(
                    root +
                      `management/students/${student.enrollmentId}/reset-password`,
                    {},
                  );
                  setResetMessage(
                    `${student.name} 的临时密码：${r.temporaryPassword}。${r.message}`,
                  );
                });
            }}
          >
            教师重置密码
          </button>
        </aside>
      )}
      {draftTask && (
        <div className="classroom-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="确认作业发布对象"
            className="classroom-publish-dialog"
          >
            <h2>确认发布对象</h2>
            <p>
              {catalog.find((t) => t.id === draftTask)?.title ?? "新作业"} ·{" "}
              {memberships.find((m) => m.classId === classId)?.title}
            </p>
            <label>
              截止时间（可留空）
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <button
              onClick={() => setTargets(students.map((s) => s.enrollmentId))}
            >
              选择全班
            </button>
            <button onClick={() => setTargets([])}>取消全选</button>
            <p>本次应交 {targets.length} 人；后续新增成员不会自动加入。</p>
            <div className="publication-targets">
              {students.map((s) => (
                <label key={s.enrollmentId}>
                  <input
                    type="checkbox"
                    checked={targets.includes(s.enrollmentId)}
                    onChange={(e) =>
                      setTargets((v) =>
                        e.target.checked
                          ? [...v, s.enrollmentId]
                          : v.filter((x) => x !== s.enrollmentId),
                      )
                    }
                  />
                  {s.name} · {s.studentNumber}
                </label>
              ))}
            </div>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await json(root + "publications", {
                    requestId: publishRequest,
                    taskId: draftTask,
                    enrollmentIds: targets,
                    dueAt: deadline ? new Date(deadline).toISOString() : null,
                  });
                  setDraftTask(undefined);
                  setSelected(undefined);
                  setTab("assignments");
                })
              }
            >
              确认发布
            </button>
            <button disabled={busy} onClick={() => setDraftTask(undefined)}>
              取消
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
function StudentAssignments({
  classId,
  student,
  publications,
}: {
  classId: string;
  student: RosterStudent;
  publications: Publication[];
}) {
  const [items, setItems] = useState<{ p: Publication; r: SubmissionRow }[]>(
      [],
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setItems([]);
    setError("");
    setLoading(true);
    Promise.all(
      publications.map(async (p) => ({
        p,
        detail: await json(`classes/${classId}/publications/${p.id}`),
      })),
    )
      .then((all) => {
        if (active)
          setItems(
            all.flatMap(({ p, detail }) => {
              const r = z
                .array(SubmissionRowSchema)
                .parse(detail.students)
                .find((r) => r.enrollmentId === student.enrollmentId);
              return r ? [{ p, r }] : [];
            }),
          );
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [student.enrollmentId, classId, publications]);
  return (
    <section>
      <h3>各项作业</h3>
      {loading && <p role="status">正在读取作业状态…</p>}
      {error && <p role="alert">{error}</p>}
      {items.map(({ p, r }) => (
        <article key={p.id}>
          <strong>{p.definition.title}</strong>
          <p>
            {statusLabel(r)} · {r.score == null ? "暂无评分" : r.score + " 分"}
          </p>
          <p>{r.comment || "暂无教师评语。"}</p>
        </article>
      ))}
      {!items.length && !error && !loading && <p>尚无布置给该学生的作业。</p>}
    </section>
  );
}
