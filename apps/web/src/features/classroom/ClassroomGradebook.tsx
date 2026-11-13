import { useEffect, useState } from "react";
import { z } from "zod";
import { classroomRequest } from "./cloud-request";
import "./gradebook.css";

const Gradebook = z.object({
  assignments: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      targetLabel: z.string(),
      publishedAt: z.string(),
    }),
  ),
  students: z.array(
    z.object({
      enrollmentId: z.uuid(),
      name: z.string(),
      studentNumber: z.string(),
      freeSubmissions: z.number().int().nonnegative(),
      grades: z.record(
        z.string(),
        z.object({
          score: z.number().nullable(),
          workId: z.string().nullable(),
          status: z.enum([
            "not-assigned",
            "missing",
            "pending",
            "commented",
            "graded",
          ]),
          updated: z.boolean(),
        }),
      ),
    }),
  ),
});
export function ClassroomGradebook({
  classId,
  revision,
}: {
  classId: string;
  revision: number;
}) {
  const [data, setData] = useState<z.infer<typeof Gradebook>>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0),
    [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void classroomRequest(`classes/${classId}/management/gradebook`)
      .then((r) => r.json())
      .then((v) => {
        if (active) setData(Gradebook.parse(v));
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "成绩暂时无法读取");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, revision, attempt]);
  const rows =
    data?.students.filter((s) =>
      (s.name + " " + s.studentNumber)
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    ) ?? [];
  return (
    <section className="classroom-board gradebook" aria-label="班级成绩汇总">
      <div className="gradebook-heading">
        <div>
          <h2>成绩管理</h2>
          <p>每位学生一行，每份已发布作业一列。</p>
        </div>
        <div className="gradebook-tools">
          <input
            aria-label="搜索成绩名单"
            placeholder="搜索姓名或学号"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button disabled={loading} onClick={() => setAttempt((n) => n + 1)}>
            {loading ? "正在读取…" : "刷新成绩"}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>重新读取成绩</button>
        </div>
      )}
      {loading && <p role="status">正在读取班级成绩…</p>}
      {data && (
        <>
          <p className="gradebook-summary">
            班级人数 {data.students.length} · 已发布作业{" "}
            {data.assignments.length} 项
          </p>
          <p className="gradebook-note">
            分数包含实际的 0
            分；未提交、待评分、已有评语和未布置分别标记。自由提交仅统计未撤回且未关联课程任务的作品。
          </p>
          {!data.assignments.length && (
            <p>暂未发布作业。发布后会自动增加对应的成绩列。</p>
          )}
          <div
            className="gradebook-scroll"
            tabIndex={0}
            role="region"
            aria-label="成绩表，可横向滚动"
          >
            <table
              aria-label="学生作业成绩汇总表"
              style={{ width: 355 + 210 * data.assignments.length }}
            >
              <thead>
                <tr>
                  <th scope="col" className="gradebook-number">
                    学号
                  </th>
                  <th scope="col" className="gradebook-name">
                    姓名
                  </th>
                  {data.assignments.map((a, i) => (
                    <th
                      scope="col"
                      key={a.id}
                      className="gradebook-assignment"
                      title={a.title + " · " + a.targetLabel}
                    >
                      <small>作业 {String(i + 1).padStart(2, "0")}</small>
                      <span>{a.title}</span>
                    </th>
                  ))}
                  <th scope="col" className="gradebook-free">
                    自由提交次数
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.enrollmentId}>
                    <td className="gradebook-number">
                      {s.studentNumber || "未登记"}
                    </td>
                    <th scope="row" className="gradebook-name">
                      {s.name}
                    </th>
                    {data.assignments.map((a) => {
                      const g = s.grades[a.id];
                      const status = g?.status ?? "not-assigned";
                      return (
                        <td
                          key={a.id}
                          data-assignment-id={a.id}
                          className={"gradebook-cell " + status}
                        >
                          {status === "graded" ? (
                            <strong>{g.score}</strong>
                          ) : (
                            <span>
                              {status === "not-assigned"
                                ? "未布置"
                                : status === "missing"
                                  ? "未提交"
                                  : status === "commented"
                                    ? "已有评语 · 待评分"
                                    : g?.updated
                                      ? "待复核"
                                      : "待评分"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="gradebook-free">
                      <strong>{s.freeSubmissions}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="classroom-empty">
              {data.students.length
                ? "没有符合搜索条件的学生。"
                : "本班暂无学生，导入名单后将在这里显示。"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
