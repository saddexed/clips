import { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  
  if (!video || video.status !== 'COMPLETED') {
    return { title: 'Not Found' };
  }
  
  const title = video.title || video.filename;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const imageUrl = `${appUrl}/t/${id}`;
  const videoUrl = `${appUrl}/api/videos/stream/${id}`;

  return {
    title,
    description: video.description || `Watch ${title}`,
    openGraph: {
      title,
      description: video.description || `Watch ${title}`,
      images: [{ url: imageUrl }],
      videos: [{ url: videoUrl, type: 'video/webm' }],
      type: 'video.other',
    },
    twitter: {
      card: 'player',
      title,
      description: video.description || `Watch ${title}`,
      images: [imageUrl],
      players: [
         {
           playerUrl: `${appUrl}/v/${id}`,
           streamUrl: videoUrl,
           width: video.width || 1280,
           height: video.height || 720,
         }
      ],
    }
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });

  if (!video || video.status !== 'COMPLETED') {
    notFound();
  }

  return (
    <>
      <style>{`
        body {
          margin: 0;
          padding: 0;
          background: #000;
          overflow: hidden;
        }
      `}</style>
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          src={`/api/videos/stream/${id}`}
          controls
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          poster={`/t/${id}`}
        />
      </div>
    </>
  );
}
