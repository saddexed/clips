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

const displayTagName = (name: string) => name.replace(/_/g, " ").replace(/\s+/g, " ").trim();

export default function VideoGallery({ initialVideos }: { initialVideos: GalleryVideo[] }) {
  const [filteredVideos, setFilteredVideos] = useState<GalleryVideo[]>(initialVideos);
  const [tagToAddSignal, setTagToAddSignal] = useState<{ tag: string; seq: number } | null>(null);

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

  const isFiltered = filteredVideos.length !== initialVideos.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <SearchBar
          items={searchItems}
          onResultsChange={handleResultsChange}
          placeholder="Search titles or tags"
          tagToAddSignal={tagToAddSignal}
        />
        <p className="px-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted" aria-live="polite">
          {isFiltered
            ? `${filteredVideos.length} of ${initialVideos.length} clips`
            : `${initialVideos.length} ${initialVideos.length === 1 ? "clip" : "clips"}`}
        </p>
      </div>

      {filteredVideos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-muted">
          No clips match. Remove a tag or change the search.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredVideos.map((video) => (
            <li key={video.id}>
              <Link
                href={`/w/${video.id}`}
                prefetch={false}
                className="group flex flex-col gap-3 rounded-2xl outline-offset-4"
              >
                <div className="overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line-soft transition duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_32px_-12px_var(--glow)] group-hover:ring-line motion-reduce:group-hover:translate-y-0">
                  <VideoThumbnail
                    videoId={video.id}
                    duration={video.duration}
                    date={video.date}
                    mediaType={video.mediaType as any}
                  />
                </div>
                <div className="flex flex-col gap-1.5 px-0.5">
                  <h3 className="truncate text-[0.975rem] font-semibold leading-snug text-ink">
                    {video.title || video.filename}
                  </h3>
                  {video.tags && video.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {video.tags.slice(0, 3).map((tag) => {
                        const displayTag = displayTagName(tag.name);
                        return (
                          <button
                            key={`${video.id}-${tag.name}`}
                            type="button"
                            className="cursor-pointer rounded-full font-mono text-[0.6875rem] lowercase text-muted transition-colors hover:text-ink"
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
                      })}
                      {video.tags.length > 3 ? (
                        <span className="font-mono text-[0.6875rem] text-muted/70">+{video.tags.length - 3}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
