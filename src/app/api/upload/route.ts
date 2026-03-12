import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { videoQueue } from "@/lib/queue";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export async function POST(request: NextRequest) {
  try {
    // 1. Manually enforce JWT authentication
    // We do this inside the route handler instead of Edge Middleware to evade the 10MB edge proxy limits.
    if (process.env.ADMIN_PASSWORD) {
      const cookieStore = await cookies();
      const token = cookieStore.get('admin_session')?.value;
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback_secret_for_dev_only');
        await jwtVerify(token, secret);
      } catch (err) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: "Only video and image files are allowed" },
        { status: 400 }
      );
    }

    const dataPath = path.resolve(process.cwd(), process.env.DATA_PATH || "/app/data");
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
        mediaType: isImage ? "IMAGE" : "VIDEO",
        originalSize: file.size,
        originalMetadata: { originalFilename: file.name, contentType: file.type }, // Store original name in metadata
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

    // Removed eager pending TRANSCODE entry to ensure logs.

    // 4. Enqueue the work to BullMQ
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
