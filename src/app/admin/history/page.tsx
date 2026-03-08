import { prisma } from '@/lib/prisma';
import { Video, JobHistory, JobStatus } from '@/generated/prisma/client';
import HistoryClient from './HistoryClient';

export const dynamic = 'force-dynamic';

type VideoWithHistory = Video & {
  jobHistory: JobHistory[];
};

export default async function HistoryPage() {
  const historyRows = await prisma.jobHistory.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: {
      video: {
        select: { id: true, title: true, filename: true, originalMetadata: true }
      }
    }
  });

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>
          Job History Timeline
        </h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Track the exact lifecycle timestamps of every video from upload to transcoding completion.</p>
      </div>

      <HistoryClient items={historyRows} />
    </div>
  );
}
