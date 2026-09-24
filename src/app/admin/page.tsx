import { listVideosPage } from "../../lib/database";
import VideoTable from "./VideoTable";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic"; // Ensures this page isn't statically cached, always showing fresh DB state

export default async function AdminManagePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; tag?: string; page?: string }>;
}) {
  const params = await searchParams;
  const videos = listVideosPage({ page: Number(params?.page || 1), limit: 25, query: params?.q, tags: params?.tag?.split(",") });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Media library" />

      <VideoTable initialVideos={videos.items} page={videos.page} total={videos.total} totalPages={videos.totalPages} initialQuery={params?.q || ""} initialTags={params?.tag?.split(",").filter(Boolean) || []} />
    </div>
  );
}
