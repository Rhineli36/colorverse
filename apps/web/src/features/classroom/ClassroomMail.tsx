import { useEffect, useRef, useState } from "react";
import {
  AssignmentCatalog,
  type AssignmentDefinition,
  type CustomAssignmentDraft,
  type ClassroomNotification,
} from "@colorverse/contracts";
import "./classroom-mail.css";
import { AssignmentBrief } from "./AssignmentBrief";
import { NewAssignmentForm } from "./NewAssignmentForm";
import { InterfaceIcon } from "./InterfaceIcon";
export function AssignmentMail({
  taskId,
  definition,
  onClose,
  onSubmit,
}: {
  taskId: string;
  definition?: AssignmentDefinition;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const task = definition ?? AssignmentCatalog.find((t) => t.id === taskId),
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
      <AssignmentBrief task={task} />
      <footer className="assignment-mail-actions">
        <button onClick={onClose}>返回</button>
        {onSubmit && (
          <button className="primary" onClick={onSubmit}>
            去我的星球提交作业 →
          </button>
        )}
      </footer>
    </dialog>
  );
}
export function AssignmentPublisher({
  onPublish,
  onCreate,
  catalog = AssignmentCatalog,
  disabled = false,
}: {
  onPublish: (taskId: string) => Promise<void>;
  onCreate?: (
    draft: CustomAssignmentDraft,
    image: File | null,
    requestId: string,
  ) => Promise<void>;
  catalog?: AssignmentDefinition[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [taskId, setTaskId] = useState("T01"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const ref = useRef<HTMLDialogElement>(null),
    dirty = useRef(false);
  const [mode, setMode] = useState<"templates" | "new">("templates");
  const close = () => {
    if (busy) return;
    if (
      dirty.current &&
      !window.confirm("新增作业尚未发布，确定放弃这些内容吗？")
    )
      return;
    setOpen(false);
    setMode("templates");
    dirty.current = false;
  };
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  const task = catalog.find((t) => t.id === taskId) ?? catalog[0];
  return (
    <>
      <button
        className="teacher-primary-action teacher-publish-action"
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
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <button
            disabled={busy}
            className="mail-close"
            aria-label="关闭发布作业"
            onClick={close}
          >
            ×
          </button>
          <h2>给班级发布一封创作邀请</h2>
          {onCreate && (
            <nav className="assignment-compose-tabs" aria-label="作业来源">
              <button
                aria-pressed={mode === "templates"}
                disabled={busy}
                onClick={() => {
                  if (
                    dirty.current &&
                    !window.confirm("确定放弃尚未发布的新作业吗？")
                  )
                    return;
                  setMode("templates");
                }}
              >
                现有作业
              </button>
              <button
                aria-pressed={mode === "new"}
                disabled={busy}
                onClick={() => setMode("new")}
              >
                ＋ 新增作业
              </button>
            </nav>
          )}
          {mode === "new" && onCreate ? (
            <NewAssignmentForm
              onDirtyChange={(v) => {
                dirty.current = v;
              }}
              onBack={() => {
                if (
                  !dirty.current ||
                  window.confirm("确定放弃尚未发布的新作业吗？")
                )
                  setMode("templates");
              }}
              onCreate={async (...args) => {
                setBusy(true);
                try {
                  await onCreate(...args);
                  dirty.current = false;
                  setMode("templates");
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <>
              <label>
                准备好的教学任务
                <select
                  aria-label="发布的作业"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  {catalog.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <AssignmentBrief task={task} showTitle />
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
            </>
          )}
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
  const scrollPosition = useRef(0);
  useEffect(() => {
    if (open && ref.current) {
      ref.current.showModal();
      ref.current.scrollTop = scrollPosition.current;
    }
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
        <InterfaceIcon name="bell" /> 消息 {unread > 0 && <b>{unread}</b>}
      </button>
      {open && (
        <dialog
          ref={ref}
          className="classroom-inbox"
          onScroll={(e) => {
            scrollPosition.current = e.currentTarget.scrollTop;
          }}
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
                  {n.kind === "planet-created" && <p>前往星球 →</p>}
                  {n.kind === "submission" && (
                    <p>{n.pending ? "待评价" : "已评价"} · 查看作品 →</p>
                  )}
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
