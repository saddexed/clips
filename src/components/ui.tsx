"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { btn, labelClass } from "@/lib/ui-classes";

// Client-only components. Class helpers live in @/lib/ui-classes so server components can use them.
export { btn, inputClass, labelClass, panelClass, tableClass } from "@/lib/ui-classes";

export function PageHeader({ title, meta, children }: { title: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "restore" | "show" | "hide" | "neutral";

export function StatusPill({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "ok" && "bg-ok/12 text-ok",
        tone === "warn" && "bg-warn/14 text-warn",
        tone === "bad" && "bg-bad/12 text-bad",
        tone === "info" && "bg-info/14 text-info",
        tone === "restore" && "bg-restore/14 text-restore",
        tone === "show" && "bg-show/14 text-show",
        tone === "hide" && "bg-hide/16 text-hide",
        tone === "neutral" && "bg-surface-2 text-muted",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Pager({
  page,
  totalPages,
  onPage,
  summary,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  summary?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={labelClass}>
        Page {page} of {Math.max(totalPages, 1)}
        {summary ? ` · ${summary}` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btn("soft", "icon-sm")}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className={btn("soft", "icon-sm")}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex rounded-full border border-line-soft bg-bg p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors",
            value === option.value ? "bg-solid font-medium text-solid-ink" : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1b2a]/55 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "animate-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface text-ink shadow-[0_32px_80px_-24px_rgba(13,27,42,0.6)] ring-1 ring-line-soft",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line-soft px-6 py-4">
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className={btn("ghost", "icon-sm")} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-bg/40 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
