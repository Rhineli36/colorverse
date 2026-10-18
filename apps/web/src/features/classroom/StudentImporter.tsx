import { useEffect, useRef, useState } from "react";
import type { RosterPreviewRow, RosterResult } from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import "./student-import.css";

export function StudentImporter({
  offline = false,
  classes = [],
  initialClassId = "",
  actorId = "",
  disabled = false,
  onChanged,
}: {
  offline?: boolean;
  classes?: { classId: string; title: string }[];
  initialClassId?: string;
  actorId?: string;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [target, setTarget] = useState(initialClassId),
    [rows, setRows] = useState<RosterPreviewRow[]>([]),
    [results, setResults] = useState<RosterResult[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState<{
      id: string;
      total: number;
      completed: number;
    }>();
  const dialog = useRef<HTMLDialogElement>(null),
    attempt = useRef(crypto.randomUUID());
  const key = `colorverse.import.${actorId}.${target}`;
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    if (!open && target !== initialClassId) {
      setTarget(initialClassId);
      setJob(undefined);
      setRows([]);
      setResults([]);
      setMessage("");
      setError("");
    }
  }, [initialClassId, open]);
  const resume = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      let value = await (
        await classroomRequest(`classes/${target}/student-imports/${id}`)
      ).json();
      setJob(value);
      setResults(value.results);
      while (value.completed < value.total) {
        value = await (
          await classroomRequest(
            `classes/${target}/student-imports/${id}/process`,
            { method: "POST" },
          )
        ).json();
        setJob(value);
        setResults(value.results);
      }
      setMessage("处理完成，请下载账号清单。已有账号的密码未更改。");
      // Retain only the batch ID so the same teacher can recover the download after a refresh.
      sessionStorage.setItem(key, id);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入中断，可继续处理");
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy) setOpen(false);
  };
  return (
    <>
      <button
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          if (!offline) {
            const saved = sessionStorage.getItem(key);
            if (saved && !job) setJob({ id: saved, total: 0, completed: 0 });
          }
        }}
      >
        导入学生
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="student-import-dialog"
          aria-label="导入学生"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <button
            className="modal-close"
            aria-label="关闭导入学生"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
          <h2>导入学生</h2>
          {offline ? (
            <>
              <p>
                课堂版支持导入 Excel
                点名册，批量开通学生账号。本离线体验版使用预置身份，账号导入请在云端版操作。
              </p>
              <button className="primary" onClick={close}>
                知道了
              </button>
            </>
          ) : (
            <>
              <p>
                选择班级，上传点名册并核对后生成账号。已有学生保留原密码、星球和作业。
              </p>
              <label>
                所属班级
                <select
                  value={target}
                  disabled={busy || Boolean(job)}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setRows([]);
                    setResults([]);
                    setMessage("");
                    setError("");
                  }}
                >
                  {classes.map((c) => (
                    <option value={c.classId} key={c.classId}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-buttons">
                <button
                  disabled={busy}
                  onClick={() =>
                    void import("./roster-excel")
                      .then((m) => m.downloadRoster())
                      .catch((e) => setError(e.message))
                  }
                >
                  下载 Excel 模板
                </button>
                <label className="roster-upload">
                  上传 Excel
                  <input
                    type="file"
                    accept=".xlsx"
                    disabled={busy || Boolean(job)}
                    aria-label="上传 Excel 点名册"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setBusy(true);
                      setRows([]);
                      setResults([]);
                      setMessage("");
                      setError("");
                      attempt.current = crypto.randomUUID();
                      try {
                        const { readRoster } = await import("./roster-excel"),
                          read = await readRoster(file);
                        const preview = await (
                          await classroomRequest(
                            `classes/${target}/student-imports/preview`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ rows: read.rows }),
                            },
                          )
                        ).json();
                        setRows(preview.rows);
                        setMessage(
                          `工作表「${read.sheet}」，第 ${read.headerRow} 行表头，共 ${preview.rows.length} 名学生。`,
                        );
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "读取失败");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
              </div>
              <p className="muted">
                仅需“学号、姓名”两列，学号按文本填写。首版支持 .xlsx，每次最多
                500 人。首次激活后由学生设置自己的密码。
              </p>
              {message && <p role="status">{message}</p>}
              {error && <p role="alert">{error}</p>}
              {rows.length > 0 && !job && (
                <>
                  <div className="roster-table">
                    <table>
                      <thead>
                        <tr>
                          <th>原表行</th>
                          <th>学号</th>
                          <th>姓名</th>
                          <th>预览结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr
                            key={i}
                            className={
                              r.status === "invalid" ? "roster-invalid" : ""
                            }
                          >
                            <td>{r.row}</td>
                            <td>{r.studentNumber || "（空）"}</td>
                            <td>{r.name || "（空）"}</td>
                            <td>{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.some((r) => r.status === "invalid") ? (
                    <p role="alert">
                      请修正 Excel 中标出的问题后重新上传，当前未创建任何账号。
                    </p>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const value = await (
                            await classroomRequest(
                              `classes/${target}/student-imports`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  requestId: attempt.current,
                                  rows: rows.map((r) => ({
                                    row: r.row,
                                    studentNumber: r.studentNumber,
                                    name: r.name,
                                  })),
                                }),
                              },
                            )
                          ).json();
                          sessionStorage.setItem(key, value.id);
                          setJob(value);
                          await resume(value.id);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "导入失败");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      确认生成 {rows.length} 名学生账号
                    </button>
                  )}
                </>
              )}
              {job && (
                <div>
                  <p role="status">
                    {busy ? "正在处理" : "已处理"} {job.completed} /{" "}
                    {job.total || "…"}。
                    {job.completed < job.total
                      ? "请保留此窗口，网络中断后可继续。"
                      : ""}
                  </p>
                  {!busy && job.completed < job.total && (
                    <button onClick={() => void resume(job.id)}>
                      继续处理
                    </button>
                  )}
                  {!busy && job.total === 0 && (
                    <button onClick={() => void resume(job.id)}>
                      恢复上次导入
                    </button>
                  )}
                  {results.length > 0 && (
                    <>
                      <p>
                        新建 {results.filter((r) => r.result === "新建").length}{" "}
                        · 已有{" "}
                        {results.filter((r) => r.result === "已有").length} ·
                        失败 {results.filter((r) => r.result === "失败").length}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void import("./roster-excel")
                            .then((m) => m.downloadRoster(results))
                            .catch((e) => setError(e.message))
                        }
                      >
                        下载账号清单
                      </button>
                    </>
                  )}
                  {!busy && job.completed === job.total && job.total > 0 && (
                    <button
                      onClick={() => {
                        sessionStorage.removeItem(key);
                        setJob(undefined);
                        setRows([]);
                        setResults([]);
                        setMessage("");
                        attempt.current = crypto.randomUUID();
                      }}
                    >
                      导入另一份名单
                    </button>
                  )}
                </div>
              )}
              {!job && busy && <p role="status">正在读取名单…</p>}
            </>
          )}
        </dialog>
      )}
    </>
  );
}
