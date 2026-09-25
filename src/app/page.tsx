import { listVideos } from "@/lib/database";
import { HomeClient } from "./HomeClient";
import VideoGallery from "@/components/VideoGallery";

import { unstable_cache } from "next/cache";

export const metadata = {
  title: "sd3xV",
};

const getVideos = unstable_cache(
  async () => {
    return listVideos({
      publicOnly: true,
      sortField: "date",
      sortOrder: "desc",
    });
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
