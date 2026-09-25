import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultTags,
  getDefaultVisibilityEnabled,
  setDefaultTags,
  setDefaultVisibilityEnabled,
  getFfmpegParameters,
  setFfmpegParameters,
} from "@/lib/settings";
import { parseFfmpegParameters } from "@/lib/ffmpeg-parameters";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const [tags, visibilityEnabled] = await Promise.all([
      getDefaultTags(),
      getDefaultVisibilityEnabled(),
    ]);

    return NextResponse.json({ tags, visibilityEnabled, ffmpegParameters: getFfmpegParameters() });
  } catch (error) {
    console.error("Default tags GET Error:", error);
    return NextResponse.json({ error: "Failed to load default settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const tags = Array.isArray(body?.tags) ? body.tags : [];
    const visibilityEnabled = Boolean(body?.visibilityEnabled);
    const ffmpegParameters = typeof body?.ffmpegParameters === "string" ? body.ffmpegParameters : getFfmpegParameters();
    parseFfmpegParameters(ffmpegParameters);

    const [savedTags, savedVisibilityEnabled] = await Promise.all([
      setDefaultTags(tags),
      setDefaultVisibilityEnabled(visibilityEnabled),
      Promise.resolve(setFfmpegParameters(ffmpegParameters)),
    ]);

    return NextResponse.json({
      tags: savedTags,
      visibilityEnabled: savedVisibilityEnabled,
      ffmpegParameters,
    });
  } catch (error) {
    console.error("Default tags PUT Error:", error);
    return NextResponse.json({ error: "Failed to save default settings" }, { status: 500 });
  }
}
