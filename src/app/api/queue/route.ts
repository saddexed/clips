import { NextResponse } from "next/server";
import { getQueueStats, setQueuePaused } from "../../../lib/queue";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    return NextResponse.json(getQueueStats({
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 50),
    }));
  } catch (error) {
    console.error("Queue API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue statistics" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action !== "pause" && action !== "resume") {
      return NextResponse.json(
        { error: "Invalid action. Use pause or resume." },
        { status: 400 },
      );
    }

    const pauseQueue = action === "pause";
    setQueuePaused(pauseQueue);

    return NextResponse.json({ success: true, isPaused: pauseQueue });
  } catch (error) {
    console.error("Queue Pause/Resume API Error:", error);
    return NextResponse.json(
      { error: "Failed to update queue state" },
      { status: 500 },
    );
  }
}
