import { useState } from "react";
import { CloudGuideSteps, type CloudGuideStepId } from "@colorverse/contracts";

export function CloudStudentGuide({
  completed,
  hasPeers,
  busy,
  onAction,
  error,
  onRetry,
}: {
  completed: CloudGuideStepId[];
  hasPeers: boolean;
  busy: boolean;
  onAction: (id: CloudGuideStepId) => void;
  error: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const next = CloudGuideSteps.find((s) => !completed.includes(s.id));
  const locked = (id: CloudGuideStepId) =>
    ((id === "visit" || id === "reaction" || id === "comment") && !hasPeers) ||
    (id === "element" && !completed.includes("work"));
  return (
    <section className="cloud-student-guide" aria-label="我的星球任务">
      <div className="cloud-guide-heading">
        <div>
          <p className="eyebrow">YOUR FIRST VOYAGE</p>
          <h2>{next ? "一步一步，熟悉你的宇宙" : "初次航行完成 ✦"}</h2>
          <p className="muted">
            {next
              ? "从设计星球到分享作品，完成一次功能探索。可以按自己的顺序进行。"
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
              <small>下一步 · {next.group}</small>
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
                  : "同学加入后解锁"
                : next.action + " →"}
            </button>
          </div>
        )
      )}
      <button aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
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
                      ? "上传后解锁"
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
            animationDuration: `${4 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}
