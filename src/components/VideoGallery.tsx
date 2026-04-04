"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import SearchBar, { type SearchItem } from "@/components/SearchBar";
import { VideoThumbnail } from "@/components/VideoThumbnail";

type GalleryVideo = SearchItem & {
  date: string | Date;
  duration: number | null;
  mediaType?: string;
};

export default function VideoGallery({ initialVideos }: { initialVideos: GalleryVideo[] }) {
  const [filteredVideos, setFilteredVideos] = useState<GalleryVideo[]>(initialVideos);
  const [tagToAddSignal, setTagToAddSignal] = useState<{ tag: string; seq: number } | null>(null);

  const formatCardDate = useCallback((value: string | Date) => {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }, []);

  const searchItems = useMemo<SearchItem[]>(
    () =>
      initialVideos.map((video) => ({
        id: video.id,
        title: video.title,
        filename: video.filename,
        tags: video.tags || [],
      })),
    [initialVideos]
  );

  const handleResultsChange = useCallback(
    (items: SearchItem[]) => {
      const ids = new Set(items.map((v) => v.id));
      setFilteredVideos(initialVideos.filter((v) => ids.has(v.id)));
    },
    [initialVideos]
  );

  return (
    <>
      <div style={{ marginTop: "1rem", width: "100%", display: "flex", justifyContent: "center" }}>
        <SearchBar
          items={searchItems}
          onResultsChange={handleResultsChange}
          placeholder="Search titles or pick tags..."
          tagToAddSignal={tagToAddSignal}
        />
      </div>

      {filteredVideos.length === 0 ? (
        <div className="glass-panel" style={{ padding: "4rem", textAlign: "center", borderRadius: "var(--radius)", color: "var(--muted-foreground)", marginTop: "1.2rem" }}>
          No videos match your current filters.
        </div>
      ) : (
        <div className="video-grid" style={{ marginTop: "1.2rem" }}>
          {filteredVideos.map((video) => (
            <Link key={video.id} href={`/w/${video.id}`} prefetch={false} style={{ textDecoration: "none" }}>
              <div
                className="glass-panel video-card-hover"
                style={{
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <VideoThumbnail videoId={video.id} duration={video.duration} mediaType={video.mediaType as any} />
                <div style={{ padding: "1rem", display: "flex", flexDirection: "column", flex: 1 }}>
                  <h3
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 600,
                      color: "var(--foreground)",
                      marginBottom: "0.35rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {video.title || video.filename}
                  </h3>

                  <div
                    style={{
                      fontSize: "0.84rem",
                      color: "var(--muted-foreground)",
                      marginTop: "auto",
                      paddingTop: "0.85rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {formatCardDate(video.date)}
                    </span>

                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {(video.tags || []).slice(0, 3).map((tag) => (
                        (() => {
                          const displayTag = tag.name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
                          return (
                        <button
                          key={`${video.id}-${tag.name}`}
                          type="button"
                          className="search-tag-chip"
                          style={{ padding: "0.18rem 0.55rem", fontSize: "0.72rem" }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTagToAddSignal((prev) => ({
                              tag: displayTag,
                              seq: (prev?.seq || 0) + 1,
                            }));
                          }}
                          title={`Filter by tag: ${displayTag}`}
                        >
                          #{displayTag}
                        </button>
                          );
                        })()
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
