'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock, AlertTriangle, CheckCircle, Trash2, Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader, Pager, StatusPill, btn, panelClass, tableClass, type Tone } from '@/components/ui';

type QueueData = {
  counts: {
    wait: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  recentJobs: Array<{
    id: number;
    name: string;
    progress: number;
    status: string;
    failedReason?: string;
    timestamp: number;
    videoId: string;
    title?: string | null;
    originalSize: number;
    processedSize: number;
  }>;
  isPaused: boolean;
  page: number;
  totalPages: number;
};

export default function TasksPage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/queue?page=${page}&limit=50`, { cache: 'no-store' });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch queue data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 15000);
    const refresh = () => void fetchData();
    window.addEventListener('admin-data-refresh', refresh);
    return () => { clearInterval(intervalId); window.removeEventListener('admin-data-refresh', refresh); };
  }, [page]);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isQueueActionLoading, setIsQueueActionLoading] = useState(false);

  const handleDeleteJob = async (jobId: number) => {
    if (!confirm('Are you sure you want to cancel and delete this job? If the video was not completed it will be moved to Trash.')) return;
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/queue/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        // Optimistically remove from UI
        setData(prev => prev ? {
          ...prev,
          recentJobs: prev.recentJobs.filter(j => j.id !== jobId)
        } : null);
      } else {
        const err = await res.json();
        alert(`Failed to delete job: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Network error deleting job');
    } finally {
      setDeletingId(null);
    }
  };

  const handleQueuePauseToggle = async () => {
    if (!data) return;

    setIsQueueActionLoading(true);
    try {
      const action = data.isPaused ? 'resume' : 'pause';
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to ${action} queue: ${err.error || 'Unknown error'}`);
        return;
      }

      const payload = await res.json();
      setData((prev) => (prev ? { ...prev, isPaused: payload.isPaused } : prev));
    } catch (error) {
      console.error(error);
      alert('Network error while updating queue state');
    } finally {
      setIsQueueActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Queue"
        meta={
          <>
            <CountChip count={data?.counts.active || 0} label="active" tone="info" icon={<Activity size={12} />} />
            <CountChip count={data?.counts.wait || 0} label="waiting" tone="warn" icon={<Clock size={12} />} />
            <CountChip count={data?.counts.completed || 0} label="done" tone="ok" icon={<CheckCircle size={12} />} />
            <CountChip count={data?.counts.failed || 0} label="failed" tone="bad" icon={<AlertTriangle size={12} />} />
          </>
        }
      >
        <QueueStateSwitch
          isPaused={data?.isPaused ?? false}
          disabled={isQueueActionLoading || !data}
          loading={isQueueActionLoading}
          onToggle={handleQueuePauseToggle}
        />
      </PageHeader>

      <div className={cn(panelClass, 'overflow-x-auto')}>
        {isLoading && !data ? (
          <div className="px-6 py-16 text-center text-muted">Loading the queue…</div>
        ) : !data || data.recentJobs.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted">The queue is empty. New uploads show up here while they convert.</div>
        ) : (
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Video</th>
                <th>Progress</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recentJobs.map((job) => (
                <tr key={job.id} className={cn('hover:bg-chip/35', job.status === 'failed' && 'bg-bad/5')}>
                  <td className="font-mono text-xs text-muted">#{job.id}</td>
                  <td className="max-w-[22rem]">
                    <div className={cn('truncate font-medium', job.title ? 'text-ink' : 'italic text-muted')}>{job.title || 'Deleted video'}</div>
                    <div className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted">{job.videoId || '—'}</div>
                  </td>
                  <td className="min-w-[16rem]">
                    <JobProgress job={job} />
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {new Date(job.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      {job.status !== 'completed' && (
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={deletingId === job.id}
                          className={btn('danger', 'icon-sm')}
                          title="Cancel / Delete Job"
                          aria-label="Cancel and delete job"
                        >
                          {deletingId === job.id ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
      )}
    </div>
  );
}

function JobProgress({ job }: { job: QueueData['recentJobs'][number] }) {
  if (job.status === 'active') {
    return (
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-info transition-[width] duration-300" style={{ width: `${job.progress || 0}%` }} />
        </div>
        <span className="w-10 text-right font-mono text-xs text-ink">{job.progress || 0}%</span>
      </div>
    );
  }

  if (job.status === 'completed') {
    if (!job.processedSize) return <StatusPill tone="ok" icon={<CheckCircle size={12} />}>Completed</StatusPill>;
    const change = job.originalSize ? Math.round(((job.originalSize - job.processedSize) / job.originalSize) * 100) : 0;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap font-mono text-xs text-ink">
          {formatBytes(job.originalSize)} <span className="text-muted">→</span> {formatBytes(job.processedSize)}
        </span>
        <StatusPill tone={change >= 0 ? 'ok' : 'warn'}>
          {change >= 0 ? `${change}% smaller` : `${Math.abs(change)}% larger`}
        </StatusPill>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusPill tone="bad" icon={<AlertTriangle size={12} />}>Failed</StatusPill>
        {job.failedReason ? <span className="break-words text-xs text-bad">{job.failedReason}</span> : null}
      </div>
    );
  }

  return <StatusPill tone="info" icon={<Clock size={12} />}>Waiting</StatusPill>;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Number((bytes / 1024 ** index).toFixed(2))} ${units[index]}`;
}

function CountChip({ count, label, tone, icon }: { count: number; label: string; tone: Tone; icon: React.ReactNode }) {
  // Zero counts stay neutral so only states with jobs draw attention
  return (
    <StatusPill tone={count > 0 ? tone : 'neutral'} icon={icon}>
      <span className="font-mono tabular-nums">{count}</span> {label}
    </StatusPill>
  );
}

function QueueStateSwitch({ isPaused, disabled, loading, onToggle }: { isPaused: boolean; disabled: boolean; loading: boolean; onToggle: () => void }) {
  const options = [
    { paused: false, label: 'Running', icon: PlayCircle, dot: 'bg-ok' },
    { paused: true, label: 'Paused', icon: PauseCircle, dot: 'bg-warn' },
  ];

  return (
    <div role="radiogroup" aria-label="Queue state" className="flex items-center rounded-full border border-line-soft bg-surface p-0.5">
      {options.map(({ paused, label, icon: Icon, dot }) => {
        const active = isPaused === paused;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || active}
            onClick={onToggle}
            title={active ? `Queue is ${label.toLowerCase()}` : paused ? 'Pause queue' : 'Resume queue'}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors disabled:cursor-default',
              active ? 'bg-bg text-ink shadow-sm ring-1 ring-line-soft' : 'cursor-pointer text-muted enabled:hover:text-ink',
            )}
          >
            {loading && !active ? (
              <Loader2 size={14} className="animate-spin" />
            ) : active ? (
              <span className={cn('size-2 rounded-full', dot)} />
            ) : (
              <Icon size={14} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
