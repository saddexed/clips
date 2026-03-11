import { prisma } from '@/lib/prisma';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Share2, Download, Link2, Video } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import CommentSection from '@/components/CommentSection';
import ActionBar from './ActionBar';
import SafeVideoPlayer from '@/components/SafeVideoPlayer';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  
  if (!video || video.status !== 'COMPLETED') {
    return { title: 'Not Found' };
  }
  
  const title = video.title || video.filename;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const imageUrl = `${appUrl}/t/${id}`;
  const videoUrl = `${appUrl}/v/${id}`;

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
           playerUrl: `${appUrl}/w/${id}`,
           streamUrl: videoUrl,
           width: video.width || 1280,
           height: video.height || 720,
         }
      ],
    }
  };
}


export default async function WatchPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      tags: true,
      comments: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!video || video.status !== 'COMPLETED') {
    notFound();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, width: '100%', background: 'var(--glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', padding: '1rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%', textDecoration: 'none', display: 'flex' }}>
              <ArrowLeft size={18} />
            </Link>
            <Link href="/" style={{ fontSize: '1.25rem', fontWeight: 800, textDecoration: 'none', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ background: 'var(--foreground)', color: 'var(--background)', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Video size={18} fill="currentColor" />
              </div>
              <span className="hidden sm:inline">Clips</span>
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="page-container" style={{ flex: 1, maxWidth: '1000px', padding: '2rem 1rem' }}>
        {/* Video Player Segment */}
        <div className="glass-panel" style={{ borderRadius: 'calc(var(--radius) * 1.5)', overflow: 'hidden', background: '#000', marginBottom: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {video.mediaType === 'IMAGE' ? (
            <img 
              src={`/v/${video.id}`} 
              alt={video.title || video.filename} 
              style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', maxHeight: '80vh' }} 
            />
          ) : (
            <SafeVideoPlayer src={`/v/${video.id}`} />
          )}
        </div>

        {/* Video Metadata */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {video.title || video.filename}
          </h1>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
            
            {/* Left Data */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={16} /> 
                {new Date(video.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              {video.width && video.height && (
                <span>{video.width}x{video.height}</span>
              )}
            </div>

            {/* Right Action Bar */}
            <ActionBar videoId={video.id} />
          
          </div>

          {/* Description & Tags */}
          {video.description && (
            <p style={{ color: 'var(--foreground)', lineHeight: 1.6, marginBottom: '1.5rem', whiteSpace: 'pre-wrap' }}>
              {video.description}
            </p>
          )}

          {video.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
              {video.tags.map(tag => (
                <span key={tag.id} style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 500 }}>
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Comment Section */}
        <CommentSection videoId={video.id} initialComments={video.comments} />
      </main>
    </div>
  );
}
