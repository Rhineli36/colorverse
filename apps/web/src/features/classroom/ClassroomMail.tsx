import { useEffect, useRef, useState } from "react";
import {
  AssignmentCatalog,
  type ClassroomNotification,
} from "@colorverse/contracts";
import "./classroom-mail.css";
export function AssignmentMail({
  taskId,
  onClose,
  onSubmit,
}: {
  taskId: string;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const task = AssignmentCatalog.find((t) => t.id === taskId),
    ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  if (!task) return null;
  return (
    <dialog
      ref={ref}
      className="assignment-mail"
      aria-label="课堂作业邮件"
      onCancel={onClose}
    >
      <button
        className="mail-close"
        aria-label="关闭作业邮件"
        onClick={onClose}
      >
        ×
      </button>
      <p className="eyebrow">CLASSROOM · ASSIGNMENT</p>
      <h2>{task.title}</h2>
      <p>{task.goal}</p>
      <h3>作业要求</h3>
      <ol>
        {task.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p>
        <strong>提交内容：</strong>
        {task.deliverables}
      </p>
      <h3>图像示范</h3>
      <img
        src={`${import.meta.env.BASE_URL}${task.image}`}
        alt="作业图像示范"
      />
      <p>{task.reviewFocus}</p>
      {onSubmit && (
        <button className="primary" onClick={onSubmit}>
          去我的星球提交作业 →
        </button>
      )}
      <button onClick={onClose}>返回</button>
    </dialog>
  );
}
export function AssignmentPublisher({
  onPublish,
  disabled = false,
}: {
  onPublish: (taskId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [taskId, setTaskId] = useState("T01"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  const task = AssignmentCatalog.find((t) => t.id === taskId)!;
  return (
    <>
      <button
        disabled={disabled}
        onClick={() => {
          setStatus("");
          setOpen(true);
        }}
      >
        发布作业
      </button>
      {open && (
        <dialog
          className="assignment-mail"
          ref={ref}
          aria-label="发布课堂作业"
          onCancel={() => !busy && setOpen(false)}
        >
          <button
            disabled={busy}
            className="mail-close"
            aria-label="关闭发布作业"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>给班级发布一封创作邀请</h2>
          <label>
            准备好的教学任务
            <select
              aria-label="发布的作业"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              {AssignmentCatalog.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <h3>{task.title}</h3>
          <p>{task.goal}</p>
          <ol>
            {task.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <img
            src={`${import.meta.env.BASE_URL}${task.image}`}
            alt="作业图像示范"
          />
          <p>{task.deliverables}</p>
          {status && <p role="status">{status}</p>}
          <button disabled={busy} onClick={() => setOpen(false)}>
            取消
          </button>
          <button
            disabled={busy}
            className="primary"
            onClick={() => {
              setBusy(true);
              void onPublish(taskId)
                .then(() => {
                  setOpen(false);
                })
                .catch((e) =>
                  setStatus(
                    e instanceof Error ? e.message : "发布失败，请重试",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "正在发布…" : "一键发布给全班"}
          </button>
        </dialog>
      )}
    </>
  );
}
export function ClassroomInbox({
  disabled = false,
  status,
  onRefresh,
  notifications,
  readIds,
  onRead,
  onAssignment,
  onReaction,
}: {
  disabled?: boolean;
  status?: string;
  onRefresh?: () => void;
  notifications: ClassroomNotification[];
  readIds: string[];
  onRead: (id: string) => void;
  onAssignment: (taskId: string, notification: ClassroomNotification) => void;
  onReaction?: (n: ClassroomNotification) => void;
}) {
  const [open, setOpen] = useState(false),
    ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  const unread = notifications.filter((n) => !readIds.includes(n.id)).length;
  return (
    <>
      <button
        disabled={disabled}
        title={disabled ? "请先完成当前加载或保存、取消编辑" : "查看信息"}
        className="inbox-entry"
        onClick={() => {
          setOpen(true);
          onRefresh?.();
        }}
      >
        信息 {unread > 0 && <b>{unread}</b>}
      </button>
      {open && (
        <dialog
          ref={ref}
          className="classroom-inbox"
          aria-label="我的信息"
          onCancel={() => setOpen(false)}
        >
          <button
            className="mail-close"
            aria-label="关闭信息"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>来自这片宇宙的信息</h2>
          {status && <p role="status">{status}</p>}
          {onRefresh && <button onClick={onRefresh}>重新读取信息</button>}
          {notifications.length === 0 ? (
            <p>还没有新信息。新的作业、点赞和留言会出现在这里。</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className={`inbox-row ${readIds.includes(n.id) ? "read" : ""}`}
                onClick={() => {
                  onRead(n.id);
                  setOpen(false);
                  if (n.kind === "assignment" && n.taskId)
                    onAssignment(n.taskId, n);
                  else onReaction?.(n);
                }}
              >
                <span>
                  {n.kind === "assignment"
                    ? "✉"
                    : n.kind === "like"
                      ? "♡"
                      : "✦"}
                </span>
                <div>
                  <strong>{n.title}</strong>
                  {n.content && <p>{n.content}</p>}
                  <time>
                    {new Date(n.createdAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </time>
                </div>
                {!readIds.includes(n.id) && <i />}
              </button>
            ))
          )}
        </dialog>
      )}
    </>
  );
}
