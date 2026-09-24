import { repository } from "@/lib/repository";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import ActionBar from "./ActionBar";
import { cn } from "@/lib/utils";
import SafeVideoPlayer from "@/components/SafeVideoPlayer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await repository.video.findUnique({ where: { id } });

  if (!video || video.deletedAt || !video.activePath) {
    return { title: "Not Found" };
  }

  const title = video.title || video.filename;
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") || headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") || "http";
  const appUrl = `${protocol}://${host}`;

  const imageUrl = `${appUrl}/t/${id}`;
  const videoUrl = `${appUrl}/v/${id}`;
  const playerUrl = `${appUrl}/w/${id}`;

  return {
    title,
    description: video.description || `Watch ${title}`,
    openGraph: {
      title,
      description: video.description || `Watch ${title}`,
      images: [{ url: imageUrl }],
      videos: [{ url: videoUrl, type: "video/webm" }],
      type: "video.other",
    },
    twitter: {
      card: "player",
      title,
      description: video.description || `Watch ${title}`,
      images: [imageUrl],
      players: [
        {
          playerUrl: playerUrl,
          streamUrl: videoUrl,
          width: video.width || 1280,
          height: video.height || 720,
        },
      ],
    },
  };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const video = await repository.video.findUnique({
    where: { id },
    include: { tags: true },
  });

  if (!video || video.deletedAt || !video.activePath) {
    notFound();
  }

  const recordedAt = new Date(video.date ?? video.createdAt);
  const meta = [
    recordedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      timeZone: "UTC",
    }),
    video.width && video.height ? `${video.width}×${video.height}` : null,
    video.mediaType !== "IMAGE" && video.duration ? formatDuration(video.duration) : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader backHref="/" narrow />

      <main className="mx-auto flex w-full max-w-player flex-1 flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="overflow-hidden rounded-2xl bg-black shadow-[0_24px_60px_-24px_var(--glow)] ring-1 ring-line-soft">
          {video.mediaType === "IMAGE" ? (
            <img
              src={`/v/${video.id}`}
              alt={video.title || video.filename}
              className="block max-h-[80vh] w-full object-contain"
            />
          ) : (
            <SafeVideoPlayer src={`/v/${video.id}`} />
          )}
        </div>

        <section className="flex flex-col gap-5">
          <div
            className={cn(
              "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
              (video.description || video.tags.length > 0) && "border-b border-line-soft pb-5",
            )}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
                {meta.join("  ·  ")}
              </p>
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink text-balance sm:text-3xl">
                {video.title || video.filename}
              </h1>
            </div>
            <ActionBar videoId={video.id} />
          </div>

          {video.description && (
            <p className="max-w-prose whitespace-pre-wrap leading-relaxed text-ink/90">
              {video.description}
            </p>
          )}

          {video.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {video.tags.map((tag) => (
                <li
                  key={tag.id}
                  className="rounded-full bg-chip px-3 py-1 font-mono text-xs lowercase text-chip-ink"
                >
                  #{tag.name.replace(/_/g, " ").replace(/\s+/g, " ").trim()}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
