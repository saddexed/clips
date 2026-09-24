"use client";

import { useState } from "react";
import { Share2, Download, Link2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonClass =
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors";

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
    <div className="flex w-full shrink-0 flex-col gap-2 md:w-auto md:flex-row md:items-center [&>*]:justify-center">
      <div className="flex items-center rounded-full border border-line-soft bg-surface p-0.5 [&>button]:flex-1 [&>button]:justify-center md:[&>button]:flex-none">
        <button
          type="button"
          onClick={handleCopyWebpage}
          className={cn(buttonClass, "text-ink hover:bg-chip hover:text-chip-ink")}
          title="Copy link to this page"
        >
          {copiedWeb ? <Check size={15} /> : <Share2 size={15} />}
          <span aria-live="polite">{copiedWeb ? "Copied" : "Share page"}</span>
        </button>
        <button
          type="button"
          onClick={handleCopyDirect}
          className={cn(buttonClass, "text-ink hover:bg-chip hover:text-chip-ink")}
          title="Copy direct link to the video file"
        >
          {copiedDirect ? <Check size={15} /> : <Link2 size={15} />}
          <span aria-live="polite">{copiedDirect ? "Copied" : "Copy video link"}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleDownload}
        className={cn(buttonClass, "bg-solid text-solid-ink hover:opacity-85")}
      >
        <Download size={15} />
        Download
      </button>
    </div>
  );
}
