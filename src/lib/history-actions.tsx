import type { ReactNode } from 'react';
import { Upload, PlayCircle, Eye, EyeOff, Pencil, Trash2, ShieldQuestion, AlertTriangle, RotateCcw } from 'lucide-react';
import type { Tone } from '@/components/ui';
import { formatBytes } from '@/lib/utils';

// Shared presentation for job-history events (global History page and per-clip History tab).

export type HistoryEvent = {
  jobType: string;
  status: string;
  originalSize: bigint | number;
  processedSize: bigint | number;
  metadata: any;
  errorMessage?: string | null;
};

export function getActionDetails(job: HistoryEvent, iconSize = 12): { icon: ReactNode; label: string; tone: Tone } {
  switch (job.jobType) {
    case 'UPLOAD':
      return { icon: <Upload size={iconSize} />, label: 'Upload', tone: 'ok' };
    case 'TRANSCODE':
      return { icon: <PlayCircle size={iconSize} />, label: 'Transcode', tone: 'info' };
    case 'EDIT':
      return { icon: <Pencil size={iconSize} />, label: 'Edit', tone: 'warn' };
    case 'HIDE': {
      const wasHidden = job.metadata?.isHidden;
      if (wasHidden)
        return { icon: <EyeOff size={iconSize} />, label: 'Hidden', tone: 'hide' };
      else
        return { icon: <Eye size={iconSize} />, label: 'Visible', tone: 'show' };
    }
    case 'DELETE':
      return { icon: <Trash2 size={iconSize} />, label: 'Delete', tone: 'bad' };
    case 'CANCELLED':
      return { icon: <AlertTriangle size={iconSize} />, label: 'Cancelled', tone: 'bad' };
    case 'RESTORE':
      return { icon: <RotateCcw size={iconSize} />, label: 'Restore', tone: 'restore' };
    default:
      return { icon: <ShieldQuestion size={iconSize} />, label: job.jobType, tone: 'neutral' };
  }
}

export function HistorySizeDetail({ job }: { job: HistoryEvent }) {
  if (job.jobType === 'UPLOAD' && Number(job.originalSize) > 0) {
    return <div className="mt-0.5 font-mono text-xs text-muted">{formatBytes(job.originalSize)}</div>;
  }
  if (job.jobType === 'TRANSCODE' && Number(job.processedSize) > 0) {
    return Number(job.processedSize) > Number(job.originalSize) ? (
      <div className="mt-0.5 font-mono text-xs text-muted">
        Kept original {formatBytes(job.originalSize)} <span className="text-warn">(result was {formatBytes(job.processedSize)})</span>
      </div>
    ) : (
      <div className="mt-0.5 font-mono text-xs text-muted">
        {formatBytes(job.originalSize)} <span className="opacity-70">→</span> {formatBytes(job.processedSize)}
      </div>
    );
  }
  return null;
}

export { formatBytes } from '@/lib/utils';
