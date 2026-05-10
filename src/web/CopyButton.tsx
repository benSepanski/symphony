import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  COPY_FEEDBACK_MS,
  getClipboardWriter,
  writeToClipboard,
  type ClipboardWriter,
  type CopyState,
} from "./copyButtonUtils.js";

interface Props {
  value: string;
  label: string;
  size?: "sm" | "md";
  className?: string;
  writer?: ClipboardWriter;
}

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "px-1.5 py-0.5 text-[11px]",
  md: "px-2 py-1 text-xs",
};

export function CopyButton({ value, label, size = "sm", className, writer }: Props) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await writeToClipboard(value, writer ?? getClipboardWriter());
    setState(ok ? "copied" : "error");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
  };

  const sizeClass = SIZE_CLASS[size];
  const stateClass =
    state === "copied"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
      : state === "error"
        ? "border-rose-500/50 bg-rose-500/10 text-rose-200"
        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-100 hover:border-slate-700";
  const announce = state === "copied" ? "Copied" : state === "error" ? "Copy failed" : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center rounded border font-mono leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${sizeClass} ${stateClass} ${
        className ?? ""
      }`}
    >
      <span aria-hidden="true">{state === "copied" ? "✓" : state === "error" ? "!" : "⧉"}</span>
      {announce && (
        <span role="status" aria-live="polite" className="sr-only">
          {announce}
        </span>
      )}
    </button>
  );
}
