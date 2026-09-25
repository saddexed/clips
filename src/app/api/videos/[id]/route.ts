import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { revalidatePath, revalidateTag } from "next/cache";
import { softDeleteVideo } from "@/lib/trash";

function normalizeTag(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s-_]/g, "");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, tags, isHidden, date } = body;

    const existingVideo = await repository.video.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingVideo) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Build the update query dynamically
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined)
      updateData.description = typeof description === "string" ? description.trim() : "";
    if (isHidden !== undefined) updateData.isHidden = isHidden;
    if (date !== undefined) updateData.date = new Date(date);

    // Handle Tags (Many-to-Many relation)
    if (Array.isArray(tags)) {
      const normalizedTags = Array.from(
        new Set(
          tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => normalizeTag(t))
            .filter(Boolean),
        ),
      );

      updateData.tags = {
        // Disconnect all existing tags first, then connect the new ones
        set: [],
        connectOrCreate: normalizedTags.map((t) => ({
          where: { name: t },
          create: { name: t },
        })),
      };
    }

    const video = await repository.video.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
      },
    });

    const isHideAction =
      isHidden !== undefined && Object.keys(updateData).length === 1;
    await repository.jobHistory.create({
      data: {
        videoId: id,
        jobType: isHideAction ? "HIDE" : "EDIT",
        status: "COMPLETED",
        completedAt: new Date(),
        ...(isHideAction ? { metadata: { isHidden } } : {}),
      },
    });

    const payload = JSON.stringify({ success: true, video }, (key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    revalidatePath("/admin");
    revalidatePath("/");
    revalidateTag("videos", { expire: 0 });

    return new NextResponse(payload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json(
      { error: "Failed to update video" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const video = await repository.video.findUnique({
      where: { id },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    await softDeleteVideo(video);

    revalidatePath("/admin");
    revalidatePath("/admin/history");
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidateTag("videos", { expire: 0 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting video:", error);
    return NextResponse.json(
      { error: "Failed to delete video" },
      { status: 500 },
    );
  }
}
