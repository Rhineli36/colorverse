import { useId, useRef, useState } from "react";
import "./comment-composer.css";

const emojis = [
  ["😊", "微笑"],
  ["👍", "赞"],
  ["👏", "鼓掌"],
  ["❤️", "爱心"],
  ["✨", "闪光"],
  ["🌈", "彩虹"],
  ["🎨", "调色板"],
  ["💡", "灵感"],
];
const maxLength = 500;

export function CommentComposer({
  label,
  placeholder,
  value,
  disabled,
  onChange,
  onSend,
  sendLabel = "发送留言",
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  sendLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <div
      className="comment-composer"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          picker.current?.focus();
        }
      }}
    >
      <textarea
        ref={input}
        rows={2}
        aria-label={label}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="comment-composer-actions">
        <button
          ref={picker}
          type="button"
          aria-label="选择留言表情"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          ☺
        </button>
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSend}
        >
          {sendLabel}
        </button>
      </div>
      {open && (
        <div
          id={id}
          role="group"
          aria-label="常用留言表情"
          className="comment-emoji-picker"
        >
          {emojis.map(([emoji, name]) => (
            <button
              key={emoji}
              type="button"
              aria-label={`插入${name}`}
              title={name}
              onClick={() => {
                const field = input.current!;
                const from = field.selectionStart,
                  to = field.selectionEnd;
                const next = value.slice(0, from) + emoji + value.slice(to);
                if (next.length > maxLength) return;
                onChange(next);
                setOpen(false);
                requestAnimationFrame(() => {
                  field.focus();
                  field.setSelectionRange(
                    from + emoji.length,
                    from + emoji.length,
                  );
                });
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
