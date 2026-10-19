import { useState, type ReactNode } from "react";
import { DisclosureMenu } from "./DisclosureMenu";
import { InterfaceIcon } from "./InterfaceIcon";
import "./teacher-studio.css";
export type TeacherPlanetRow = {
  id: string;
  name: string;
  author: string;
  thumbnail?: ReactNode;
  works: number;
  sent: number;
  received: number;
  reviewed: number;
  visible: boolean;
  stationary: boolean;
  hasPlanet: boolean;
};
export function TeacherDashboard({
  rows,
  publisher,
  busy,
  onEnter,
  onEdit,
  onVisibility,
  tools,
  pending,
}: {
  rows: TeacherPlanetRow[];
  publisher: ReactNode;
  busy: boolean;
  tools?: ReactNode;
  pending?: ReactNode;
  onEnter: (id: string) => void;
  onEdit: (id: string) => void;
  onVisibility: (id: string, visible: boolean) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("name"),
    [error, setError] = useState("");
  const selected = rows.filter(
    (r) =>
      `${r.name} ${r.author}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (filter !== "no-planet" || !r.hasPlanet) &&
      (filter !== "no-work" || r.works === 0) &&
      (filter !== "unreviewed" || r.reviewed < r.works),
  );
  selected.sort((a, b) =>
    sort === "works"
      ? b.works - a.works
      : sort === "interactions"
        ? b.received - a.received
        : a.author.localeCompare(b.author, "zh-CN"),
  );
  const metrics = [
    { label: "班级学生", value: rows.length, icon: "people" as const },
    {
      label: "已创建星球",
      value: rows.filter((r) => r.hasPlanet).length,
      icon: "planet" as const,
    },
    {
      label: "展示作品",
      value: rows.reduce((n, r) => n + r.works, 0),
      icon: "picture" as const,
    },
    {
      label: "同学互动",
      value: rows.reduce((n, r) => n + r.received, 0),
      icon: "message" as const,
    },
  ];
  return (
    <section className="experience-teacher" aria-label="教师管理">
      <header>
        <div className="teacher-heading">
          <p className="teacher-eyebrow">TEACHER STUDIO</p>
          <h1>班级的色彩轨迹</h1>
          <p className="teacher-description">
            查看学生的创作，回应每一次色彩探索。
          </p>
        </div>
        <div className="row-buttons teacher-toolbar">
          {tools}
          {publisher}
        </div>
      </header>
      {pending}
      <section className="classroom-metrics" aria-label="班级总览">
        {metrics.map((m) => (
          <article key={m.label}>
            <InterfaceIcon name={m.icon} />
            <div>
              <span>{m.label}</span>
              <strong>{busy ? "—" : m.value}</strong>
            </div>
          </article>
        ))}
      </section>
      <section className="teacher-student-list" aria-label="学生与星球">
        <header className="teacher-list-heading">
          <h2>学生与星球</h2>
          <div className="classroom-tools">
            <input
              aria-label="搜索学生或星球"
              placeholder="搜索姓名、学号或星球名称"
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
            </select>
            <select
              aria-label="学生排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">按姓名</option>
              <option value="works">作品最多</option>
              <option value="interactions">互动最多</option>
            </select>
          </div>
        </header>
        {error && <p role="alert">{error}</p>}
        <div
          className="classroom-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="学生星球列表，可横向滚动"
        >
          <table>
            <thead>
              <tr>
                <th>星球 / 同学</th>
                <th>作品</th>
                <th>收到回应</th>
                <th>教师点评</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="teacher-student-cell">
                      <div className="teacher-thumbnail">
                        {r.thumbnail ?? <InterfaceIcon name="planet" />}
                      </div>
                      <div>
                        <strong className="teacher-planet-name">
                          {r.name}
                        </strong>
                        <small className="teacher-name">{r.author}</small>
                      </div>
                    </div>
                  </td>
                  <td>{r.works}</td>
                  <td>{r.received}</td>
                  <td>
                    <div className="teacher-review-progress">
                      <span>
                        {r.reviewed} / {r.works}
                      </span>
                      {r.works > 0 && (
                        <progress
                          aria-label={`${r.name}教师点评进度`}
                          max={r.works}
                          value={r.reviewed}
                        />
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`teacher-status ${r.hasPlanet && r.visible ? "is-visible" : ""}`}
                    >
                      <i aria-hidden="true" />
                      {!r.hasPlanet
                        ? "尚未创建"
                        : `${r.visible ? "可见" : "隐藏"} · ${r.stationary ? "静止" : "运行中"}`}
                    </span>
                  </td>
                  <td>
                    <div className="teacher-row-actions">
                      <button
                        disabled={busy || !r.hasPlanet}
                        onClick={() => onEnter(r.id)}
                      >
                        进入星球 <InterfaceIcon name="arrow" />
                      </button>
                      <DisclosureMenu
                        label={`${r.name}更多操作`}
                        disabled={busy || !r.hasPlanet}
                      >
                        <button
                          disabled={busy || !r.hasPlanet}
                          onClick={() => onEdit(r.id)}
                        >
                          修改星球
                        </button>
                        <button
                          disabled={busy || !r.hasPlanet}
                          onClick={async () => {
                            setError("");
                            try {
                              await onVisibility(r.id, !r.visible);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "可见性保存失败，请重试。",
                              );
                            }
                          }}
                        >
                          {r.visible ? "隐藏" : "显示"}
                        </button>
                      </DisclosureMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!selected.length && (
          <p className="teacher-empty" role="status">
            {busy ? "正在读取班级…" : "没有符合条件的学生。"}
          </p>
        )}
        <p className="teacher-list-count">
          {query.trim() || filter !== "all"
            ? `显示 ${selected.length} / ${rows.length} 位学生`
            : `共 ${rows.length} 位学生`}
        </p>
      </section>
    </section>
  );
}
