import Link from "next/link";
import { repository } from "../lib/repository";
import { Video } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HomeClient } from "./HomeClient";
import VideoGallery from "@/components/VideoGallery";

import { unstable_cache } from "next/cache";

export const metadata = {
  title: "sd3xV",
};

const getVideos = unstable_cache(
  async () => {
    const videos = await repository.video.findMany({
      where: {
        status: "COMPLETED",
        deletedAt: null,
        isHidden: false,
      },
      orderBy: { date: "desc" },
      include: { tags: true },
    });
    return videos;
  },
  ["videos"],
  { revalidate: 60, tags: ["videos"] },
);

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; tag?: string }>;
}) {
  await searchParams;

  const videos = await getVideos();

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          width: "100%",
          background: "var(--glass)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              textDecoration: "none",
              color: "var(--foreground)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                background: "var(--foreground)",
                color: "var(--background)",
                padding: "0.2rem 0.6rem",
                borderRadius: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Video size={20} fill="currentColor" />
            </div>
            sd3xV
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="page-container" style={{ flex: 1 }}>
        <div
          style={{
            padding: "1rem 0 3rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            width: "100%",
          }}
        >
          <p
            style={{
              color: "var(--muted-foreground)",
              fontSize: "1.125rem",
              maxWidth: "600px",
              lineHeight: 1.6,
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            Random assortment of clips I have recorded over the years.
          </p>
          <VideoGallery initialVideos={videos as any} />
        </div>
      </main>

      {/* Hidden Admin Keyboard Listener */}
      <HomeClient />
    </div>
  );
}
