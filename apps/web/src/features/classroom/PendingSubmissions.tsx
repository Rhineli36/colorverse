import type { ClassroomNotification } from "@colorverse/contracts";
import { InterfaceIcon } from "./InterfaceIcon";
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
  if (!pending.length)
    return (
      <section
        className="pending-submissions pending-empty"
        aria-label="待评价作业"
      >
        <InterfaceIcon name="check" />
        <p>
          暂无待评价作业 <span>· 新提交会显示在这里</span>
        </p>
        <span className="pending-total">
          待评价 <b>0</b>
        </span>
      </section>
    );
  return (
    <details
      className="pending-submissions pending-active"
      aria-label="待评价作业"
      open
    >
      <summary>
        待评价 <b>{pending.length}</b>
        <span>查看新提交并评价 →</span>
      </summary>
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
    </details>
  );
}
