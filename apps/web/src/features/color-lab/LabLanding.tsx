import { experiments } from "./experiments";
import { labNavigate } from "./lab-navigation";
import "./color-lab.css";
export function LabLanding() {
  return (
    <div className="color-lab-landing">
      <header className="lab-landing-title">
        <div>
          <span className="lab-eyebrow">COLOR LAB</span>
          <h2>让色彩，动起来。</h2>
        </div>
        <span>交互观察 · 课堂演示</span>
      </header>
      {experiments.map((experiment) => (
        <article className="lab-experiment-card" key={experiment.id}>
          <img
            src={experiment.cover}
            alt={experiment.title + "实验画面"}
            width="625"
            height="900"
          />
          <div className="lab-card-copy">
            <span className="lab-eyebrow">
              实验 {experiment.number} / {experiment.category}
            </span>
            <h3>{experiment.title}</h3>
            <p>{experiment.subtitle}</p>
            <p>{experiment.description}</p>
            <ul aria-label="知识标签">
              {experiment.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <div className="lab-card-actions">
              <button
                className="lab-primary"
                onClick={() => labNavigate(experiment.path)}
              >
                开始实验 →
              </button>
              <button
                onClick={() => labNavigate(experiment.path + "?mode=classroom")}
              >
                课堂展示
              </button>
            </div>
          </div>
        </article>
      ))}
      <p className="lab-future">后续实验方向：月下萤火 / 星云诞生</p>
    </div>
  );
}
