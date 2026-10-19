import { useState, type ReactNode } from "react";
export type TeacherPlanetRow = {
  id: string;
  name: string;
  author: string;
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
}: {
  rows: TeacherPlanetRow[];
  publisher: ReactNode;
  busy: boolean;
  tools?: ReactNode;
  onEnter: (id: string) => void;
  onEdit: (id: string) => void;
  onVisibility: (id: string, visible: boolean) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("name");
  const [error, setError] = useState("");
  const selected = rows.filter(
    (r) =>
      `${r.name} ${r.author}`.includes(query.trim()) &&
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
  return (
    <section className="experience-teacher" aria-label="教师管理">
      <header>
        <h1>班级的色彩轨迹</h1>
        <div className="row-buttons teacher-toolbar">
          {tools}
          {publisher}
        </div>
      </header>
      <section className="classroom-metrics" aria-label="班级总览">
        {[
          ["班级学生", rows.length],
          ["已创建星球", rows.filter((r) => r.hasPlanet).length],
          ["展示作品", rows.reduce((n, r) => n + r.works, 0)],
          ["同学互动", rows.reduce((n, r) => n + r.received, 0)],
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
      {error && <p role="alert">{error}</p>}
      <div className="classroom-table-wrap">
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
                  {r.name}
                  <small className="teacher-name">{r.author}</small>
                </td>
                <td>{r.works}</td>
                <td>{r.received}</td>
                <td>
                  {r.reviewed} / {r.works}
                </td>
                <td>
                  {!r.hasPlanet
                    ? "尚未创建"
                    : `${r.visible ? "可见" : "隐藏"} · ${r.stationary ? "静止" : "运行中"}`}
                </td>
                <td>
                  <button
                    disabled={busy || !r.hasPlanet}
                    onClick={() => onEnter(r.id)}
                  >
                    进入星球
                  </button>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!selected.length && (
        <p>{busy ? "正在读取班级…" : "没有符合条件的学生。"}</p>
      )}
    </section>
  );
}
