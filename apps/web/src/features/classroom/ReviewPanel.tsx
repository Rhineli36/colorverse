export function ReviewPanel({
  record,
  staff,
  score,
  comment,
  onScore,
  onComment,
  onSave,
  onReset,
  busy = false,
  loading = false,
  dirty = false,
  withdrawn = false,
  error = "",
  notice = "",
  onRetry,
  allowUnchanged = false,
}: {
  record: {
    score?: number | null;
    comment: string;
    author?: string;
    date?: string;
  } | null;
  staff: boolean;
  score: string;
  comment: string;
  onScore?: (score: string) => void;
  onComment?: (comment: string) => void;
  onSave?: () => void;
  onReset?: () => void;
  busy?: boolean;
  loading?: boolean;
  dirty?: boolean;
  withdrawn?: boolean;
  error?: string;
  notice?: string;
  onRetry?: () => void;
  allowUnchanged?: boolean;
}) {
  const valid =
    (score.trim() === "" ||
      (Number.isFinite(Number(score)) &&
        Number(score) >= 0 &&
        Number(score) <= 100)) &&
    (score.trim() !== "" || comment.trim().length > 0) &&
    comment.trim().length <= 2000;
  return (
    <section className="cloud-work-review" aria-label="教师点评与评分">
      <div className="cloud-review-heading">
        <h3>教师点评与评分</h3>
      </div>
      {loading && <p role="status">正在读取点评…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          {onRetry && (
            <button disabled={busy || loading} onClick={onRetry}>
              读取最新点评{dirty ? "（保留草稿）" : ""}
            </button>
          )}
        </div>
      )}
      {record && (
        <div className="cloud-review-record">
          {record.score !== undefined && record.score !== null && (
            <strong className="cloud-review-score">
              {record.score}
              <small> / 100</small>
            </strong>
          )}
          <p>{record.comment || "暂无文字点评"}</p>
          {record.author && (
            <small>
              {record.author}
              {record.date
                ? ` · ${new Date(record.date).toLocaleString("zh-CN")}`
                : ""}
            </small>
          )}
        </div>
      )}
      {!record && !loading && !error && (
        <p className="muted">这件作品还没有教师点评。</p>
      )}
      {staff && !loading && (
        <div className="cloud-review-form">
          <label>
            教师评分（100 分制，可留空）
            <input
              aria-label="教师评分"
              type="number"
              min="0"
              max="100"
              step="any"
              value={score}
              disabled={busy || withdrawn}
              onChange={(e) => onScore?.(e.target.value)}
            />
          </label>
          <label>
            教师点评
            <textarea
              aria-label="教师点评"
              rows={4}
              maxLength={2000}
              placeholder="肯定作品亮点，并给出可尝试的修改方向…"
              value={comment}
              disabled={busy || withdrawn}
              onChange={(e) => onComment?.(e.target.value)}
            />
          </label>
          {withdrawn && <p>作品已撤下，恢复展示后可以保存点评。</p>}
          <div className="row-buttons">
            <button
              className="primary"
              disabled={
                busy || withdrawn || !valid || (!dirty && !allowUnchanged)
              }
              onClick={onSave}
            >
              {busy ? "保存中…" : "保存点评与评分"}
            </button>
            <button disabled={busy || !dirty} onClick={onReset}>
              放弃点评草稿
            </button>
          </div>
          {dirty && (
            <p className="muted">点评尚未保存。保存或放弃草稿后可关闭作品。</p>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
