import { useState, useEffect, useRef, useId } from "react";
import {
  LearningContent,
  findEmotionCase,
  type EmotionCase,
} from "@colorverse/contracts";
import { EmotionCases } from "./EmotionCases";
import { KnowledgeVisual, KnowledgeLabels } from "./KnowledgeVisual";
import { KnowledgeExperiment } from "./KnowledgeExperiment";
import { KnowledgeExampleImages } from "./knowledge-example-images";
import { readStudyPreference, saveStudyPreference } from "./study-preferences";
import "./color-mystery.css";
export function ColorMystery({
  related = [],
  initialCaseId,
  onApplyColor,
  onBack,
  backLabel = "返回宇宙",
}: {
  related?: string[];
  initialCaseId?: string;
  onApplyColor?: (c: EmotionCase) => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  const instance = useId();
  const reference = findEmotionCase(
    initialCaseId ?? related.find((id) => !!findEmotionCase(id)),
  );
  const preference = readStudyPreference("topic");
  const [tab, setTab] = useState(
    reference || related[0] === "K08"
      ? "emotion"
      : preference.tab === "emotion"
        ? "emotion"
        : "knowledge",
  );
  const [knowledge, setKnowledge] = useState(
    related.find((id) => /^K0[1-7]$/.test(id)) ??
      (typeof preference.knowledge === "string" &&
      /^K0[1-7]$/.test(preference.knowledge)
        ? preference.knowledge
        : "K02"),
  );
  const detailRef = useRef<HTMLElement>(null);
  useEffect(
    () => saveStudyPreference("topic", { tab, knowledge }),
    [tab, knowledge],
  );
  const card = LearningContent.knowledge.find((k) => k.id === knowledge)!;
  const guidance = KnowledgeExampleImages[card.id];
  return (
    <section className="chromatic-study" aria-label="色彩知识与情感专题">
      <header className="study-heading">
        <div>
          <h1>色彩的奥秘</h1>
          <p>观察颜色，发现表达的可能。</p>
        </div>
        {onBack && (
          <button className="study-return" onClick={onBack}>
            {backLabel} ↗
          </button>
        )}
      </header>
      <div className="study-tabs" role="tablist" aria-label="色彩探索专题">
        {[
          ["knowledge", "色彩知识"],
          ["emotion", "色彩情感"],
        ].map(([id, name]) => (
          <button
            key={id}
            role="tab"
            id={instance + "study-tab-" + id}
            aria-controls={instance + "study-panel-" + id}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <section
        id={instance + "study-panel-knowledge"}
        role="tabpanel"
        aria-labelledby={instance + "study-tab-knowledge"}
        hidden={tab !== "knowledge"}
      >
        <div className="study-knowledge-layout">
          <div>
            <h2>看见颜色之间的关系</h2>
            <div className="study-topic-grid">
              {LearningContent.knowledge
                .filter((k) => k.id !== "K08")
                .map((k) => (
                  <button
                    key={k.id}
                    className={"study-topic " + (k.id === "K07" ? "wide" : "")}
                    aria-pressed={knowledge === k.id}
                    aria-label={"观察" + KnowledgeLabels[k.id]}
                    onClick={() => {
                      setKnowledge(k.id);
                      if (matchMedia("(max-width: 900px)").matches)
                        requestAnimationFrame(() =>
                          detailRef.current?.scrollIntoView({
                            block: "start",
                            behavior: matchMedia(
                              "(prefers-reduced-motion: reduce)",
                            ).matches
                              ? "instant"
                              : "smooth",
                          }),
                        );
                    }}
                  >
                    <div className="study-topic-visual">
                      <KnowledgeVisual id={k.id} />
                    </div>
                    <div>
                      <h3>{KnowledgeLabels[k.id]}</h3>
                      <p>
                        {KnowledgeExampleImages[k.id]?.summary ?? k.summary}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
          <article
            className="study-detail knowledge-detail"
            ref={detailRef}
            aria-label="当前知识主题"
          >
            <p className="study-eyebrow">OBSERVE · DISCOVER · CREATE</p>
            <h2>{KnowledgeLabels[card.id]}</h2>
            <KnowledgeExperiment id={card.id} />
            <section>
              <h3>观察</h3>
              <p>{guidance?.observation ?? card.summary}</p>
            </section>
            <section>
              <h3>分析</h3>
              <p>{guidance?.analysis ?? card.body}</p>
            </section>
            <section>
              <h3>创作启发</h3>
              <p>{guidance?.prompt ?? card.tryPrompt}</p>
            </section>
            {onBack && (
              <button className="study-apply" onClick={onBack}>
                把发现带回星球 ↗
              </button>
            )}
          </article>
        </div>
      </section>
      <section
        id={instance + "study-panel-emotion"}
        role="tabpanel"
        aria-labelledby={instance + "study-tab-emotion"}
        hidden={tab !== "emotion"}
      >
        <EmotionCases initialCaseId={reference?.id} onApply={onApplyColor} />
      </section>
      <footer className="study-footer">
        <span>色彩的感受，也与你的经历和画面情境有关。</span>
        <details>
          <summary>参考资料与创作来源</summary>
          <p>
            色卡文案由课程负责人提供，知识卡片经 AI 辅助整理，使用前由教师校核。
          </p>
          {LearningContent.sources.map((s) => (
            <p key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            </p>
          ))}
        </details>
      </footer>
    </section>
  );
}
