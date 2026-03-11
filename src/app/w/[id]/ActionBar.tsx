"use client";

import { useState } from "react";
import { Share2, Download, Link2, Check } from "lucide-react";

export default function ActionBar({ videoId }: { videoId: string }) {
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedDirect, setCopiedDirect] = useState(false);

  const handleCopyWebpage = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedWeb(true);
      setTimeout(() => setCopiedWeb(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleCopyDirect = async () => {
    try {
      const directUrl = `${window.location.origin}/v/${videoId}`;
      await navigator.clipboard.writeText(directUrl);
      setCopiedDirect(true);
      setTimeout(() => setCopiedDirect(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleDownload = () => {
    window.location.href = `/d/${videoId}`;
  };

  return (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <button 
        onClick={handleCopyWebpage}
        className="btn-secondary" 
        style={{ fontSize: '0.875rem' }}
        title="Copy link to this page"
      >
        {copiedWeb ? <Check size={16} color="#4ade80" /> : <Share2 size={16} />}
        Share
      </button>

      <button 
        onClick={handleCopyDirect}
        className="btn-secondary" 
        style={{ fontSize: '0.875rem' }}
        title="Copy raw direct .webm link"
      >
        {copiedDirect ? <Check size={16} color="#4ade80" /> : <Link2 size={16} />}
        Direct Link
      </button>

      <button 
        onClick={handleDownload}
        className="btn-primary" 
        style={{ fontSize: '0.875rem' }}
      >
        <Download size={16} />
        Download
      </button>
    </div>
  );
}
