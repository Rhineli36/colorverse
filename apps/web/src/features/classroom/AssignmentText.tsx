import { useRef, useState } from "react";
import type { AssignmentMark } from "@colorverse/contracts";

type Style = AssignmentMark["style"];
const colors = { gold: "浅金", blue: "浅蓝", purple: "浅紫" };
const isColor = (style: Style) => style in colors;

export function sliceMarks(marks: AssignmentMark[], from: number, to: number) {
  return marks
    .filter((mark) => mark.from < to && mark.to > from)
    .map((mark) => ({
      ...mark,
      from: Math.max(mark.from, from) - from,
      to: Math.min(mark.to, to) - from,
    }));
}

export function AssignmentText({
  text,
  marks = [],
}: {
  text: string;
  marks?: AssignmentMark[];
}) {
  const safe = sliceMarks(marks, 0, text.length);
  const points = [
    ...new Set([0, text.length, ...safe.flatMap((m) => [m.from, m.to])]),
  ].sort((a, b) => a - b);
  return (
    <span className="assignment-formatted-text">
      {points.slice(0, -1).map((from, i) => {
        const styles = safe
          .filter((m) => m.from <= from && from < m.to)
          .map((m) => m.style);
        let content = <>{text.slice(from, points[i + 1])}</>;
        if (styles.includes("bold")) content = <strong>{content}</strong>;
        if (styles.includes("italic")) content = <em>{content}</em>;
        return (
          <span key={from} data-ink={styles.find(isColor)}>
            {content}
          </span>
        );
      })}
    </span>
  );
}

export function AssignmentTextEditor({
  label,
  text,
  marks,
  rows,
  maxLength,
  disabled,
  onChange,
}: {
  label: string;
  text: string;
  marks: AssignmentMark[];
  rows: number;
  maxLength: number;
  disabled: boolean;
  onChange: (text: string, marks: AssignmentMark[]) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [notice, setNotice] = useState("");
  const apply = (style: Style | "reset") => {
    const input = field.current!;
    const { selectionStart: from, selectionEnd: to } = input;
    input.focus();
    input.setSelectionRange(from, to);
    if (from === to) {
      setNotice("请先选中要调整的文字。");
      return;
    }
    const same = marks.filter((m) => m.style === style);
    const toggleOff = same.some((m) => m.from <= from && m.to >= to);
    const next = marks.flatMap((m) =>
      style === "reset" ||
      m.style === style ||
      (isColor(style) && isColor(m.style))
        ? [
            ...sliceMarks([m], 0, from),
            ...sliceMarks([m], to, text.length).map((part) => ({
              ...part,
              from: part.from + to,
              to: part.to + to,
            })),
          ]
        : [m],
    );
    if (style !== "reset" && !toggleOff) next.push({ from, to, style });
    if (next.length > 24) {
      setNotice("此栏最多保留 24 处格式，请先清除部分格式。");
      return;
    }
    setNotice("");
    onChange(text, next);
  };
  return (
    <div className="assignment-text-editor">
      <div
        className="assignment-format-tools"
        role="group"
        aria-label={`${label}格式`}
        onMouseDown={(event) => event.preventDefault()}
      >
        <button
          type="button"
          title="加粗"
          aria-label="加粗"
          disabled={disabled}
          onClick={() => apply("bold")}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          title="斜体"
          aria-label="斜体"
          disabled={disabled}
          onClick={() => apply("italic")}
        >
          <em>I</em>
        </button>
        {Object.entries(colors).map(([color, name]) => (
          <button
            type="button"
            key={color}
            data-ink={color}
            title={name}
            aria-label={`文字颜色 ${name}`}
            disabled={disabled}
            onClick={() => apply(color as Style)}
          >
            ●
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => apply("reset")}
        >
          清除格式
        </button>
      </div>
      <textarea
        ref={field}
        aria-label={label}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          let start = 0;
          while (
            start < text.length &&
            start < next.length &&
            text[start] === next[start]
          )
            start++;
          let end = text.length;
          let nextEnd = next.length;
          while (
            end > start &&
            nextEnd > start &&
            text[end - 1] === next[nextEnd - 1]
          ) {
            end--;
            nextEnd--;
          }
          const move = (point: number) =>
            point <= start
              ? point
              : point >= end
                ? point + next.length - text.length
                : nextEnd;
          onChange(
            next,
            marks
              .map((m) => ({ ...m, from: move(m.from), to: move(m.to) }))
              .filter((m) => m.from < m.to),
          );
        }}
      />
      {notice && <small role="status">{notice}</small>}
      {marks.length > 0 && (
        <div className="assignment-format-preview">
          <small>排版预览</small>
          <AssignmentText text={text} marks={marks} />
        </div>
      )}
    </div>
  );
}
