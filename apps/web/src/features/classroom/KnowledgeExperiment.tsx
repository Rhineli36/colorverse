import { useEffect, useId, useRef, useState } from "react";
import { ExperimentPicture } from "./ExperimentPicture";
import {
  KnowledgeExperiments,
  experimentValue,
  type KnowledgeExperimentId,
} from "./knowledge-experiment-model";

export function KnowledgeExperiment({ id }: { id: string }) {
  const controlId = useId();
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
  }, [expanded]);
  const [values, setValues] = useState<
    Partial<Record<KnowledgeExperimentId, number>>
  >({});
  const key = id as KnowledgeExperimentId;
  const spec = KnowledgeExperiments[key];
  if (!spec) return null;
  const value = values[key] ?? spec.initial;
  const comparison = () => (
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
  );
  const controls = (inputId: string) => (
    <>
      <div className="experiment-control-heading">
        <label htmlFor={inputId}>{spec.label}</label>
        <output htmlFor={inputId} aria-live="off">
          {experimentValue(key, value)}
        </output>
      </div>
      <input
        id={inputId}
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
    </>
  );
  return (
    <div className="knowledge-experiment" data-experiment-id={id}>
      <div className="experiment-title-row">
        <p className="experiment-scene-name">{spec.sceneName}</p>
        <button type="button" onClick={() => setExpanded(true)}>
          放大对照 ↗
        </button>
      </div>
      {comparison()}
      {controls(controlId)}
      {expanded && (
        <dialog
          className="experiment-dialog"
          ref={dialog}
          aria-label="色彩体验放大对照"
          onCancel={(e) => {
            e.preventDefault();
            setExpanded(false);
          }}
        >
          <header>
            <h2>{spec.sceneName}</h2>
            <button
              type="button"
              aria-label="关闭放大对照"
              onClick={() => setExpanded(false)}
            >
              ×
            </button>
          </header>
          {comparison()}
          {controls(controlId + "-large")}
        </dialog>
      )}
    </div>
  );
}
