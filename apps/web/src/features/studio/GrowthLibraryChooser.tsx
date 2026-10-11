import { useState } from "react";
import {
  GrowthPresetIds,
  GrowthPresets,
  type GrowthPresetId,
} from "@colorverse/contracts";
import { GrowthPresetPreview } from "./GrowthPresetPreview";
export function GrowthLibraryChooser({
  selected,
  color,
  seed,
  disabled,
  onSelect,
}: {
  selected: GrowthPresetId;
  color: string;
  seed: number;
  disabled: boolean;
  onSelect: (id: GrowthPresetId) => void;
}) {
  const [category, setCategory] = useState("全部"),
    [search, setSearch] = useState("");
  const categories = [
    "全部",
    ...new Set(GrowthPresetIds.map((id) => GrowthPresets[id].category)),
  ];
  const visible = GrowthPresetIds.filter((id) => {
    const p = GrowthPresets[id];
    return (
      (category === "全部" || p.category === category) &&
      (!search ||
        [p.name, ...p.keywords]
          .join(" ")
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
    );
  });
  return (
    <>
      <div className="growth-library-tools">
        <input
          aria-label="搜索成长造型"
          placeholder="搜索造型、感觉或颜色…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>
          {GrowthPresetIds.length} 种造型 · 已选 {GrowthPresets[selected].name}
        </span>
      </div>
      <div className="growth-library-categories" aria-label="成长造型分类">
        {categories.map((c) => (
          <button
            key={c}
            aria-pressed={c === category}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="element-library-cards">
        {visible.map((id) => (
          <button
            key={id}
            disabled={disabled}
            aria-label={`选择${GrowthPresets[id].name}`}
            aria-pressed={id === selected}
            onClick={() => onSelect(id)}
          >
            <GrowthPresetPreview id={id} color={color} seed={seed} />
            <span>{GrowthPresets[id].name}</span>
            <small>{GrowthPresets[id].category}</small>
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className="muted">没有找到造型，试试其他关键词。</p>
      )}
    </>
  );
}
