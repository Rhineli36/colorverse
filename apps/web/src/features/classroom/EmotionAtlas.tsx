import { useEffect, useRef, useState } from "react";
import {
  EmotionContent,
  LearningContent,
  findEmotionCase,
  type EmotionCase,
} from "@colorverse/contracts";
import "./color-mystery.css";
import { readStudyPreference, saveStudyPreference } from "./study-preferences";
/** Thumbnail framing only; full views always keep the original composition. */
export const EmotionThumbnailFocus: Record<string, string> = {};
const familyNames = ["红", "橙", "黄", "绿", "蓝 · 青", "紫", "棕", "黑白灰"];
function CasePicture({
  item,
  full = false,
}: {
  item: EmotionCase;
  full?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(false);
    setRetry(0);
  }, [item.id, full]);
  return item.image.status === "ready" && !failed ? (
    <img
      key={item.id + retry}
      src={`${import.meta.env.BASE_URL}${full ? item.image.path : item.image.thumbnail}${retry ? "?retry=" + retry : ""}`}
      alt={item.image.alt}
      loading={full ? "eager" : "lazy"}
      decoding="async"
      style={{ objectPosition: EmotionThumbnailFocus[item.id] ?? "50% 50%" }}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className="study-image-placeholder"
      style={{ "--case-color": item.hex } as React.CSSProperties}
    >
      {full && <span>{item.name}</span>}
      <small>{failed ? "图片暂时未能显示" : "图像待补充"}</small>
      {failed && full && (
        <button
          onClick={() => {
            setFailed(false);
            setRetry((n) => n + 1);
          }}
        >
          重新读取图片
        </button>
      )}
    </div>
  );
}
export function EmotionCases({
  onApply,
  initialCaseId,
}: {
  onApply?: (c: EmotionCase) => void;
  initialCaseId?: string;
}) {
  const preference = readStudyPreference("emotion");
  const remembered =
    typeof preference.selected === "string"
      ? findEmotionCase(preference.selected)
      : undefined;
  const initial =
    findEmotionCase(initialCaseId) ??
    remembered ??
    EmotionContent.groups[0].cases[0];
  const initialFamily = EmotionContent.groups.find((g) =>
    g.cases.some((c) => c.id === initial.id),
  )!;
  const previousChoices =
    preference.choices && typeof preference.choices === "object"
      ? (Object.fromEntries(
          Object.entries(preference.choices).filter(
            ([group, id]) =>
              typeof id === "string" &&
              EmotionContent.groups.some(
                (g) => g.id === group && g.cases.some((c) => c.id === id),
              ),
          ),
        ) as Record<string, string>)
      : {};
  const [familyId, setFamilyId] = useState(initialFamily.id),
    [choices, setChoices] = useState<Record<string, string>>({
      ...previousChoices,
      [initialFamily.id]: initial.id,
    }),
    [zoom, setZoom] = useState<EmotionCase>();
  const family = EmotionContent.groups.find((g) => g.id === familyId)!;
  const selected =
    family.cases.find((c) => c.id === choices[familyId]) ?? family.cases[0];
  useEffect(
    () => saveStudyPreference("emotion", { selected: selected.id, choices }),
    [selected.id, choices],
  );
  const dialog = useRef<HTMLDialogElement>(null),
    details = useRef<HTMLElement>(null),
    opener = useRef<HTMLButtonElement | null>(null),
    scroll = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
  }, [zoom]);
  const close = () => {
    setZoom(undefined);
    requestAnimationFrame(() => {
      opener.current?.focus({ preventScroll: true });
      window.scrollTo(scroll.current.x, scroll.current.y);
    });
  };
  const choose = (c: EmotionCase) => {
    setChoices((v) => ({ ...v, [familyId]: c.id }));
    if (matchMedia("(max-width: 900px)").matches)
      requestAnimationFrame(() =>
        details.current?.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        }),
      );
  };
  return (
    <div className="study-emotions" aria-label="八色系情感案例">
      <div className="study-emotion-heading">
        <div>
          <h2>同一种颜色，也有不同的心情。</h2>
          <p>这些感受是创作的起点，你也可以有自己的解释。</p>
        </div>
        <nav className="study-family-nav" aria-label="选择色系">
          {EmotionContent.groups.map((g, i) => (
            <button
              key={g.id}
              aria-pressed={familyId === g.id}
              aria-label={"浏览" + g.name}
              onClick={() => setFamilyId(g.id)}
            >
              <i
                style={
                  g.id === "neutral"
                    ? {
                        background:
                          "conic-gradient(#f3f0e8 0 33%,#8b9097 33% 66%,#232631 66%)",
                      }
                    : { background: g.cases[0].hex }
                }
              />
              <span>{familyNames[i]}</span>
            </button>
          ))}
        </nav>
      </div>
      <details className="study-emotion-intro">
        <summary>如何理解色彩情感</summary>
        <p>{EmotionContent.introduction}</p>
        <p>{EmotionContent.notice}</p>
        <p>{LearningContent.notice}</p>
        {LearningContent.knowledge
          .filter((k) => k.id === "K08")
          .map((k) => (
            <div key={k.id}>
              <h3>{k.title.replace(/^.*?：/, "")}</h3>
              <p>{k.summary}</p>
              <p>{k.body}</p>
              <p>{k.tryPrompt}</p>
              <p>{k.related}</p>
            </div>
          ))}
      </details>
      <div className="study-emotion-layout">
        <div className="study-case-grid" aria-label={family.name + "案例"}>
          {family.cases.map((c) => (
            <article
              className={
                "study-case " + (c.id === selected.id ? "selected" : "")
              }
              key={c.id}
              data-case-id={c.id}
              style={{ "--case-color": c.hex } as React.CSSProperties}
            >
              <button
                className="study-case-select"
                aria-label={"选择案例 " + c.name}
                aria-pressed={c.id === selected.id}
                onClick={() => choose(c)}
              >
                <CasePicture item={c} />
                <span className="study-case-label">
                  <i style={{ background: c.hex }} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.emotion}</small>
                  </span>
                  {c.id === selected.id && <b aria-label="已选择">✓</b>}
                </span>
              </button>
              <button
                className="study-view-image"
                disabled={c.image.status !== "ready"}
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  scroll.current = { x: scrollX, y: scrollY };
                  setZoom(c);
                }}
                aria-label={"查看大图 " + c.name}
              >
                {c.image.status === "ready" ? "查看大图 ↗" : "图像待补充"}
              </button>
            </article>
          ))}
        </div>
        <article
          className="study-detail emotion-reading"
          ref={details}
          aria-label="当前情感案例详情"
          tabIndex={-1}
          data-case-id={selected.id}
        >
          <div className="study-case-index">
            <span>
              {family.name} / {family.cases.indexOf(selected) + 1}
            </span>
            <div>
              {[-1, 1].map((step) => (
                <button
                  key={step}
                  aria-label={step < 0 ? "上一个案例" : "下一个案例"}
                  onClick={() =>
                    choose(
                      family.cases[
                        (family.cases.indexOf(selected) +
                          step +
                          family.cases.length) %
                          family.cases.length
                      ],
                    )
                  }
                >
                  {step < 0 ? "‹" : "›"}
                </button>
              ))}
            </div>
          </div>
          <h2>{selected.name}</h2>
          <p className="study-emotion-keywords">{selected.emotion}</p>
          <div className="study-exact-color">
            <i
              style={{ background: selected.hex }}
              aria-label={selected.name + "色标"}
            />
            <code>{selected.hex}</code>
          </div>
          {[
            ["看见这种颜色", selected.observation],
            ["在这个场景中", selected.scene],
            ["试着这样表达", selected.suggestion],
          ].map(([h, t]) => (
            <section key={h}>
              <h3>{h}</h3>
              {h === "在这个场景中" && selected.image.status !== "ready" && (
                <small className="study-material-pending">
                  配图待补，以下为场景设想。
                </small>
              )}
              <p>{t}</p>
            </section>
          ))}
          <blockquote>{selected.question}</blockquote>
          {onApply && (
            <button className="study-apply" onClick={() => onApply(selected)}>
              用这抹颜色创作 ↗
            </button>
          )}
          <details className="study-image-source">
            <summary>案例资料与图像来源</summary>
            <p>{family.theme}</p>
            <p>{selected.image.caption}</p>
            <p>{selected.image.source}</p>
          </details>
        </article>
      </div>
      {zoom && (
        <dialog
          className="study-image-dialog"
          ref={dialog}
          aria-label="案例完整图片"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <button
            className="study-zoom-close"
            aria-label="关闭案例大图"
            onClick={close}
          >
            ×
          </button>
          <h2>
            {zoom.name} · {zoom.emotion}
          </h2>
          <div className="study-full-image">
            <CasePicture item={zoom} full />
          </div>
          <p>{zoom.image.caption}</p>
        </dialog>
      )}
    </div>
  );
}
