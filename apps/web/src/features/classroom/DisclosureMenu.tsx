import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { InterfaceIcon } from "./InterfaceIcon";
export function DisclosureMenu({
  label,
  identity = false,
  disabled = false,
  children,
}: {
  label: string;
  identity?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || !host.current || !panel.current) return;
    const anchor = host.current.getBoundingClientRect(),
      box = panel.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.right - box.width, innerWidth - box.width - 8),
      ),
      top:
        anchor.bottom + box.height + 8 < innerHeight
          ? anchor.bottom + 8
          : Math.max(8, anchor.top - box.height - 8),
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    const reposition = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  return (
    <div
      className={`disclosure-menu ${identity ? "identity-menu" : "row-more-menu"}`}
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          host.current?.querySelector("button")?.focus();
          event.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        className="disclosure-trigger"
        aria-label={identity ? `${label}身份菜单` : label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <InterfaceIcon name={identity ? "user" : "more"} />
        {identity && (
          <>
            <span>{label}</span>
            <InterfaceIcon name="chevron" />
          </>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          style={position}
          className="disclosure-panel"
          aria-label={label}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button:not(:disabled)"))
              setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
