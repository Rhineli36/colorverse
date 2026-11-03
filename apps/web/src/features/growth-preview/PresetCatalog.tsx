import { FramePresetArt, RingPresetArt } from "./PresetArt";
import { FloatingCharm, charmNames } from "./FloatingCharms";
import { previewAsset } from "./assets";
import {
  framePresets,
  ringPresets,
  type FrameId,
  type RingId,
} from "./presets";

export function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="12" height="9" rx="2" />
      <path d="M6.5 8V5a3.5 3.5 0 0 1 7 0v3M10 11v3" />
    </svg>
  );
}
export function PresetCatalog({
  frame,
  ring,
  background,
  onFrame,
  onRing,
}: {
  frame?: FrameId;
  ring?: RingId;
  background: string;
  onFrame: (id: FrameId) => void;
  onRing: (id: RingId) => void;
}) {
  return (
    <section className="gp-catalog" aria-label="锁定装饰预设" id="presets">
      <div className="gp-catalog-heading">
        <div>
          <p className="gp-eyebrow">THE ORNAMENT COLLECTION</p>
          <h2>收藏下一份光芒</h2>
          <p>
            所有款式默认锁定，解锁条件待配置。现在可以临时试戴，比较不同风格。
          </p>
        </div>
        <span className="gp-catalog-count">
          <LockIcon /> {framePresets.length + ringPresets.length} 款待解锁
        </span>
      </div>
      <div className="gp-collection-title">
        <h3>内部边框</h3>
        <span>金属花丝、宝石镶嵌、彩绘与立冬 · {framePresets.length} 款</span>
      </div>
      <div className="gp-frame-catalog">
        {framePresets.map((p) => (
          <article
            className={`gp-preset-card ${frame === p.id ? "trial-selected" : ""}`}
            key={p.id}
            id={p.id === "winter" ? "winter-theme" : undefined}
            data-locked={p.locked}
          >
            <div className="gp-frame-swatch">
              <img src={background} alt="" />
              <FramePresetArt id={p.id} />
              <div className="gp-mini-charm">
                <FloatingCharm id={p.id} />
              </div>
              <span className="gp-lock-badge">
                <LockIcon />
                已锁定
              </span>
            </div>
            <div className="gp-preset-info">
              <div>
                <h4>{p.name}</h4>
                <p>{p.material}</p>
              </div>
              <button
                onClick={() => onFrame(p.id)}
                aria-label={`试戴边框：${p.name}`}
                aria-pressed={frame === p.id}
              >
                {frame === p.id ? "试戴中" : "试戴"}
                <span aria-hidden="true"> ↗</span>
              </button>
            </div>
            <p className="gp-preset-description">{p.description}</p>
            <p className="gp-charm-caption">配套浮饰 · {charmNames[p.id]}</p>
            <small className="gp-unlock-rule">
              {p.id === "winter"
                ? "拟关联：立冬节气设计作业 · 尚未配置"
                : "解锁条件待配置"}
            </small>
          </article>
        ))}
      </div>
      <div className="gp-collection-title">
        <h3>外部星环与主题外观</h3>
        <span>前后分层，细节环绕 · {ringPresets.length} 款</span>
      </div>
      <div className="gp-ring-catalog">
        {ringPresets.map((p) => (
          <article
            className={`gp-preset-card ${ring === p.id ? "trial-selected" : ""}`}
            key={p.id}
            id={p.id === "jellyfish" ? "jellyfish-theme" : undefined}
            data-locked={p.locked}
          >
            <div className="gp-ring-swatch">
              <div className="gp-mini-planet">
                <RingPresetArt id={p.id} staticPreview particles={false} />
                <img
                  className="gp-planet-body"
                  src={previewAsset("competition/case-3-exterior.webp")}
                  alt=""
                />
                <RingPresetArt
                  id={p.id}
                  front
                  staticPreview
                  particles={false}
                />
              </div>
              <span className="gp-lock-badge">
                <LockIcon />
                已锁定
              </span>
            </div>
            <div className="gp-preset-info">
              <div>
                <h4>{p.name}</h4>
                <p>{p.material}</p>
              </div>
              <button
                onClick={() => onRing(p.id)}
                aria-label={`试戴星环：${p.name}`}
                aria-pressed={ring === p.id}
              >
                {ring === p.id ? "试戴中" : "试戴"}
                <span aria-hidden="true"> ↗</span>
              </button>
            </div>
            <p className="gp-preset-description">{p.description}</p>
            <small className="gp-unlock-rule">
              {p.id === "jellyfish"
                ? "拟关联：水母设计作业 · 尚未配置"
                : "解锁条件待配置"}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
