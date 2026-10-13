import { useEffect, useRef, useState } from "react";
import { CloudGuideSteps, type CloudGuideStepId } from "@colorverse/contracts";

export function CloudStudentGuide({
  completed,
  hasPeers,
  busy,
  onAction,
  error,
  onRetry,
  storageKey,
  openRequest,
}: {
  completed: CloudGuideStepId[];
  hasPeers: boolean;
  busy: boolean;
  onAction: (id: CloudGuideStepId) => void;
  error: boolean;
  onRetry: () => void;
  storageKey: string;
  openRequest: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== "closed";
    } catch {
      return true;
    }
  });
  const lastRequest = useRef(openRequest);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (lastRequest.current === openRequest) return;
    lastRequest.current = openRequest;
    setOpen(true);
    requestAnimationFrame(() =>
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [openRequest]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "open" : "closed");
    } catch {
      /* Browsing remains available when local storage is unavailable. */
    }
  }, [open, storageKey]);
  const next = CloudGuideSteps.find((s) => !completed.includes(s.id));
  const locked = (id: CloudGuideStepId) =>
    ((id === "visit" || id === "reaction" || id === "comment") && !hasPeers) ||
    (id === "element" && !completed.includes("work"));
  return (
    <section
      ref={panel}
      className={`cloud-student-guide ${open ? "" : "collapsed"}`}
      aria-label="我的星球任务"
    >
      <div className="cloud-guide-toolbar">
        <strong>
          功能探索 · {completed.length} / {CloudGuideSteps.length}
        </strong>
        <button aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "关闭任务引导" : "打开任务引导"}
        </button>
      </div>
      {!open && <p className="muted">随时自由创作，进度会自动记录。</p>}
      {open && (
        <div className="cloud-guide-body">
          <div className="cloud-guide-heading">
            <div>
              <p className="eyebrow">YOUR FIRST VOYAGE</p>
              <h2>{next ? "一步一步，熟悉你的宇宙" : "初次航行完成 ✦"}</h2>
              <p className="muted">
                {next
                  ? "任务可以任意顺序体验，也可以随时关闭。自由编辑星球不需要先完成任务。"
                  : "你已经体验了主要功能。继续创作，也继续给同学有用的反馈。"}
              </p>
            </div>
            <strong>
              {completed.length} / {CloudGuideSteps.length}
            </strong>
          </div>
          <progress
            aria-label="新手任务进度"
            value={completed.length}
            max={CloudGuideSteps.length}
          />
          {error ? (
            <p role="status">
              任务进度读取失败。
              <button disabled={busy} onClick={onRetry}>
                重新读取进度
              </button>
            </p>
          ) : (
            next && (
              <div className="cloud-guide-next">
                <div>
                  <small>推荐尝试 · {next.group}</small>
                  <h3>{next.title}</h3>
                  <p>{next.detail}</p>
                </div>
                <button
                  className="primary"
                  disabled={busy || locked(next.id)}
                  onClick={() => onAction(next.id)}
                >
                  {locked(next.id)
                    ? next.id === "element"
                      ? "先上传一件作品"
                      : "等待同学加入"
                    : next.action + " →"}
                </button>
              </div>
            )
          )}
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起任务列表" : "查看全部任务"}
          </button>
          {expanded && (
            <ol className="cloud-guide-list">
              {CloudGuideSteps.map((s, index) => (
                <li
                  key={s.id}
                  className={completed.includes(s.id) ? "completed" : ""}
                >
                  <span className="cloud-guide-number">
                    {completed.includes(s.id)
                      ? "✓"
                      : String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <small>{s.group}</small>
                    <strong>{s.title}</strong>
                    <p>{s.detail}</p>
                  </div>
                  <button
                    disabled={busy || locked(s.id)}
                    onClick={() => onAction(s.id)}
                  >
                    {completed.includes(s.id)
                      ? "再看看"
                      : locked(s.id)
                        ? s.id === "element"
                          ? "上传后可编辑"
                          : "等待同学加入"
                        : s.action}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <small className="muted">
            完成进度按云端保存的设计、作品和互动自动更新。这是功能引导，不是课程成绩或每周任务统计。
          </small>
        </div>
      )}
      {!open && (
        <progress
          aria-label="新手任务进度"
          value={completed.length}
          max={CloudGuideSteps.length}
        />
      )}
    </section>
  );
}

export function CloudAtmosphere({
  kind,
}: {
  kind: "none" | "stardust" | "fireflies";
}) {
  if (kind === "none") return null;
  return (
    <div className={`cloud-atmosphere ${kind}`} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37 + 11) % 98}%`,
            top: `${(i * 23 + 7) % 94}%`,
            animationDelay: `${-i * 0.41}s`,
            animationDuration: `${kind === "fireflies" ? 3 + (i % 4) : 5 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}
