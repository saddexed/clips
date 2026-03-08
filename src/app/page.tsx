import Link from 'next/link';
import { prisma } from '../lib/prisma';
import { Video } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { VideoThumbnail } from '@/components/VideoThumbnail';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const videos = await prisma.video.findMany({
    where: { status: 'COMPLETED', deletedAt: null, isHidden: false },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, width: '100%', background: 'var(--glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontSize: '1.5rem', fontWeight: 800, textDecoration: 'none', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ background: 'var(--foreground)', color: 'var(--background)', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Video size={20} fill="currentColor" />
            </div>
            Clips
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/admin" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.875rem' }}>Admin Dashboard</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      
      <main className="page-container" style={{ flex: 1 }}>
        <div style={{ padding: '4rem 0 3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className="text-gradient" style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '1rem' }}>
            Discover Epic Moments
          </h2>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '1.125rem', maxWidth: '600px', lineHeight: 1.6 }}>
            Browse the most recent gameplay highlights, clutch plays, and unforgettable moments captured by the community.
          </p>
        </div>

        {videos.length === 0 ? (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', borderRadius: 'var(--radius)', color: 'var(--muted-foreground)' }}>
            No videos available yet. Check back later!
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '1.5rem' 
          }}>
            {videos.map(video => (
              <Link key={video.id} href={`/watch/${video.id}`} style={{ textDecoration: 'none' }}>
                <div 
                  className="glass-panel video-card-hover" 
                  style={{ 
                    borderRadius: 'var(--radius)', 
                    overflow: 'hidden', 
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <VideoThumbnail 
                    videoId={video.id} 
                    duration={video.duration} 
                  />
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {video.title || video.filename}
                    </h3>
                    <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: 'auto', paddingTop: '1rem' }}>
                       {new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
