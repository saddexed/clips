import { repository } from "../lib/repository";
import { HomeClient } from "./HomeClient";
import VideoGallery from "@/components/VideoGallery";
import { SiteHeader } from "@/components/SiteHeader";

import { unstable_cache } from "next/cache";

export const metadata = {
  title: "sd3xV",
};

const getVideos = unstable_cache(
  async () => {
    const videos = await repository.video.findMany({
      where: {
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <VideoGallery initialVideos={videos as any} />
      </main>

      {/* Hidden Admin Keyboard Listener */}
      <HomeClient />
    </div>
  );
}
