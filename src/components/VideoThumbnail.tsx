"use client";

import { useRef, useState, useCallback } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export function VideoThumbnail({
  videoId,
  duration,
  date,
  mediaType = 'VIDEO',
}: {
  videoId: string;
  duration: number | null;
  date?: string | Date | null;
  mediaType?: 'VIDEO' | 'IMAGE';
}) {
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
      className="relative aspect-video overflow-hidden bg-surface-2"
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
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      ) : (
        <>
          {/* Thumbnail always visible underneath — prevents black flash */}
          <img
            src={thumbSrc}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />

          {/* Play affordance — fades out once the preview is ready */}
          <div
            className={cn(
              "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-300",
              videoReady ? "opacity-0" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <div className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur-sm">
              <Play size={20} color="#fafafa" fill="#fafafa" className="ml-0.5" />
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
              className={cn(
                "pointer-events-none absolute inset-0 size-full bg-transparent object-cover transition-opacity duration-250",
                videoReady ? "opacity-100" : "opacity-0",
              )}
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
              className="absolute right-2 top-2 z-10 grid size-8 cursor-pointer place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"
              aria-label={isMuted ? "Unmute video" : "Mute video"}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
        </>
      )}

      {/* Camcorder-style stamps */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/45 to-transparent px-2.5 pb-2 pt-6 transition-opacity duration-200",
          videoReady && "opacity-0",
        )}
      >
        <span className="osd">{date ? formatStamp(date) : null}</span>
        {mediaType === 'VIDEO' && duration ? (
          <span className="osd">{formatDuration(duration)}</span>
        ) : null}
      </div>
    </div>
  );
}

function formatStamp(value: string | Date) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${month} ${day} ${d.getUTCFullYear()}`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
