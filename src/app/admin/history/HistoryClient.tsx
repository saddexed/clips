'use client';

import { Fragment, useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Pager, StatusPill, panelClass, tableClass } from '@/components/ui';
import { HistorySizeDetail, getActionDetails } from '@/lib/history-actions';

type FlatHistoryItem = {
  id: string;
  videoId: string | null;
  jobType: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  originalSize: bigint | number;
  processedSize: bigint | number;
  metadata: any;
  video: { id: string; title: string; filename: string; originalMetadata: any; } | null;
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function HistoryClient({ items, page, totalPages }: { items: FlatHistoryItem[]; page: number; totalPages: number }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(panelClass, 'overflow-x-auto')}>
        {items.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted">
            Nothing has happened yet. Uploads, edits and deletions will appear here.
          </div>
        ) : (
          <table className={cn(tableClass, 'min-w-[720px]')}>
            <thead>
              <tr>
                <th className="w-[9rem]">Time</th>
                <th className="w-[10rem]">Action</th>
                <th>Clip</th>
                <th className="w-[20rem]">Video ID</th>
              </tr>
            </thead>
            <tbody>
              {items.map((job, index) => {
                const { icon, label, tone } = getActionDetails(job);
                // Show completedAt where available (i.e. when the action actually finished), else startedAt
                const timeStamp = new Date(job.completedAt || job.startedAt || new Date());
                const previous = items[index - 1];
                const previousDay = previous ? dayKey(new Date(previous.completedAt || previous.startedAt || new Date())) : null;
                const showDay = dayKey(timeStamp) !== previousDay;

                // Determine display name
                const displayName = job.video?.title || job.video?.filename || job.metadata?.filename || 'Unknown File';
                const videoId = job.videoId || job.metadata?.videoId || job.metadata?.originalUUID || null;

                return (
                  <Fragment key={job.id}>
                    {showDay && (
                      <tr className="bg-bg/60">
                        <td colSpan={4} className="!py-2 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted">
                          {formatDay(timeStamp)}
                        </td>
                      </tr>
                    )}
                    <tr className={cn('hover:bg-chip/35', job.status === 'FAILED' && 'bg-bad/5')}>
                      <td className="whitespace-nowrap font-mono text-xs text-muted">
                        {formatTime(timeStamp)}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatusPill tone={tone} icon={icon}>{label}</StatusPill>
                          {job.status === 'FAILED' && <AlertTriangle size={14} className="text-bad" aria-label="Failed" />}
                        </div>
                      </td>
                      <td className="max-w-[28rem]">
                        <div className={cn('truncate font-medium', job.video ? 'text-ink' : 'text-muted')}>
                          {displayName}
                        </div>
                        <HistorySizeDetail job={job} />
                      </td>
                      <td className="font-mono text-[0.6875rem]">
                        {videoId ? (
                          <span className="text-muted">{videoId}</span>
                        ) : (
                          <span className="uppercase tracking-[0.08em] text-bad">Deleted</span>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <Pager page={page} totalPages={totalPages} onPage={(next) => router.push(`/admin/history?page=${next}`)} />
      )}
    </div>
  );
}

function formatDay(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
