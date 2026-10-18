import { useCallback, useEffect, useRef, useState } from "react";
import { ShowcaseReviewResponse } from "@colorverse/contracts";
import type { z } from "zod";
import { ReviewPanel } from "./ReviewPanel";
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
    <ReviewPanel
      record={
        review
          ? {
              ...review,
              author:
                review.source === "teacher" ? review.reviewer_name : undefined,
              date: review.created_at,
            }
          : null
      }
      staff={staff && ready}
      score={score}
      comment={comment}
      busy={saving}
      loading={loading}
      dirty={dirty}
      allowUnchanged={review?.source === "demo"}
      withdrawn={withdrawn}
      error={error}
      notice={notice}
      onScore={(v) => {
        setScore(v);
        setNotice("");
      }}
      onComment={(v) => {
        setComment(v);
        setNotice("");
      }}
      onSave={() => {
        if (valid) void save();
      }}
      onReset={() => {
        reset(review);
        setError("");
        setNotice("");
      }}
      onRetry={() => {
        preserveDraft.current = ready;
        setReload((n) => n + 1);
      }}
    />
  );
}
