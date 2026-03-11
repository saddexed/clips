'use client';

import { useRef, useCallback } from 'react';

export default function SafeVideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleRef = useCallback((el: HTMLVideoElement | null) => {
    if (videoRef.current && el === null) {
      // Deep unmount cleanup to kill the active WebMediaPlayer connection in Chrome
      // Next.js client-side navigations unmount the element, but Chrome may keep the streaming socket open.
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    } else if (el && el.getAttribute('src') !== src) {
      // In React Strict Mode (dev), the component unmounts and remounts instantly.
      // Since we manually removed the src attribute without React's knowledge, we must put it back.
      el.setAttribute('src', src);
    }
    videoRef.current = el;
  }, [src]);

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
