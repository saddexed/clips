'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function HomeClient() {
  const router = useRouter();

  useEffect(() => {
    let keyBuffer = '';
    const adminSequence = 'admin';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Add the new key to the buffer
      keyBuffer += e.key.toLowerCase();
      
      // Keep only the last N characters based on the sequence length
      if (keyBuffer.length > adminSequence.length) {
        keyBuffer = keyBuffer.slice(-adminSequence.length);
      }

      // Check for match
      if (keyBuffer === adminSequence) {
        router.push('/admin');
        keyBuffer = ''; // Reset after triggering
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  return null;
}
