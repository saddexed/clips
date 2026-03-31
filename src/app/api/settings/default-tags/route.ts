import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultCommentsEnabled,
  getDefaultTags,
  getDefaultVisibilityEnabled,
  getGlobalCommentsEnabled,
  setDefaultCommentsEnabled,
  setDefaultTags,
  setDefaultVisibilityEnabled,
  setGlobalCommentsEnabled,
} from "@/lib/settings";

export async function GET() {
  try {
    const [tags, commentsEnabled, visibilityEnabled, globalCommentsEnabled] = await Promise.all([
      getDefaultTags(),
      getDefaultCommentsEnabled(),
      getDefaultVisibilityEnabled(),
      getGlobalCommentsEnabled(),
    ]);

    return NextResponse.json({ tags, commentsEnabled, visibilityEnabled, globalCommentsEnabled });
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
    const globalCommentsEnabled = body?.globalCommentsEnabled !== undefined ? Boolean(body?.globalCommentsEnabled) : true;

    const [savedTags, savedCommentsEnabled, savedVisibilityEnabled, savedGlobalCommentsEnabled] = await Promise.all([
      setDefaultTags(tags),
      setDefaultCommentsEnabled(commentsEnabled),
      setDefaultVisibilityEnabled(visibilityEnabled),
      setGlobalCommentsEnabled(globalCommentsEnabled),
    ]);

    return NextResponse.json({
      tags: savedTags,
      commentsEnabled: savedCommentsEnabled,
      visibilityEnabled: savedVisibilityEnabled,
      globalCommentsEnabled: savedGlobalCommentsEnabled,
    });
  } catch (error) {
    console.error("Default tags PUT Error:", error);
    return NextResponse.json({ error: "Failed to save default settings" }, { status: 500 });
  }
}
