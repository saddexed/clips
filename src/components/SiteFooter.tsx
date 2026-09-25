export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line-soft">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-baseline gap-1.5">
          <span aria-hidden className="size-1.5 -translate-y-0.5 rounded-full bg-line" />
          <span className="font-display text-sm font-bold tracking-tight text-ink">sd3xV</span>
          <span className="text-sm text-muted">a random assortment of video clips</span>
        </div>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
          {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
