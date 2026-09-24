'use client';

import { useState, useEffect } from 'react';
import { Upload, PlayCircle, Eye, EyeOff, Pencil, Trash2, ShieldQuestion, AlertTriangle, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

export default function HistoryClient({ items, page, totalPages }: { items: FlatHistoryItem[]; page: number; totalPages: number }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="glass-panel" style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {items.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <p>No job history available.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Action</th>
              <th style={{ width: '50%' }}>Target / Detail</th>
              <th style={{ width: '15%' }}>Video ID</th>
              <th style={{ width: '20%' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {items.map(job => {
              const { icon, label, color } = getActionDetails(job);
              // Show completedAt where available (i.e. when the action actually finished), else startedAt
              const timeStamp = job.completedAt || job.startedAt || new Date();
              const isUpload = job.jobType === 'UPLOAD';
              
              // Determine display name
              const displayName = job.video?.title || job.video?.filename || job.metadata?.filename || 'Unknown File';

              return (
                <tr key={job.id} style={{ transition: 'background-color 0.2s' }}>
                  <td style={{ padding: '0.6rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: color, fontWeight: 500 }}>
                      {icon}
                      {label}
                      {job.status === 'FAILED' && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: 'auto' }} />}
                    </div>
                  </td>
                  <td style={{ padding: '0.6rem 1rem' }}>
                    <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>
                      {displayName}
                    </div>
                    {isUpload && job.originalSize > 0 && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>
                        Size: {formatBytes(job.originalSize)}
                      </div>
                    )}
                    {job.jobType === 'TRANSCODE' && Number(job.processedSize) > 0 && (
                      Number(job.processedSize) > Number(job.originalSize) ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>
                          Kept original ({formatBytes(job.originalSize)}) &lt;- ({formatBytes(job.processedSize)})
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>
                          Result: {formatBytes(job.processedSize)}
                        </div>
                      )
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                      {job.videoId ? job.videoId : (job.metadata?.videoId || job.metadata?.originalUUID ? (job.metadata.videoId || job.metadata.originalUUID) : <span style={{color: '#ef4444'}}>DELETED</span>)}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 1rem' }}>
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                      {formatTimestamp(new Date(timeStamp))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', padding: '1rem', alignItems: 'center' }}>
        <button className="btn-secondary" disabled={page <= 1} onClick={() => router.push(`/admin/history?page=${page - 1}`)} title="Previous page"><ChevronLeft size={16} /></button>
        <span>Page {page} of {totalPages}</span>
        <button className="btn-secondary" disabled={page >= totalPages} onClick={() => router.push(`/admin/history?page=${page + 1}`)} title="Next page"><ChevronRight size={16} /></button>
      </div>}
    </div>
  );
}

function getActionDetails(job: FlatHistoryItem) {
  switch (job.jobType) {
    case 'UPLOAD':
      return { icon: <Upload size={16} />, label: 'Upload', color: '#10b981' };
    case 'TRANSCODE':
      return { icon: <PlayCircle size={16} />, label: 'Transcode', color: '#3b82f6' };
    case 'EDIT':
      return { icon: <Pencil size={16} />, label: 'Edit', color: '#f59e0b' };
    case 'HIDE': {
      const wasHidden = job.metadata?.isHidden;
      if (wasHidden) 
        return { icon: <EyeOff size={16} />, label: 'Hidden', color: '#f97316' };
      else
        return { icon: <Eye size={16} />, label: 'Visible', color: '#10b981' };
    }
    case 'DELETE':
      return { icon: <Trash2 size={16} />, label: 'Delete', color: '#ef4444' };
    case 'CANCELLED':
      return { icon: <AlertTriangle size={16} />, label: 'Cancelled', color: '#ef4444' };
    case 'RESTORE':
      return { icon: <RotateCcw size={16} />, label: 'Restore', color: '#10b981' };
    default:
      return { icon: <ShieldQuestion size={16} />, label: job.jobType, color: 'var(--foreground)' };
  }
}

function formatBytes(bytes: number | bigint | null) {
  if (bytes === null) return '-';
  const val = Number(bytes);
  if (val === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(val) / Math.log(k));
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTimestamp(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const day = ordinal(date.getDate());
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const year = date.getFullYear().toString().slice(2);
  return `${h}:${m}, ${day} ${month} ${year}`;
}
