import { NextRequest, NextResponse } from "next/server";
import { getVideo } from "@/lib/database";
import { deleteQueueJob, getQueueJob, setJobPaused } from "@/lib/queue";
import { revalidatePath } from "next/cache";
import { softDeleteVideo } from "@/lib/trash";
import { requireAdmin } from "@/lib/auth";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const unauthorized = await requireAdmin(request);
        if (unauthorized) return unauthorized;

        const { id } = await params;
        if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
            return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
        }
        const body = await request.json().catch(() => null);
        if (body?.action !== "pause" && body?.action !== "resume") {
            return NextResponse.json({ error: "Invalid action. Use pause or resume." }, { status: 400 });
        }
        const job = getQueueJob(Number(id));
        if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
        if (job.status !== "wait" && job.status !== "active") {
            return NextResponse.json({ error: "Only waiting or active jobs can be paused" }, { status: 409 });
        }
        const updated = setJobPaused(job.id, body.action === "pause");
        if (!updated) return NextResponse.json({ error: "Job is no longer pending" }, { status: 409 });
        return NextResponse.json({ success: true, job: updated });
    } catch (error) {
        console.error("Queue Job Pause/Resume Error:", error);
        return NextResponse.json({ error: "Failed to update job state" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const unauthorized = await requireAdmin(request);
        if (unauthorized) return unauthorized;

        const { id: jobId } = await params;
        if (!/^\d+$/.test(jobId) || !Number.isSafeInteger(Number(jobId))) {
            return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
        }

        const job = deleteQueueJob(Number(jobId));
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
            const video = getVideo(videoId);

            if (video && video.status !== "COMPLETED") {
                console.log(
                    `[Queue API] Associated video ${videoId} never completed. Moving it to trash.`,
                );

                await softDeleteVideo(video, "CANCELLED", {
                    action: `Job ${jobId} manually cancelled before completion.`,
                });

                console.log(
                    `[Queue API] Moved uncompleted video ${videoId} and its artifacts to trash.`,
                );
            }
        }

        revalidatePath("/admin");
        revalidatePath("/admin/tasks");
        revalidatePath("/admin/settings");
        revalidatePath("/");

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error("Queue Job Delete Error:", error);
        return NextResponse.json(
            { error: "Failed to delete job" },
            { status: 500 },
        );
    }
}
