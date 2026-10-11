import { GrowthPresets, type GrowthEvent } from "@colorverse/contracts";
import { GrowthLibraryChooser } from "./GrowthLibraryChooser";
import { Field } from "./controls";
export function GrowthProposalPanel({
  event,
  stored,
  busy,
  onChange,
  onSave,
  onAccept,
  onSkip,
}: {
  event: GrowthEvent;
  stored?: GrowthEvent;
  busy: boolean;
  onChange: (event: GrowthEvent) => void;
  onSave: () => void;
  onAccept: () => void;
  onSkip: () => void;
}) {
  const el = event.elements[0],
    saved = JSON.stringify(event.elements) === JSON.stringify(stored?.elements);
  const params = (key: "color" | "x" | "y" | "scale", value: string | number) =>
    onChange({
      ...event,
      elements: event.elements.map((e, i) =>
        i ? e : { ...e, params: { ...e.params, [key]: value } },
      ),
    });
  return (
    <section className="proposal-card" aria-label="成长预览">
      <div className="proposal-heading">
        <div>
          <p className="eyebrow">GROWTH PREVIEW</p>
          <h3>把「{GrowthPresets[el.presetId].name}」带进你的星球</h3>
        </div>
        <span role="status">
          {saved ? "预览已保存 · 尚未加入场景" : "预览有调整 · 可保存后继续"}
        </span>
      </div>
      <p className="muted">{event.summary}</p>
      {event.trigger.kind === "archive" && (
        <div className="growth-picker" role="group" aria-label="选择成长造型">
          <GrowthLibraryChooser
            selected={el.presetId}
            color={el.params.color}
            seed={el.params.seed}
            disabled={busy}
            onSelect={(id) =>
              onChange({
                ...event,
                elements: event.elements.map((e, i) =>
                  i ? e : { ...e, presetId: id },
                ),
              })
            }
          />
        </div>
      )}
      <fieldset disabled={busy} className="proposal-controls">
        <Field label="成长颜色">
          <input
            type="color"
            value={el.params.color}
            onChange={(e) => params("color", e.target.value)}
          />
        </Field>
        {(["x", "y", "scale"] as const).map((key) => (
          <Field
            key={key}
            label={
              { x: "成长水平位置", y: "成长垂直位置", scale: "成长大小" }[key]
            }
          >
            <input
              type="range"
              min={key === "scale" ? 0.1 : 0}
              max={key === "scale" ? 2 : 1}
              step=".01"
              value={el.params[key]}
              onChange={(e) => params(key, Number(e.target.value))}
            />
          </Field>
        ))}
      </fieldset>
      <div className="showcase-actions">
        <button disabled={busy} onClick={onSkip}>
          {event.trigger.kind === "archive" ? "跳过这次成长" : "拒绝"}
        </button>
        <div>
          <button disabled={busy || saved} onClick={onSave}>
            保存预览调整
          </button>
          <button className="primary small" disabled={busy} onClick={onAccept}>
            接受并保存
          </button>
        </div>
      </div>
    </section>
  );
}
