import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultCommentsEnabled,
  getDefaultTags,
  getDefaultVisibilityEnabled,
  setDefaultCommentsEnabled,
  setDefaultTags,
  setDefaultVisibilityEnabled,
} from "@/lib/settings";

export async function GET() {
  try {
    const [tags, commentsEnabled, visibilityEnabled] = await Promise.all([
      getDefaultTags(),
      getDefaultCommentsEnabled(),
      getDefaultVisibilityEnabled(),
    ]);

    return NextResponse.json({ tags, commentsEnabled, visibilityEnabled });
  } catch (error) {
    console.error("Default tags GET Error:", error);
    return NextResponse.json({ error: "Failed to load default settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const tags = Array.isArray(body?.tags) ? body.tags : [];
    const commentsEnabled = Boolean(body?.commentsEnabled);
    const visibilityEnabled = Boolean(body?.visibilityEnabled);

    const [savedTags, savedCommentsEnabled, savedVisibilityEnabled] = await Promise.all([
      setDefaultTags(tags),
      setDefaultCommentsEnabled(commentsEnabled),
      setDefaultVisibilityEnabled(visibilityEnabled),
    ]);

    return NextResponse.json({
      tags: savedTags,
      commentsEnabled: savedCommentsEnabled,
      visibilityEnabled: savedVisibilityEnabled,
    });
  } catch (error) {
    console.error("Default tags PUT Error:", error);
    return NextResponse.json({ error: "Failed to save default settings" }, { status: 500 });
  }
}
