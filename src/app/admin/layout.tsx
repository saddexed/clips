import Link from 'next/link';
import { connection } from 'next/server';
import { Home, Image as ImageIcon, LogOut, Video as VideoIcon } from 'lucide-react';
import '../globals.css';
import { GlobalUploadProvider } from '@/components/GlobalUploadProvider';
import AdminReloadButton from '@/components/AdminReloadButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { btn } from '@/lib/ui-classes';
import { AdminNav } from './AdminNav';
import { getVideoLibraryStats } from '@/lib/database';
import { formatBytes, formatDuration } from '@/lib/utils';

export const metadata = {
  title: 'Clips Admin',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const stats = getVideoLibraryStats();

  return (
    <GlobalUploadProvider>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
            <Link href="/admin" className="flex items-baseline gap-1.5 font-display text-xl font-bold tracking-tight text-ink">
              <span aria-hidden className="size-2 -translate-y-0.5 rounded-full bg-line" />
              sd3xV
              <span className="ml-1 font-mono text-[0.6875rem] font-normal uppercase tracking-[0.08em] text-muted">admin</span>
            </Link>

            <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
              <AdminNav />
            </div>

            <dl aria-label="Video library totals" className="order-4 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted xl:order-none xl:w-auto xl:flex-nowrap">
              <div className="flex items-baseline gap-2 whitespace-nowrap">
                <dt className="sr-only">Clips</dt>
                <dd className="order-first flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-semibold tabular-nums text-ink">{stats.count.toLocaleString()} clips</span>
                  <span className="flex items-baseline gap-1.5 text-[0.6875rem] font-normal text-muted">
                    <span role="img" className="inline-flex items-end gap-0.5" title="Images" aria-label={`${stats.images} images`}>
                      ({stats.images} images)
                    </span>
                  </span>
                </dd>
              </div>
              {[
                ['used', formatBytes(stats.size)],
                ['total length', formatDuration(stats.duration)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-1 whitespace-nowrap">
                  <dt>{label}</dt>
                  <dd className="order-first font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="ml-auto flex items-center gap-1.5">
              <AdminReloadButton />
              <Link href="/" title="Home" aria-label="Home" className={btn('ghost', 'icon-sm')}>
                <Home size={16} />
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" title="Log out" aria-label="Log out" className={btn('ghost', 'icon-sm')}>
                <LogOut size={16} />
                </button>
              </form>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 pb-24 pt-8 sm:px-6">
          {children}
        </main>
      </div>
    </GlobalUploadProvider>
  );
}
