import {
  createJobHistory,
  deleteVideo,
  getVideo,
  jobHistoryForVideo,
  listJobHistory,
  listVideos,
  search,
  updateJobHistory,
  updateVideo,
  type JobHistory,
  type Video,
} from "./database";

function videoMatches(video: Video, where: Record<string, unknown> = {}) {
  if (where.status && video.status !== where.status) return false;
  if (where.deletedAt === null && video.deletedAt !== null) return false;
  if (where.isHidden !== undefined && video.isHidden !== where.isHidden)
    return false;
  return true;
}

export const repository = {
  video: {
    findUnique: async ({
      where,
    }: {
      where: { id: string };
      [key: string]: unknown;
    }) => getVideo(where.id),
    findMany: async ({
      where,
      take,
    }: {
      where?: Record<string, unknown>;
      take?: number;
      [key: string]: unknown;
    } = {}) => {
      const query = Array.isArray(where?.OR)
        ? (where.OR[0] as { title?: { contains?: string } })?.title?.contains
        : undefined;
      const videos = query
        ? search(query, true)
            .videos.map((match) => getVideo(match.id)!)
            .filter(Boolean)
        : listVideos({ limit: take });
      return videos
        .filter((video) => videoMatches(video, where))
        .slice(0, take);
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Video> & {
        tags?: {
          connectOrCreate?: Array<{ create: { name: string } }>;
          set?: unknown[];
        };
      };
      [key: string]: unknown;
    }) => {
      const tags =
        data.tags?.connectOrCreate?.map((tag) => tag.create.name) ||
        (data.tags?.set ? [] : undefined);
      return updateVideo(where.id, { ...data, tags } as Record<string, unknown> & { tags?: string[] });
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const video = getVideo(where.id);
      if (video) deleteVideo(where.id);
      return video;
    },
  },
  tag: {
    findMany: async ({
      where,
      take,
    }: {
      where?: { name?: { contains?: string; mode?: string } };
      take?: number;
      [key: string]: unknown;
    } = {}) => search(where?.name?.contains || "", true).tags.slice(0, take),
  },
  jobHistory: {
    create: async ({
      data,
    }: {
      data: Omit<
        JobHistory,
        | "id"
        | "startedAt"
        | "video"
        | "videoId"
        | "originalSize"
        | "processedSize"
        | "errorMessage"
        | "metadata"
      > &
        Partial<
          Pick<
            JobHistory,
            | "videoId"
            | "originalSize"
            | "processedSize"
            | "errorMessage"
            | "metadata"
          >
        > & { startedAt?: Date };
    }) => {
      const id = createJobHistory({
        ...data,
        videoId: data.videoId || null,
        originalSize: data.originalSize || 0,
        processedSize: data.processedSize || 0,
        errorMessage: data.errorMessage || null,
        metadata: data.metadata || null,
      });
      return { id, ...data };
    },
    findMany: async ({
      where,
      take,
    }: {
      where?: { videoId?: string };
      take?: number;
      [key: string]: unknown;
    } = {}) =>
      where?.videoId ? jobHistoryForVideo(where.videoId) : listJobHistory(take),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { metadata: Record<string, unknown> };
    }) => updateJobHistory(where.id, data.metadata),
  },
};
