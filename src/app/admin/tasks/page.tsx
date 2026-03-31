'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock, AlertTriangle, CheckCircle, Trash2, Loader2, PauseCircle, PlayCircle } from 'lucide-react';

type QueueData = {
  counts: {
    wait: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  recentJobs: Array<{
    id: string;
    name: string;
    progress: number;
    status: string;
    failedReason?: string;
    timestamp: number;
    videoId?: string;
  }>;
  isPaused: boolean;
};

export default function TasksPage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/queue');
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
    // Poll every 3 seconds for live updates
    const intervalId = setInterval(fetchData, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isQueueActionLoading, setIsQueueActionLoading] = useState(false);

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel and delete this job? If the video was not completed it will be erased.')) return;
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
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>
          Task Queue Monitoring
        </h1>
        <p style={{ color: 'var(--muted-foreground)' }}>View real-time statistics of background video processing workers.</p>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleQueuePauseToggle}
            disabled={isQueueActionLoading || !data}
            className={data?.isPaused ? 'btn-primary' : 'btn-secondary'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {isQueueActionLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : data?.isPaused ? (
              <PlayCircle size={16} />
            ) : (
              <PauseCircle size={16} />
            )}
            {data?.isPaused ? 'Resume Queue' : 'Pause Queue'}
          </button>

          <span className={`badge ${data?.isPaused ? 'warning' : 'success'}`}>
            Queue {data?.isPaused ? 'Paused' : 'Running'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard title="Active Jobs" value={data?.counts.active || 0} icon={<Activity color="#3b82f6" />} />
        <StatCard title="Pending" value={data?.counts.wait || 0} icon={<Clock color="#f59e0b" />} />
        <StatCard title="Completed" value={data?.counts.completed || 0} icon={<CheckCircle color="#10b981" />} />
        <StatCard title="Failed" value={data?.counts.failed || 0} icon={<AlertTriangle color="#ef4444" />} />
      </div>

      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Active & Recent Jobs</h2>
      <div className="glass-panel" style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {isLoading && !data ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading queue details...</div>
        ) : !data || data.recentJobs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No active or recent jobs found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Video ID</th>
                <th>Type</th>
                <th>Status / Progress</th>
                <th>Created At</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recentJobs.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>#{job.id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{job.videoId || '-'}</td>
                  <td style={{ fontWeight: 500 }}>{job.name}</td>
                  <td>
                    {job.status === 'active' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--secondary)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${job.progress || 0}%`, background: '#3b82f6', transition: 'width 0.3s ease' }} />
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{job.progress || 0}%</span>
                      </div>
                    ) : job.status === 'failed' ? (
                      <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>
                        Failed: {job.failedReason}
                      </div>
                    ) : (
                      <span className="badge info">Waiting in Queue</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    {new Date(job.timestamp).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      onClick={() => handleDeleteJob(job.id)}
                      disabled={deletingId === job.id}
                      style={{ 
                        padding: '0.4rem', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: 'none', 
                        borderRadius: '0.375rem', 
                        color: '#ef4444', 
                        cursor: deletingId === job.id ? 'not-allowed' : 'pointer', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        transition: 'background-color 0.2s',
                        opacity: deletingId === job.id ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => !deletingId && (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)')}
                      onMouseLeave={(e) => !deletingId && (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
                      title="Cancel / Delete Job"
                    >
                      {deletingId === job.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>{title}</span>
        {icon}
      </div>
      <span style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.025em' }}>{value}</span>
    </div>
  );
}
