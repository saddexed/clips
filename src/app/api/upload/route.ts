import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { videoQueue } from "@/lib/queue";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "Only video files are allowed" },
        { status: 400 }
      );
    }

    const dataPath = process.env.DATA_PATH || "/app/data";
    const tempDir = path.join(dataPath, ".uploads");
    
    // Ensure the .uploads directory exists
    await mkdir(tempDir, { recursive: true });

    // Generate UUID manually so we can write the file deterministically in one pass
    const videoId = crypto.randomUUID();
    const ext = path.extname(file.name) || "";
    const physicalName = `${videoId}${ext}`;
    const filePath = path.join(tempDir, physicalName);

    // Read the file as an ArrayBuffer and save to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);
    
    // 1. Create the Database Record (UPLOADING -> QUEUED)
    const video = await prisma.video.create({
      data: {
        id: videoId,
        filename: physicalName, // We physically use the ID as the filename for performance
        originalPath: filePath,
        title: formData.get("title")?.toString() || file.name.replace(/\.[^/.]+$/, ""),
        description: formData.get("description")?.toString() || "",
        status: "QUEUED",
        originalSize: file.size,
        originalMetadata: { originalFilename: file.name }, // Store original name in metadata
      },
    });

    // 2. Add UPLOAD history entry – logs the successful file receipt
    await prisma.jobHistory.create({
      data: {
        videoId: video.id,
        jobType: "UPLOAD",
        status: "COMPLETED",
        completedAt: new Date(),
        originalSize: file.size,
      },
    });

    // 3. Add pending TRANSCODE entry (will be updated by the worker on completion)
    await prisma.jobHistory.create({
      data: {
        videoId: video.id,
        jobType: "TRANSCODE",
        status: "PENDING",
        originalSize: file.size,
      },
    });

    // 3. Enqueue the work to BullMQ
    await videoQueue.add("process-video", {
      videoId: video.id,
      filePath,
    });
    
    // Force the Next.js router cache to invalidate the Manage tab
    // so it immediately picks up this new QUEUED video row.
    revalidatePath('/admin');

    return NextResponse.json({
      message: "Upload successful, video queued for processing",
      videoId: video.id,
    }, { status: 201 });

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
