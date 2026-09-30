import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultTags,
  getDefaultVisibilityEnabled,
  getFfmpegParameters,
  saveUploadDefaults,
  resetUploadDefaults,
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
    try {
      parseFfmpegParameters(ffmpegParameters);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid encoder parameters" },
        { status: 400 },
      );
    }

    const saved = await saveUploadDefaults({ tags, visibilityEnabled, ffmpegParameters });
    console.info("[settings] upload defaults saved", {
      tagCount: saved.tags.length,
      visibilityEnabled: saved.visibilityEnabled,
      ffmpegParametersLength: saved.ffmpegParameters.length,
    });

    return NextResponse.json({
      ...saved,
    });
  } catch (error) {
    console.error("Default tags PUT Error:", error);
    return NextResponse.json({ error: "Failed to save default settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => null);
    if (body?.action !== "reset") {
      return NextResponse.json({ error: "Invalid action. Use reset." }, { status: 400 });
    }

    const reset = await resetUploadDefaults();
    console.info("[settings] upload defaults reset");
    return NextResponse.json(reset);
  } catch (error) {
    console.error("Default settings reset Error:", error);
    return NextResponse.json({ error: "Failed to reset default settings" }, { status: 500 });
  }
}
