'use client';

import { useEffect, useState } from 'react';

type QueueData = {
  counts: {
    wait: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
};

export default function WorkerStatusBadge() {
  const [activeJobs, setActiveJobs] = useState<number>(0);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    let isMounted = true;

    const fetchQueueStatus = async () => {
      try {
        const res = await fetch('/api/queue');
        if (res.ok) {
          const data: QueueData = await res.json();
          if (isMounted) setActiveJobs(data.counts.active + data.counts.wait);
        }
      } catch (err) {
        // Silently fail on network error to avoid layout jumping
      }
    };

    fetchQueueStatus();
    const intervalId = setInterval(fetchQueueStatus, 3000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  if (!isClient) return null; // Avoid hydration mismatch

  if (activeJobs > 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#60a5fa' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 8px #3b82f6', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        Processing ({activeJobs})
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--muted-foreground)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
      Idle
    </span>
  );
}
