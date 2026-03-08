"use client";

import { useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

export function VideoThumbnail({ videoId, duration }: { videoId: string, duration: number | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const handleRef = (el: HTMLVideoElement | null) => {
    if (videoRef.current && el === null) {
      // Element is unmounting (e.g., navigating away or mouse leaving)
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    videoRef.current = el;
  };
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  const src = `/api/videos/stream/${videoId}`;
  const thumbSrc = `/t/${videoId}`;

  return (
    <div 
      style={{ aspectRatio: '16/9', position: 'relative', background: 'var(--secondary)', overflow: 'hidden' }}
      onMouseEnter={() => {
        setIsHovered(true);
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {isHovered ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <video 
            ref={handleRef}
            src={src}
            muted={isMuted}
            autoPlay
            loop
            playsInline
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover',
              transition: 'transform 0.3s ease',
              transform: 'scale(1.05)',
              backgroundColor: '#000'
            }}
          />
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              backdropFilter: 'blur(4px)'
            }}
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <img 
            src={thumbSrc}
            alt="Video Thumbnail"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              background: 'rgba(0,0,0,0.6)', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}>
              <Play size={24} color="#fafafa" fill="#fafafa" style={{ marginLeft: '4px' }} />
            </div>
          </div>
        </div>
      )}
      {duration ? (
        <span style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontWeight: 500, pointerEvents: 'none', transition: 'opacity 0.2s', opacity: isHovered ? 0 : 1 }}>
          {formatDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
