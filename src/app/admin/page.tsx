import { prisma } from '../../lib/prisma';
import VideoTable from './VideoTable';

export const dynamic = 'force-dynamic'; // Ensures this page isn't statically cached, always showing fresh DB state

export default async function AdminManagePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; tag?: string }>;
}) {
  await searchParams;

  const videos = await prisma.video.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: { uploadedAt: 'desc' },
    include: {
      tags: true, // Eager load tags for the editor
    }
  });

  console.log('AdminManagePage fetched', videos.length, 'videos');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>
            Media Library
          </h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Manage your uploaded clips and their processing statuses.</p>
        </div>
      </div>

      <VideoTable initialVideos={videos} />
    </div>
  );
}
