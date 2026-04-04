"use client";

import { useRef, useState, useCallback } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

export function VideoThumbnail({ videoId, duration, mediaType = 'VIDEO' }: { videoId: string, duration: number | null, mediaType?: 'VIDEO' | 'IMAGE' }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [isHovered, setIsHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false); // true once first frame is decoded
  const [isMuted, setIsMuted] = useState(true);
  
  const src = `/v/${videoId}`;
  const thumbSrc = `/t/${videoId}`;

  const handleRef = useCallback((el: HTMLVideoElement | null) => {
    if (videoRef.current && el === null) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    } else if (el && el.getAttribute('src') !== src) {
      el.setAttribute('src', src);
    }
    videoRef.current = el;
  }, [src]);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopHover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsHovered(false);
    setVideoReady(false);
  };

  return (
    <div 
      style={{ aspectRatio: '16/9', position: 'relative', background: 'var(--secondary)', overflow: 'hidden' }}
      onMouseEnter={() => {
        hoverTimerRef.current = setTimeout(() => {
          setIsHovered(true);
          if (mediaType === 'VIDEO' && videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        }, 250);
      }}
      onMouseLeave={stopHover}
      onPointerDown={() => {
        // Cancel pending hover and kill active stream before navigation.
        stopHover();
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        }
      }}
    >
      {mediaType === 'IMAGE' ? (
        <img 
          src={src}
          alt="Image Thumbnail"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      ) : (
        <>
          {/* Thumbnail always visible underneath — prevents black flash */}
          <img 
            src={thumbSrc}
            alt="Video Thumbnail"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />

          {/* Play button overlay — hidden once video is ready */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.1)',
            opacity: videoReady ? 0 : 1,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          }}>
            <div style={{ 
              width: '48px', height: '48px', 
              background: 'rgba(0,0,0,0.6)', 
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}>
              <Play size={24} color="#fafafa" fill="#fafafa" style={{ marginLeft: '4px' }} />
            </div>
          </div>

          {/* Video — mounted on hover, fades in only once first frame is ready */}
          {isHovered && (
            <video 
              ref={handleRef}
              src={src}
              muted={isMuted}
              autoPlay
              loop
              playsInline
              onCanPlay={() => setVideoReady(true)}
              style={{ 
                position: 'absolute', inset: 0,
                width: '100%', height: '100%', 
                objectFit: 'cover',
                transform: 'scale(1.05)',
                opacity: videoReady ? 1 : 0,
                transition: 'opacity 0.25s ease',
                backgroundColor: 'transparent',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Mute toggle — shown only while video is playing */}
          {isHovered && videoReady && (
            <button 
              onPointerDown={(e) => e.stopPropagation()}
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
          )}
        </>
      )}

      {mediaType === 'VIDEO' && duration ? (
        <span style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontWeight: 500, pointerEvents: 'none', transition: 'opacity 0.2s', opacity: videoReady ? 0 : 1 }}>
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
