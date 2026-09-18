import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { deleteQueueJob } from "@/lib/queue";
import { unlink, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: jobId } = await params;

        const job = deleteQueueJob(jobId);
        if (!job) {
            return NextResponse.json(
                { error: "Job not found" },
                { status: 404 },
            );
        }

        console.log(`[Queue API] Deleted Job ${jobId} from queue.`);

        const videoId = job.data.videoId;
        if (videoId) {
            // Find the corresponding video metadata
            const video = await repository.video.findUnique({
                where: { id: videoId },
            });

            if (video && video.status !== "COMPLETED") {
                console.log(
                    `[Queue API] Associated video ${videoId} never completed. Scrubbing from library.`,
                );

                // If it was still raw and in .uploads, move to trash, or just trash the process file
                const dataPath = path.resolve(
                    process.cwd(),
                    process.env.DATA_PATH || "/app/data",
                );
                const trashedDir = path.join(dataPath, ".trashed");
                await mkdir(trashedDir, { recursive: true });

                // Clean up raw upload if it exists
                if (video.originalPath) {
                    try {
                        await unlink(video.originalPath);
                    } catch {
                        /* suppress */
                    }
                }

                // Move processed output to trashed if it somehow survived partial processing
                let trashedPath = null;
                if (video.processedPath) {
                    try {
                        const ext = path.extname(video.processedPath);
                        const physicalName = `${videoId}${ext}`;
                        trashedPath = path.join(trashedDir, physicalName);
                        await stat(video.processedPath);
                        await rename(video.processedPath, trashedPath);
                    } catch {
                        /* suppress */
                    }
                }

                // Inform user in History tab
                await repository.jobHistory.create({
                    data: {
                        videoId: video.id, // Only attach if we don't delete it? Actually we are deleting the whole record...
                        jobType: "CANCELLED",
                        status: "COMPLETED",
                        completedAt: new Date(),
                        metadata: {
                            action: `Job ${jobId} manually cancelled before completion.`,
                            originalUUID: video.id,
                            trashedPath,
                        },
                    },
                });

                // Delete the master record, which implicitly orphans constraints or deletes cascades
                await repository.video.delete({
                    where: { id: videoId },
                });

                console.log(
                    `[Queue API] Scrapped uncompleted video ${videoId} and all associated files.`,
                );
            }
        }

        revalidatePath("/admin");
        revalidatePath("/admin/tasks");

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error("Queue Job Delete Error:", error);
        return NextResponse.json(
            { error: "Failed to delete job", details: error.message },
            { status: 500 },
        );
    }
}
