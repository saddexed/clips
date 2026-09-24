import { repository } from "../lib/repository";
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
      <VideoGallery initialVideos={videos as any} />

      {/* Hidden Admin Keyboard Listener */}
      <HomeClient />
    </div>
  );
}
