import { cn } from "@/lib/utils";

// Plain class helpers - safe to call from both server and client components.

type ButtonVariant = "solid" | "soft" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon" | "icon-sm";

export function btn(variant: ButtonVariant = "soft", size: ButtonSize = "md") {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" && "h-9 px-4 text-sm",
    size === "sm" && "h-7 px-3 text-xs",
    size === "icon" && "size-9",
    size === "icon-sm" && "size-8",
    variant === "solid" && "bg-solid text-solid-ink enabled:hover:opacity-85",
    variant === "soft" && "border border-line-soft bg-surface text-ink enabled:hover:bg-chip enabled:hover:text-chip-ink",
    variant === "ghost" && "text-muted enabled:hover:bg-chip enabled:hover:text-chip-ink",
    variant === "danger" && "text-bad enabled:hover:bg-bad/12",
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line-soft bg-bg px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-line focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-2/60 disabled:text-muted";

export const labelClass = "font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted";

export const panelClass = "rounded-2xl bg-surface ring-1 ring-line-soft";

// Tag chips get a tint keyed off the tag name, so the same tag is always the same
// shade and neighbouring tags are usually different ones. Listed literally so the
// Tailwind scanner picks the classes up.
const TAG_TINTS = ["bg-tag-1", "bg-tag-2", "bg-tag-3", "bg-tag-4", "bg-tag-5"] as const;

export function tagTint(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return TAG_TINTS[hash % TAG_TINTS.length];
}

export const tableClass = cn(
  "w-full border-collapse text-left text-sm",
  "[&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:font-mono [&_th]:text-[0.6875rem] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-muted",
  "[&_thead_tr]:border-b [&_thead_tr]:border-line-soft",
  "[&_td]:px-4 [&_td]:py-3 [&_td]:align-middle",
  "[&_tbody_tr]:border-b [&_tbody_tr]:border-line-soft [&_tbody_tr:last-child]:border-0 [&_tbody_tr]:transition-colors",
);
