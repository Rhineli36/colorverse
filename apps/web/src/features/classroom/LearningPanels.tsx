import { useEffect, useRef, useState } from "react";
import {
  LearningContent,
  LearningIntentSchema,
  LearningTaskSettingSchema,
  MoodChoices,
  PeerObservationSchema,
  type LearningIntent,
  type LearningTaskSetting,
  type PeerObservation,
  type WorkLearningSchema,
} from "@colorverse/contracts";
import type { z } from "zod";
import { classroomRequest } from "./cloud-request";
export const blankIntent = (): LearningIntent => LearningIntentSchema.parse({});
export function KnowledgePanel({
  related = [],
  expanded = false,
}: {
  related?: string[];
  expanded?: boolean;
}) {
  const [topic, setTopic] = useState("knowledge");
  const renderCard = (
    c:
      | (typeof LearningContent.knowledge)[number]
      | (typeof LearningContent.colors)[number],
  ) => (
    <details
      key={c.id}
      className={
        "exampleHex" in c ? "mystery-color-card" : "mystery-knowledge-card"
      }
      open={related.includes(c.id) || undefined}
    >
      <summary>
        {"exampleHex" in c && (
          <span
            className="mystery-color-band"
            style={{ background: c.exampleHex }}
          />
        )}
        <small>{c.id}</small>
        <strong>{c.title}</strong>
        <span>＋</span>
      </summary>
      <div className="mystery-card-body">
        <p>{"summary" in c ? c.summary : c.words}</p>
        <p>{c.body}</p>
        <p className="mystery-question">试一试：{c.tryPrompt}</p>
      </div>
    </details>
  );
  const content = (
    <>
      <header className="mystery-hero">
        <p className="eyebrow">COLORVERSE · CHROMATIC EXPLORATIONS</p>
        <h2>
          色彩的奥秘<span>每一种颜色，都是一个新世界。</span>
        </h2>
        <p>{LearningContent.introduction}</p>
      </header>
      <div className="mystery-tabs" role="tablist" aria-label="色彩探索专题">
        <button
          role="tab"
          id="knowledge-tab"
          aria-controls="knowledge-content"
          aria-selected={topic === "knowledge"}
          onClick={() => setTopic("knowledge")}
        >
          <small>01 / FOUNDATIONS</small>
          <strong>色彩知识</strong>
          <span>色相、明暗、冷暖与搭配 · K01—K07</span>
        </button>
        <button
          role="tab"
          id="emotion-tab"
          aria-controls="emotion-content"
          aria-selected={topic === "emotion"}
          onClick={() => setTopic("emotion")}
        >
          <small>02 / FEELINGS IN COLOR</small>
          <strong>色彩情感</strong>
          <span>从自己的感受开始 · K08 与情感色卡</span>
        </button>
      </div>
      <section
        role="tabpanel"
        id={topic === "knowledge" ? "knowledge-content" : "emotion-content"}
        aria-labelledby={
          topic === "knowledge" ? "knowledge-tab" : "emotion-tab"
        }
      >
        {topic === "knowledge" ? (
          <>
            <h3>看见颜色之间的关系</h3>
            <div className="mystery-card-grid">
              {LearningContent.knowledge
                .filter((c) => c.id !== "K08")
                .map(renderCard)}
            </div>
          </>
        ) : (
          <>
            <h3>让感受，找到自己的颜色</h3>
            <p className="mystery-notice">{LearningContent.notice}</p>
            {LearningContent.knowledge
              .filter((c) => c.id === "K08")
              .map(renderCard)}
            <div className="mystery-card-grid emotion-colors">
              {LearningContent.colors.map(renderCard)}
            </div>
          </>
        )}
      </section>
      <footer className="mystery-sources">
        <p>
          色卡文案由课程负责人提供，知识卡片经 AI 辅助整理，使用前由教师校核。
        </p>
        <details>
          <summary>参考资料</summary>
          {LearningContent.sources.map((s) => (
            <p key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.id} · {s.title}
              </a>
            </p>
          ))}
        </details>
      </footer>
    </>
  );
  return expanded ? (
    <section className="color-mystery" aria-label="色彩知识与情感专题">
      {content}
    </section>
  ) : (
    <details className="learning-panel color-mystery">
      <summary>色彩的奥秘</summary>
      {content}
    </details>
  );
}

function MoodFields({
  value,
  custom,
  onChange,
  disabled,
  label,
}: {
  value: LearningIntent["intendedMoods"];
  custom: string;
  onChange: (m: LearningIntent["intendedMoods"], c: string) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>{label}（最多选 3 项，也可自己描述）</legend>
      <div className="learning-moods">
        {MoodChoices.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={value.includes(m)}
              disabled={!value.includes(m) && value.length === 3}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, m]
                    : value.filter((x) => x !== m),
                  custom,
                )
              }
            />
            {m}
          </label>
        ))}
      </div>
      <label>
        自己的氛围描述
        <input
          value={custom}
          maxLength={30}
          onChange={(e) => onChange(value, e.target.value)}
        />
      </label>
    </fieldset>
  );
}
export function IntentFields({
  value,
  onChange,
  disabled = false,
}: {
  value: LearningIntent;
  onChange: (v: LearningIntent) => void;
  disabled?: boolean;
}) {
  return (
    <section className="learning-panel" aria-label="创作意图与配色说明">
      <MoodFields
        value={value.intendedMoods}
        custom={value.customMood}
        disabled={disabled}
        label="目标氛围"
        onChange={(intendedMoods, customMood) =>
          onChange({ ...value, intendedMoods, customMood })
        }
      />
      <label>
        配色理由
        <textarea
          disabled={disabled}
          maxLength={1000}
          rows={3}
          value={value.colorRationale}
          onChange={(e) =>
            onChange({ ...value, colorRationale: e.target.value })
          }
          placeholder="哪些颜色占主要面积？明暗、冷暖或点缀色怎样帮助表达氛围？"
        />
      </label>
      <p className="muted">
        参考配色可选用和修改，不是标准答案，也不会自动修改你的图片。
      </p>
      <div className="learning-palettes">
        {LearningContent.palettes.map((p) => (
          <button
            type="button"
            key={p.id}
            disabled={disabled}
            onClick={() => onChange({ ...value, paletteColors: [...p.colors] })}
          >
            {p.colors.map((c) => (
              <span
                className="learning-swatch"
                key={c}
                style={{ background: c }}
              />
            ))}
            {p.name}
          </button>
        ))}
      </div>
      <div className="row-buttons">
        {value.paletteColors.map((c, i) => (
          <input
            aria-label={`配色 ${i + 1}`}
            key={i}
            disabled={disabled}
            type="color"
            value={c}
            onChange={(e) =>
              onChange({
                ...value,
                paletteColors: value.paletteColors.map((x, j) =>
                  j === i ? e.target.value : x,
                ),
              })
            }
          />
        ))}
        {value.paletteColors.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, paletteColors: [] })}
          >
            清除参考配色
          </button>
        )}
      </div>
    </section>
  );
}
export function TaskPrompt({ id }: { id: string }) {
  const t = LearningContent.tasks.find((t) => t.id === id);
  return t ? (
    <section className="learning-panel">
      <h3>{t.title}</h3>
      <p>{t.goal}</p>
      <p>{t.description}</p>
      <ol>
        {t.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p>
        提交两条作品记录，选择同一比较组，并标记不同版本；系统不自动判断是否完成两版。
      </p>
      <p>评价关注：{t.reviewFocus}</p>
      <KnowledgePanel related={t.relatedIds} />
    </section>
  ) : (
    <KnowledgePanel />
  );
}
export function TaskSettings({
  classId,
  onTasks,
  onPendingChange,
}: {
  classId: string;
  onTasks: (v: LearningTaskSetting[]) => void;
  onPendingChange: (v: boolean) => void;
}) {
  const [tasks, setTasks] = useState<LearningTaskSetting[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await (
        await classroomRequest(`classes/${classId}/learning-tasks`)
      ).json();
      const t = r.tasks.map((x: unknown) => LearningTaskSettingSchema.parse(x));
      if (alive.current) {
        setTasks(t);
        onTasks(t);
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "任务读取失败");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [classId]);
  useEffect(() => {
    onPendingChange(busy);
  }, [busy, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const save = async (t: LearningTaskSetting) => {
    setBusy(true);
    setError("");
    try {
      const r = await (
        await classroomRequest(`classes/${classId}/learning-tasks`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        })
      ).json();
      const next = r.tasks.map((x: unknown) =>
        LearningTaskSettingSchema.parse(x),
      );
      if (alive.current) {
        setTasks(next);
        onTasks(next);
      }
    } catch (e) {
      await load();
      if (alive.current)
        setError(e instanceof Error ? e.message : "任务保存失败");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <details className="learning-panel">
      <summary>教师教学模板设置</summary>
      <p>
        点击选项立即保存，仅影响随后上传的作品。已上传作品保留提交时的说明与互评规则。
      </p>
      {tasks.map((t) => (
        <fieldset key={t.taskId} disabled={busy}>
          <legend>
            {LearningContent.tasks.find((x) => x.id === t.taskId)?.title}
          </legend>
          {(
            [
              ["published", "启用任务"],
              ["requireExplanation", "要求目标氛围与配色理由"],
              ["allowPeerReview", "允许引导互评"],
              ["showIntentToPeers", "向同伴展示作者意图"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={t[key]}
                onChange={(e) => void save({ ...t, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void load()}>
        重新读取任务设置
      </button>
    </details>
  );
}
export function WorkIntentView({
  learning,
}: {
  learning: z.infer<typeof WorkLearningSchema> | null | undefined;
}) {
  if (!learning)
    return <p className="muted">原有作品尚未记录结构化配色说明。</p>;
  return (
    <details className="learning-panel">
      <summary>教学任务与作者说明</summary>
      <p>
        {LearningContent.tasks.find((t) => t.id === learning.taskId)?.title ??
          "自由展示"}
        {learning.variantLabel ? ` · ${learning.variantLabel}` : ""}
      </p>
      {learning.intentHidden ? (
        <p>本作品采用先观察后交流的设置，作者意图暂不向同伴展示。</p>
      ) : (
        <>
          <p>
            目标氛围：
            {[...learning.intendedMoods, learning.customMood]
              .filter(Boolean)
              .join("、") || "未填写"}
          </p>
          <p>配色理由：{learning.colorRationale || "未填写"}</p>
          {learning.paletteColors.map((c) => (
            <span
              key={c}
              className="learning-swatch"
              style={{ background: c }}
              title={c}
            />
          ))}
        </>
      )}
    </details>
  );
}
export function ObservationFields({
  value,
  onChange,
  disabled,
}: {
  value: PeerObservation;
  onChange: (v: PeerObservation) => void;
  disabled: boolean;
}) {
  return (
    <section className="learning-panel" aria-label="有依据的同伴反馈">
      <h3>感受 → 画面依据 → 建议</h3>
      <p>不同感受都可以讨论；请依据画面说明，不替同学打分。</p>
      <MoodFields
        value={value.perceivedMoods}
        custom={value.customMood}
        disabled={disabled}
        label="观察感受"
        onChange={(perceivedMoods, customMood) =>
          onChange({ ...value, perceivedMoods, customMood })
        }
      />
      <label>
        画面依据（必填）
        <textarea
          disabled={disabled}
          rows={2}
          value={value.visualEvidence}
          maxLength={1000}
          onChange={(e) =>
            onChange({ ...value, visualEvidence: e.target.value })
          }
          placeholder="指出颜色、明暗、面积或具体位置"
        />
      </label>
      <label>
        一条建议（可选）
        <textarea
          disabled={disabled}
          rows={2}
          value={value.suggestion}
          maxLength={1000}
          onChange={(e) => onChange({ ...value, suggestion: e.target.value })}
        />
      </label>
    </section>
  );
}
export const blankObservation = (): PeerObservation => ({
  perceivedMoods: [],
  customMood: "",
  visualEvidence: "",
  suggestion: "",
});
export const validObservation = (v: PeerObservation) =>
  PeerObservationSchema.safeParse(v).success;
