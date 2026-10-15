import { TaskSettings } from "./LearningPanels";
import { useEffect, useState } from "react";
import {
  ClassroomOverviewSchema,
  type ClassroomOverview,
  type CloudSession,
} from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import "./classroom.css";
import { CloudGallery } from "./CloudGallery";
export { classroomRequest } from "./cloud-request";
export function CloudClassroomView({
  session,
  initialClassId,
  onPendingChange,
}: {
  session: CloudSession | null;
  initialClassId?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const memberships =
    session?.access === "active"
      ? session.memberships.filter(
          (m) => m.role === "teacher" || m.role === "assistant",
        )
      : [];
  const [classId, setClassId] = useState(memberships[0]?.classId ?? ""),
    [data, setData] = useState<ClassroomOverview | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState(""),
    [viewPlanet, setViewPlanet] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("name"),
    [weekly, setWeekly] = useState(true);
  const signature = memberships.map((m) => m.classId).join();
  useEffect(() => {
    setClassId(
      memberships.find((m) => m.classId === initialClassId)?.classId ??
        memberships[0]?.classId ??
        "",
    );
    setData(null);
  }, [signature, initialClassId]); // Revoke cached records when identities or memberships change.
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (!classId) return;
    setLoading(true);
    void classroomRequest(`classes/${classId}/overview`)
      .then((r) => r.json())
      .then((value) => {
        if (active) setData(ClassroomOverviewSchema.parse(value));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, refresh, session?.identity.id]);
  if (!memberships.length)
    return (
      <main className="classroom-main">
        <p className="eyebrow">CLASSROOM · 云端课堂</p>
        <h1>登录教师账户后查看你的班级</h1>
        <p>班级统计由云端核对权限后读取。</p>
      </main>
    );
  if (viewPlanet && session)
    return (
      <CloudGallery
        session={session}
        initialClassId={classId}
        initialPlanetId={viewPlanet}
        onPendingChange={onPendingChange}
        onBack={() => {
          setViewPlanet(null);
          setRefresh((n) => n + 1);
        }}
      />
    );
  const count = (
    s: ClassroomOverview["students"][number],
    key: "showcase" | "sent" | "received",
  ) => s[`${weekly ? "weekly_" : ""}${key}_count`];
  const students = (data?.students ?? []).filter(
    (s) =>
      (!query ||
        `${s.display_name} ${s.planet_name ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter !== "no-planet" || !s.planet_id) &&
      (filter !== "no-work" || count(s, "showcase") === 0) &&
      (filter !== "unreviewed" ||
        s.reviewed_showcase_count < s.showcase_count) &&
      (filter !== "interactions" || count(s, "sent") < 5),
  );
  students.sort((a, b) =>
    sort === "name"
      ? a.display_name.localeCompare(b.display_name, "zh-CN")
      : sort === "works"
        ? count(b, "showcase") - count(a, "showcase")
        : count(b, "sent") - count(a, "sent"),
  );
  const total = (key: "showcase" | "sent" | "received") =>
    (data?.students ?? []).reduce((n, s) => n + count(s, key), 0);
  return (
    <main className="classroom-main">
      <TaskSettings
        key={`${session?.identity.id}:${classId}`}
        classId={classId}
        onTasks={() => {}}
        onPendingChange={onPendingChange ?? (() => {})}
      />
      <header className="classroom-heading">
        <div>
          <p className="eyebrow">CLASSROOM OBSERVATORY · 教师管理</p>
          <h1>看见每一颗星球的成长。</h1>
          <p className="muted">
            {data?.title ?? "正在连接班级"} · 云端真实记录 ·
            本周按班级时区从周一开始
          </p>
        </div>
        <div className="row-buttons">
          <select
            aria-label="管理班级"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.classId} value={m.classId}>
                {m.title}
              </option>
            ))}
          </select>
          <button disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
            {loading ? "刷新中…" : "刷新统计"}
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="classroom-error">
          {error}
        </p>
      )}
      <section className="classroom-metrics" aria-label="班级总览">
        {[
          ["班级学生", data?.students.length ?? 0],
          ["已创建星球", data?.students.filter((s) => s.planet_id).length ?? 0],
          [weekly ? "本周展示作品" : "累计展示作品", total("showcase")],
          [weekly ? "本周发起互动" : "累计发起互动", total("sent")],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <div className="classroom-tools">
        <input
          aria-label="搜索学生或星球"
          placeholder="搜索学生 / 星球名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="筛选学生"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部学生</option>
          <option value="no-planet">尚未创建星球</option>
          <option value="no-work">还没有展示作品</option>
          <option value="unreviewed">有作品等待教师点评</option>
          <option value="interactions">互动不足 5 次</option>
        </select>
        <select
          aria-label="学生排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">按姓名</option>
          <option value="works">提交最多</option>
          <option value="interactions">互动最多</option>
        </select>
        <div className="row-buttons">
          <button aria-pressed={weekly} onClick={() => setWeekly(true)}>
            本周
          </button>
          <button aria-pressed={!weekly} onClick={() => setWeekly(false)}>
            累计
          </button>
        </div>
      </div>
      <section className="classroom-roster" aria-label="学生星球记录">
        <div className="classroom-table-wrap">
          <table>
            <thead>
              <tr>
                <th>学生 / 星球</th>
                <th>展示作品</th>
                <th>发起互动</th>
                <th>收到互动</th>
                <th>教师点评 / 评分</th>
                <th>最近提交</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.enrollment_id}>
                  <td>
                    <div
                      className={`student-orb ${s.planet_id ? "" : "empty"}`}
                      aria-hidden="true"
                    />
                    <strong>{s.display_name}</strong>
                    <small>
                      {s.planet_name ??
                        (s.planet_id ? "未命名星球" : "尚未创建星球")}
                    </small>
                    {s.planet_id && (
                      <button
                        className="classroom-view-planet"
                        onClick={() => setViewPlanet(s.planet_id)}
                      >
                        查看星球与作品 ↗
                      </button>
                    )}
                  </td>
                  <td>
                    <b>{count(s, "showcase")}</b>
                    <small>
                      现有 {s.showcase_count} 件
                      {s.course_submission_count > 0
                        ? ` · 课程提交 ${s.course_submission_count} 次`
                        : ""}
                    </small>
                  </td>
                  <td>
                    <b>{count(s, "sent")}</b>
                    <small>
                      {weekly
                        ? `${Math.min(5, count(s, "sent"))} / 5 次参考目标`
                        : "点赞、表情、留言"}
                    </small>
                  </td>
                  <td>
                    <b>{count(s, "received")}</b>
                  </td>
                  <td>
                    <b>
                      {s.reviewed_showcase_count} / {s.showcase_count}
                    </b>
                    <small>
                      累计已确认点评
                      {s.suggested_review_count
                        ? ` · 演示建议 ${s.suggested_review_count} 件`
                        : ""}
                    </small>
                    <small>
                      {s.average_showcase_score === null
                        ? "尚无教师确认评分"
                        : `已确认作品均分 ${s.average_showcase_score} / 100`}
                    </small>
                  </td>
                  <td>
                    {s.last_submission
                      ? new Date(s.last_submission).toLocaleString("zh-CN", {
                          timeZone: data?.timezone,
                        })
                      : "—"}
                  </td>
                  <td>
                    <span className="classroom-status">
                      {s.account_status !== "active" ||
                      s.enrollment_status !== "active"
                        ? "已停用"
                        : count(s, "showcase") === 0
                          ? "等待展示"
                          : "正在成长"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !students.length && (
          <div className="classroom-empty">
            <span>✧</span>
            <h2>
              {data?.students.length ? "没有符合条件的学生" : "班级还没有学生"}
            </h2>
            <p>
              {data?.students.length
                ? "试着调整搜索和筛选。"
                : "测试账户加入后会出现在这里；提交和互动数直接读取云端记录。"}
            </p>
          </div>
        )}
      </section>
      <p className="classroom-footnote">
        教师点评栏始终显示累计进度；均分仅计算正在展示的作品的最新教师确认评分，演示建议不计入。学生点赞和留言不影响评分。
      </p>
      <p className="classroom-footnote">
        展示与互动统计只计入正在展示的作品及有效互动；撤下作品、撤回互动或移除留言后会减少，恢复作品后对应记录重新计入。原始上传日期决定所属周。课程作业提交单独统计。刷新后核对学生端结果。
      </p>
    </main>
  );
}
