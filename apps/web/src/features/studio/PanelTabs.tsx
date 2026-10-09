type Tab = { value: string; label: string; disabled?: boolean };
export function PanelTabs({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inspector-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          data-tab-color={tab.value}
          role="tab"
          id={`${id}-${tab.value}-tab`}
          aria-controls={`${id}-${tab.value}-panel`}
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => onChange(tab.value)}
          onKeyDown={(e) => {
            const enabled = tabs.filter((t) => !t.disabled);
            const index = enabled.findIndex((t) => t.value === tab.value);
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? enabled.length - 1
                  : e.key === "ArrowRight"
                    ? (index + 1) % enabled.length
                    : e.key === "ArrowLeft"
                      ? (index - 1 + enabled.length) % enabled.length
                      : -1;
            if (next < 0) return;
            e.preventDefault();
            onChange(enabled[next].value);
            document
              .getElementById(`${id}-${enabled[next].value}-tab`)
              ?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
