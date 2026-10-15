import { useCallback, useEffect, useRef, useState } from "react";
import { ShowcaseReviewResponse } from "@colorverse/contracts";
import type { z } from "zod";
import { classroomRequest } from "./cloud-request";

type Review = z.infer<typeof ShowcaseReviewResponse>["review"];
export function CloudWorkReview({
  classId,
  workId,
  staff,
  withdrawn,
  onPendingChange,
}: {
  classId: string;
  workId: string;
  staff: boolean;
  withdrawn: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const [review, setReview] = useState<Review>(null),
    [score, setScore] = useState(""),
    [comment, setComment] = useState(""),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reload, setReload] = useState(0);
  const preserveDraft = useRef(false),
    attempt = useRef<{ payload: string; id: string } | null>(null);
  const dirty =
    ready &&
    (score !== (review?.score == null ? "" : String(review.score)) ||
      comment !== (review?.comment ?? ""));
  const valid =
    (score === "" ||
      (Number.isFinite(Number(score)) &&
        Number(score) >= 0 &&
        Number(score) <= 100)) &&
    (score !== "" || Boolean(comment.trim()));
  useEffect(() => {
    onPendingChange(staff && (dirty || saving));
  }, [staff, dirty, saving, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const reset = useCallback((value: Review) => {
    setScore(value?.score == null ? "" : String(value.score));
    setComment(value?.comment ?? "");
    attempt.current = null;
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void classroomRequest(`classes/${classId}/works/${workId}/review`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const value = ShowcaseReviewResponse.parse(data).review;
        setReview(value);
        setReady(true);
        if (!preserveDraft.current) reset(value);
        preserveDraft.current = false;
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, workId, reload, reset]);
  const save = async () => {
    if (!ready || loading || saving || !valid || withdrawn) return;
    setSaving(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify({
      score: score === "" ? null : Number(score),
      comment: comment.trim(),
      revision: review?.revision ?? 0,
    });
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, id: crypto.randomUUID() };
    try {
      const response = await classroomRequest(
        `classes/${classId}/works/${workId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...JSON.parse(payload),
            requestId: attempt.current.id,
          }),
        },
      );
      const value = ShowcaseReviewResponse.parse(await response.json()).review;
      setReview(value);
      reset(value);
      setNotice("教师点评与评分已保存，学生可以查看。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，草稿已保留");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="cloud-work-review" aria-label="教师点评与评分">
      <div className="cloud-review-heading">
        <h3>教师点评与评分</h3>
        <span>
          {review?.source === "demo"
            ? "演示建议 · 待教师确认"
            : review
              ? "教师已确认"
              : "等待教师点评"}
        </span>
      </div>
      {loading && <p role="status">正在读取点评…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            disabled={loading || saving}
            onClick={() => {
              preserveDraft.current = ready;
              setReload((n) => n + 1);
            }}
          >
            读取最新点评{ready ? "（保留草稿）" : ""}
          </button>
        </div>
      )}
      {ready && review && (
        <div className="cloud-review-record">
          {review.score !== null && (
            <strong className="cloud-review-score">
              {review.score}
              <small> / 100{review.source === "demo" ? " · 建议分" : ""}</small>
            </strong>
          )}
          <p>{review.comment || "暂无文字点评"}</p>
          <small>
            {review.source === "demo"
              ? "系统预置的演示建议，不是原课程成绩；教师确认保存后才标为教师点评。"
              : `${review.reviewer_name} · ${new Date(review.created_at).toLocaleString("zh-CN")} · 第 ${review.revision} 版`}
          </small>
        </div>
      )}
      {ready && !review && !loading && (
        <p className="muted">这件作品还没有教师点评。</p>
      )}
      {staff && ready && (
        <div className="cloud-review-form">
          <p className="muted">教学参考：色彩关系的理解、氛围表达、说明依据、比较与反思。总分仍为 100 分，系统不自动评分。</p>
          <label>
            教师评分（100 分制，可留空）
            <input
              aria-label="教师评分"
              type="number"
              min="0"
              max="100"
              step="any"
              value={score}
              disabled={saving || loading || withdrawn}
              onChange={(e) => {
                setScore(e.target.value);
                setNotice("");
              }}
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
              disabled={saving || loading || withdrawn}
              onChange={(e) => {
                setComment(e.target.value);
                setNotice("");
              }}
            />
          </label>
          {withdrawn && <p>作品已撤下，恢复展示后可以保存点评。</p>}
          <div className="row-buttons">
            <button
              className="primary"
              disabled={
                saving ||
                loading ||
                !valid ||
                withdrawn ||
                (!dirty && review?.source === "teacher")
              }
              onClick={() => void save()}
            >
              {saving
                ? "保存中…"
                : review?.source === "demo"
                  ? "确认并保存教师点评"
                  : "保存点评与评分"}
            </button>
            <button
              disabled={!dirty || saving || loading}
              onClick={() => {
                reset(review);
                setError("");
                setNotice("");
              }}
            >
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
