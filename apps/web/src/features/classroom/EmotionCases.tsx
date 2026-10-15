import { useEffect, useRef, useState } from "react";
import {
  EmotionContent,
  findEmotionCase,
  type EmotionCase,
} from "@colorverse/contracts";
import "./emotion-cases.css";
export function EmotionCases({
  onApply,
  initialCaseId,
}: {
  onApply?: (c: EmotionCase) => void;
  initialCaseId?: string;
}) {
  const [selected, setSelected] = useState<EmotionCase | null>(
      () => findEmotionCase(initialCaseId) ?? null,
    ),
    [zoom, setZoom] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  const close = () => {
    setSelected(null);
    setZoom(false);
    requestAnimationFrame(() =>
      lastFocus.current?.focus({ preventScroll: true }),
    );
  };
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    setFailed(false);
    setZoom(false);
    setRetry(0);
  }, [selected?.id]);
  const family = EmotionContent.groups.find((g) =>
    g.cases.some((c) => c.id === selected?.id),
  );
  return (
    <section className="emotion-atlas" aria-label="八色系情感案例">
      <p>{EmotionContent.introduction}</p>
      <p className="emotion-notice">{EmotionContent.notice}</p>
      <div className="emotion-families">
        {EmotionContent.groups.map((g) => (
          <article key={g.id} data-family={g.id}>
            <header>
              <h3>{g.name}</h3>
              <span>{g.cases.length} 种表达</span>
            </header>
            <p>{g.theme}</p>
            <div className="emotion-variants">
              {g.cases.map((c) => (
                <button
                  key={c.id}
                  onClick={(e) => {
                    lastFocus.current = e.currentTarget;
                    setSelected(c);
                  }}
                  aria-label={`探索${c.name}·${c.emotion}`}
                >
                  <i style={{ background: c.hex }} />
                  <span>
                    {c.name}
                    <small>{c.emotion}</small>
                  </span>
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <dialog
          ref={dialog}
          className={`emotion-detail ${zoom ? "image-expanded" : ""}`}
          aria-label="色彩情感案例详情"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <button
            className="emotion-close"
            aria-label="关闭色彩案例"
            onClick={close}
          >
            ×
          </button>
          <p className="eyebrow">{family?.name} · AN EXPRESSION IN COLOR</p>
          <div
            className="emotion-detail-swatches"
            role="group"
            aria-label="切换同色系案例"
          >
            {family?.cases.map((c) => (
              <button
                key={c.id}
                aria-pressed={c.id === selected.id}
                onClick={() => setSelected(c)}
              >
                <i style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
          <h2>
            {selected.name}
            <span>{selected.emotion}</span>
          </h2>
          <code>{selected.hex}</code>
          {selected.image.status === "ready" && !failed ? (
            <button
              className={`emotion-image ${zoom ? "expanded" : ""}`}
              aria-label={zoom ? "还原案例图" : "放大案例图"}
              onClick={() => setZoom((v) => !v)}
            >
              <img
                key={selected.id + ":" + retry}
                src={`${import.meta.env.BASE_URL}${zoom ? selected.image.path : selected.image.thumbnail}${retry ? "?retry=" + retry : ""}`}
                alt={selected.image.alt}
                onError={() => setFailed(true)}
              />
            </button>
          ) : (
            <div
              className="emotion-image-placeholder"
              style={{ "--case-color": selected.hex } as React.CSSProperties}
            >
              <span>{selected.name}</span>
              <p>
                {failed
                  ? "案例图暂时未能显示。你可以重新加载，或继续阅读和创作。"
                  : "这个案例的图像正在完善中。你可以先阅读说明，或把颜色带回自己的星球试一试。"}
              </p>
              {failed && (
                <button
                  onClick={() => {
                    setFailed(false);
                    setRetry((n) => n + 1);
                  }}
                >
                  重新加载案例图
                </button>
              )}
            </div>
          )}
          <p className="emotion-caption">{selected.image.caption}</p>
          <div className="emotion-case-prose">
            {[
              ["看见这种颜色", selected.observation],
              ["在这个场景中", selected.scene],
              ["试着这样表达", selected.suggestion],
            ].map(([h, t]) => (
              <section key={h}>
                <h3>{h}</h3>
                <p>{t}</p>
              </section>
            ))}
          </div>
          <blockquote>{selected.question}</blockquote>
          {onApply ? (
            <button
              className="primary"
              onClick={() => {
                onApply(selected);
                close();
              }}
            >
              用这个颜色设计星球
            </button>
          ) : (
            <p className="muted">
              在“编辑星球”的主色调中，可选择并微调这个颜色。
            </p>
          )}
          <button onClick={close}>继续我的创作</button>
        </dialog>
      )}
    </section>
  );
}
