import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { rename, mkdir, unlink, stat } from "node:fs/promises";
import path from "node:path";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, tags, isHidden } = body;

    // Build the update query dynamically
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (isHidden !== undefined) updateData.isHidden = isHidden;

    // Handle Tags (Many-to-Many relation)
    if (Array.isArray(tags)) {
      updateData.tags = {
        // Disconnect all existing tags first, then connect the new ones
        set: [],
        connectOrCreate: tags.map((t: string) => ({
          where: { name: t.toLowerCase() },
          create: { name: t.toLowerCase() },
        })),
      };
    }

    const video = await prisma.video.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
      },
    });

    const isHideAction = isHidden !== undefined && Object.keys(updateData).length === 1;
    await prisma.jobHistory.create({
      data: {
        videoId: id,
        jobType: isHideAction ? "HIDE" : "EDIT",
        status: "COMPLETED",
        completedAt: new Date(),
        ...(isHideAction ? { metadata: { isHidden } } : {})
      }
    });

    const payload = JSON.stringify(
      { success: true, video },
      (key, value) => (typeof value === "bigint" ? value.toString() : value)
    );

    revalidatePath('/admin');
    revalidatePath('/');

    return new NextResponse(payload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json(
      { error: "Failed to update video" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id }
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const dataPath = process.env.DATA_PATH || "/app/data";
    const trashedDir = path.join(dataPath, ".trashed");
    await mkdir(trashedDir, { recursive: true });

    // Move the processed webm to .trashed
    let trashedPath = null;
    if (video.processedPath) {
      try {
        const ext = path.extname(video.processedPath);
        const physicalName = `${id}${ext}`;
        trashedPath = path.join(trashedDir, physicalName);
        
        // Ensure source exists before attempting rename
        await stat(video.processedPath);
        await rename(video.processedPath, trashedPath);
        console.log(`[DELETE] Moved processed file to ${trashedPath}`);
      } catch (err: any) {
        console.error(`[DELETE] Failed to move file to trashed: ${err.message}`);
      }
    }

    // Attempt to silently delete the original upload MP4 if it somehow survived
    if (video.originalPath) {
      try {
         await unlink(video.originalPath);
      } catch { /* Suppress, usually already deleted by worker */ }
    }

    // Log the event, burning the filename into the metadata before the video is erased
    await prisma.jobHistory.create({
      data: {
        jobType: "DELETE",
        status: "COMPLETED",
        completedAt: new Date(),
        metadata: { filename: video.title || video.filename, originalUUID: video.id, action: "Moved to .trashed", trashedPath }
      }
    });

    // Erase the source completely
    await prisma.video.delete({
      where: { id }
    });

    revalidatePath('/admin');
    revalidatePath('/admin/history');
    revalidatePath('/');

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error hard-deleting video:", error);
    return NextResponse.json(
      { error: "Failed to delete video" },
      { status: 500 }
    );
  }
}
