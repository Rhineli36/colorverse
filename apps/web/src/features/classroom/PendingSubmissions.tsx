import type { ClassroomNotification } from "@colorverse/contracts";
export function PendingSubmissions({
  items,
  readIds,
  onOpen,
}: {
  items: ClassroomNotification[];
  readIds: string[];
  onOpen: (n: ClassroomNotification) => void;
}) {
  const pending = items.filter((n) => n.kind === "submission" && n.pending);
  return (
    <section className="pending-submissions" aria-label="待评价作业">
      <h2>
        待评价 <small>{pending.length}</small>
      </h2>
      {pending.length ? (
        <ul>
          {pending.map((n) => (
            <li key={n.id}>
              <button onClick={() => onOpen(n)}>
                <strong>{n.title}</strong>
                <span>{readIds.includes(n.id) ? "已读" : "未读"} · 待评价</span>
                <time dateTime={n.createdAt}>
                  {new Date(n.createdAt).toLocaleString("zh-CN")}
                </time>
                <span>查看作品 →</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂时没有待评价作业。学生提交成功后会显示在这里。</p>
      )}
    </section>
  );
}
