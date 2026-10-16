import { EmotionCases } from "./EmotionCases";
import { useState, useEffect } from "react";
import { EmotionContent, findEmotionCase } from "@colorverse/contracts";
import "./exploration.css";
export function ColorCardPicker({
  color,
  onColor,
  mood,
  onMood,
  disabled = false,
  referenceCaseId,
  onReference,
}: {
  color: string;
  onColor: (v: string) => void;
  mood: string;
  onMood: (v: string) => void;
  disabled?: boolean;
  referenceCaseId?: string;
  onReference?: (id: string) => void;
}) {
  const cards = EmotionContent.groups.flatMap((g) => g.cases);
  const [explore, setExplore] = useState(0);
  const [selected, setSelected] = useState(
      cards.find((c) => c.hex.toLowerCase() === color.toLowerCase())?.id ??
        referenceCaseId ??
        "",
    ),
    [hex, setHex] = useState<string | null>(null);
  useEffect(() => {
    const exact = cards.find(
      (c) => c.hex.toLowerCase() === color.toLowerCase(),
    );
    setSelected(exact?.id ?? referenceCaseId ?? "");
  }, [color, referenceCaseId]);
  const card = findEmotionCase(selected);
  return (
    <section className="color-creation" aria-label="情感色卡创作">
      <p className="eyebrow">COLOR · FEELING · YOUR WORLD</p>
      <h3>为星球选择一种表达</h3>
      <label>
        希望表达的情感或氛围
        <input
          aria-label="希望表达的情感或氛围"
          value={mood}
          maxLength={30}
          disabled={disabled}
          onChange={(e) => onMood(e.target.value)}
        />
      </label>
      <p className="muted">
        可以先选氛围，也可以从颜色开始。色卡会设置主色调，之后仍可微调。
      </p>
      <div
        className="color-case-chooser"
        role="group"
        aria-label="选择主色色卡"
      >
        <div className="flat-swatch-grid">
          {cards.map((c) => (
            <button
              type="button"
              key={c.id}
              disabled={disabled}
              aria-pressed={selected === c.id}
              aria-label={`选择${c.name}·${c.emotion}`}
              onClick={() => {
                setHex(null);
                setSelected(c.id);
                onColor(c.hex);
                onReference?.(c.id);
              }}
            >
              <i style={{ background: c.hex }}>
                {selected === c.id && <b>✓</b>}
              </i>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      {card && (
        <article className="color-card-detail" aria-label="当前色卡详情">
          <h4>
            {card.name} · {card.emotion}
          </h4>
          <code>{card.hex}</code>
          <p>{card.observation}</p>
          <button type="button" onClick={() => setExplore((n) => n + 1)}>
            走进色彩的奥秘 ↗
          </button>
        </article>
      )}
      {explore > 0 && card && (
        <div className="color-case-detail-browser">
          <EmotionCases
            key={explore}
            initialCaseId={card.id}
            onApply={(c) => {
              if (
                color.toUpperCase() !== c.hex.toUpperCase() &&
                !window.confirm(
                  "将主色调调整为" +
                    c.hex +
                    "？只改变颜色，不重置背景、作品或元素位置。",
                )
              )
                return;
              setSelected(c.id);
              setHex(null);
              onColor(c.hex);
              onReference?.(c.id);
            }}
          />
        </div>
      )}
      <div className="color-fine-tune">
        <label>
          主色调
          <input
            type="color"
            aria-label="主色调微调"
            value={color}
            disabled={disabled}
            onChange={(e) => {
              setHex(null);
              onColor(e.target.value);
            }}
          />
        </label>
        <label>
          HEX 色值
          <input
            aria-label="主色调 HEX"
            value={hex ?? color}
            maxLength={7}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setHex(v);
              if (/^#[a-f\d]{6}$/i.test(v)) onColor(v.toUpperCase());
            }}
            onBlur={() => {
              if (hex && /^#[a-f\d]{6}$/i.test(hex)) onColor(hex.toUpperCase());
              setHex(null);
            }}
          />
        </label>
        <output aria-label="当前主色调">{color.toUpperCase()}</output>
      </div>
      <p className="muted">{EmotionContent.notice}</p>
    </section>
  );
}
