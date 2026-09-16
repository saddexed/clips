import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultTags,
  getDefaultVisibilityEnabled,
  setDefaultTags,
  setDefaultVisibilityEnabled,
} from "@/lib/settings";

export async function GET() {
  try {
    const [tags, visibilityEnabled] = await Promise.all([
      getDefaultTags(),
      getDefaultVisibilityEnabled(),
    ]);

    return NextResponse.json({ tags, visibilityEnabled });
  } catch (error) {
    console.error("Default tags GET Error:", error);
    return NextResponse.json({ error: "Failed to load default settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const tags = Array.isArray(body?.tags) ? body.tags : [];
    const visibilityEnabled = Boolean(body?.visibilityEnabled);

    const [savedTags, savedVisibilityEnabled] = await Promise.all([
      setDefaultTags(tags),
      setDefaultVisibilityEnabled(visibilityEnabled),
    ]);

    return NextResponse.json({
      tags: savedTags,
      visibilityEnabled: savedVisibilityEnabled,
    });
  } catch (error) {
    console.error("Default tags PUT Error:", error);
    return NextResponse.json({ error: "Failed to save default settings" }, { status: 500 });
  }
}
