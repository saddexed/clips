import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export function SiteHeader({
  backHref,
  narrow = false,
  children,
  actions,
}: {
  backHref?: string;
  narrow?: boolean;
  children?: React.ReactNode;
  /** Sits to the left of the theme toggle. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line-soft bg-bg/80 backdrop-blur-xl">
      <div
        className={cn(
          "mx-auto flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:flex-nowrap sm:px-6",
          children ? "min-h-14" : "h-14",
          narrow ? "max-w-player" : "max-w-7xl",
        )}
      >
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back to all clips"
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-chip hover:text-chip-ink"
            >
              <ArrowLeft size={18} />
            </Link>
          ) : null}
          <Link
            href="/"
            className="group flex items-baseline gap-1.5 font-display text-xl font-bold tracking-tight text-ink"
          >
            <span
              aria-hidden
              className="size-2 -translate-y-0.5 rounded-full bg-line transition-colors group-hover:bg-accent"
            />
            sd3xV
          </Link>
        </div>

        {children ? (
          <div className="order-last w-full basis-full sm:order-none sm:mx-auto sm:w-auto sm:min-w-0 sm:flex-1 sm:basis-auto">
            {children}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
