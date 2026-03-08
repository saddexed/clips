'use client';

import { useRef } from 'react';

export default function SafeVideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleRef = (el: HTMLVideoElement | null) => {
    if (videoRef.current && el === null) {
      // Deep unmount cleanup to kill the active WebMediaPlayer connection in Chrome
      // Next.js client-side navigations unmount the element, but Chrome may keep the streaming socket open.
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    videoRef.current = el;
  };

  return (
    <video 
      ref={handleRef}
      controls 
      autoPlay 
      style={{ width: '100%', aspectRatio: '16/9', display: 'block' }}
      src={src}
    />
  );
}
