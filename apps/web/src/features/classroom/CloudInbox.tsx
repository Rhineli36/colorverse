import { useState, useEffect, useRef } from "react";
import type {
  CloudSession,
  ClassroomNotification,
} from "@colorverse/contracts";
import { ClassroomInbox, AssignmentMail } from "./ClassroomMail";
import { classroomRequest } from "./cloud-request";
export function CloudInbox({
  session,
  disabled = false,
  onSubmit,
  onReaction,
}: {
  session: CloudSession;
  disabled?: boolean;
  onSubmit: (classId: string, taskId: string) => void;
  onReaction: (classId: string, n: ClassroomNotification) => void;
}) {
  const [items, setItems] = useState<
      (ClassroomNotification & { classId: string })[]
    >([]),
    [read, setRead] = useState<string[]>([]),
    [task, setTask] = useState<{ classId: string; taskId: string }>();
  const key = `colorverse.inbox.read.${session.identity.id}`;
  const [status, setStatus] = useState("");
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      setRead(
        Array.isArray(value)
          ? value.filter((v) => typeof v === "string").slice(-500)
          : [],
      );
    } catch {
      setRead([]);
    }
  }, [key]);
  const signature =
    session.access === "active"
      ? session.memberships.map((m) => m.classId).join("|")
      : "";
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.hidden) return;
      setStatus("正在读取信息…");
      void Promise.all(
        signature
          .split("|")
          .filter(Boolean)
          .map(async (classId) => {
            const r = await classroomRequest(
              `classes/${classId}/notifications`,
            );
            const value = await r.json();
            return value.notifications.map((n: ClassroomNotification) => ({
              ...n,
              classId,
            }));
          }),
      )
        .then((v) => {
          if (active)
            setItems(
              v.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            );
          if (active) setStatus("");
        })
        .catch(() => {
          if (active) setStatus("信息暂时未能读取，请重新读取。");
        });
    };
    refreshRef.current = refresh;
    setItems([]);
    refresh();
    const timer = setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      refreshRef.current = () => {};
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [signature, session.identity.id]);
  return (
    <>
      <ClassroomInbox
        disabled={disabled}
        status={status}
        onRefresh={() => refreshRef.current()}
        notifications={items}
        readIds={read}
        onRead={(id) => {
          const next = [...new Set([...read, id])].slice(-500);
          setRead(next);
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {}
        }}
        onAssignment={(taskId, notification) => {
          const item = items.find((n) => n.id === notification.id);
          if (item) setTask({ classId: item.classId, taskId });
        }}
        onReaction={(n) => {
          const item = items.find((i) => i.id === n.id);
          if (item) onReaction(item.classId, n);
        }}
      />
      {task && (
        <AssignmentMail
          taskId={task.taskId}
          onClose={() => setTask(undefined)}
          onSubmit={
            session.access === "active" &&
            session.memberships.some(
              (m) => m.classId === task.classId && m.role === "student",
            )
              ? () => {
                  onSubmit(task.classId, task.taskId);
                  setTask(undefined);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
