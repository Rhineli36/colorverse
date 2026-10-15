import { KnowledgePanel } from "./LearningPanels";
import { useState } from "react";
import { LearningContent } from "@colorverse/contracts";
import "./exploration.css";
export function ColorCardPicker({
  color,
  onColor,
  mood,
  onMood,
  disabled = false,
}: {
  color: string;
  onColor: (v: string) => void;
  mood: string;
  onMood: (v: string) => void;
  disabled?: boolean;
}) {
  const cards = LearningContent.colors;
  const [selected, setSelected] = useState(
      cards.find((c) => c.exampleHex.toLowerCase() === color.toLowerCase())
        ?.id ?? "",
    ),
    [hex, setHex] = useState<string | null>(null);
  const card = cards.find((c) => c.id === selected);
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
      <div className="color-card-orbit" role="group" aria-label="选择主色色卡">
        {cards.map((c) => (
          <button
            type="button"
            key={c.id}
            disabled={disabled}
            aria-pressed={selected === c.id}
            aria-label={`选择${c.title.split(/[｜：]/)[0]}色卡`}
            onClick={() => {
              setHex(null);
              setSelected(c.id);
              onColor(c.exampleHex);
            }}
            style={{ "--card-color": c.exampleHex } as React.CSSProperties}
          >
            <span className="color-card-dot" />
            <span>{c.title.split(/[｜：]/)[0]}</span>
          </button>
        ))}
      </div>
      {card && (
        <article className="color-card-detail" aria-label="当前色卡详情">
          <h4>{card.title}</h4>
          <code>{card.exampleHex}</code>
          <p>氛围联想：{card.words}</p>
          <p>{card.body}</p>
          <p className="color-card-question">{card.tryPrompt}</p>
        </article>
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
      <p className="muted">{LearningContent.notice}</p>
      <KnowledgePanel />
    </section>
  );
}
