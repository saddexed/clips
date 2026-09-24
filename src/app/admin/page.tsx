import { listVideosPage } from "../../lib/database";
import VideoTable from "./VideoTable";

export const dynamic = "force-dynamic"; // Ensures this page isn't statically cached, always showing fresh DB state

export default async function AdminManagePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; tag?: string; page?: string }>;
}) {
  const params = await searchParams;
  const videos = listVideosPage({ page: Number(params?.page || 1), limit: 50, query: params?.q, tags: params?.tag?.split(",") });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.875rem",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              marginBottom: "0.25rem",
            }}
          >
            Media Library
          </h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Manage your uploaded clips and their processing statuses.
          </p>
        </div>
      </div>

      <VideoTable initialVideos={videos.items} page={videos.page} totalPages={videos.totalPages} initialQuery={params?.q || ""} initialTags={params?.tag?.split(",").filter(Boolean) || []} />
    </div>
  );
}
