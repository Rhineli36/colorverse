import { useId, useState } from "react";
import {
  KnowledgeExperiments,
  experimentPalette,
  experimentValue,
  type KnowledgeExperimentId,
} from "./knowledge-experiment-model";

function ExperimentPicture({
  id,
  value,
  label,
}: {
  id: KnowledgeExperimentId;
  value: number;
  label: string;
}) {
  const colors = experimentPalette(id, value);
  return (
    <svg viewBox="0 0 240 160" role="img" aria-label={label}>
      {id === "K07" ? (
        <>
          <rect width="240" height="160" fill="#416fbc" />
          <rect
            data-area="coral"
            x={240 * (1 - value / 100)}
            width={(240 * value) / 100}
            height="160"
            fill="#ed8d88"
          />
        </>
      ) : (
        <>
          <rect width="240" height="160" fill={colors.sky} />
          <circle cx="38" cy="30" r="9" fill="#e2e6ed" />
          <path
            d="M0 105L48 58L88 104L133 65L202 112L240 93V160H0Z"
            fill={colors.far}
          />
          <path
            d="M0 125L58 94L120 132L182 96L240 119V160H0Z"
            fill={colors.near}
          />
          <path d="M0 145Q120 110 240 145V160H0Z" fill={colors.ground} />
          <path
            d="M133 137V56A36 36 0 0 1 205 56V137"
            fill="none"
            stroke={colors.arch}
            strokeWidth="10"
          />
          <circle
            data-color-target="orb"
            cx="169"
            cy="85"
            r="22"
            fill={colors.orb}
          />
          <path
            d="M140 160Q103 146 168 137"
            fill="none"
            stroke="#d1d4cf"
            strokeWidth="4"
          />
        </>
      )}
    </svg>
  );
}
export function KnowledgeExperiment({ id }: { id: string }) {
  const controlId = useId();
  const [values, setValues] = useState<
    Partial<Record<KnowledgeExperimentId, number>>
  >({});
  const key = id as KnowledgeExperimentId;
  const spec = KnowledgeExperiments[key];
  if (!spec) return null;
  const value = values[key] ?? spec.initial;
  return (
    <div className="knowledge-experiment" data-experiment-id={id}>
      <div className="experiment-comparison">
        <figure>
          <ExperimentPicture id={key} value={spec.reference} label="原始配色" />
          <figcaption>原始配色</figcaption>
        </figure>
        <figure>
          <ExperimentPicture id={key} value={value} label="调整后的配色" />
          <figcaption>你的尝试</figcaption>
        </figure>
      </div>
      <div className="experiment-control-heading">
        <label htmlFor={controlId}>{spec.label}</label>
        <output htmlFor={controlId} aria-live="off">
          {experimentValue(key, value)}
        </output>
      </div>
      <input
        id={controlId}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) =>
          setValues((previous) => ({
            ...previous,
            [key]: Number(e.target.value),
          }))
        }
      />
      <div className="experiment-range-ends">
        <span>{spec.ends[0]}</span>
        <span>{spec.ends[1]}</span>
      </div>
      <p className="experiment-hint">{spec.hint}</p>
      <div className="experiment-bottom">
        <p>{spec.question}</p>
        <button
          type="button"
          onClick={() =>
            setValues((previous) => ({ ...previous, [key]: spec.initial }))
          }
        >
          重置
        </button>
      </div>
    </div>
  );
}
