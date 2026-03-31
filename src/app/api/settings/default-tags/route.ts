import { NextRequest, NextResponse } from "next/server";
import { getDefaultTags, setDefaultTags } from "@/lib/settings";

export async function GET() {
  try {
    const tags = await getDefaultTags();
    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Default tags GET Error:", error);
    return NextResponse.json({ error: "Failed to load default tags" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const tags = Array.isArray(body?.tags) ? body.tags : [];
    const saved = await setDefaultTags(tags);
    return NextResponse.json({ tags: saved });
  } catch (error) {
    console.error("Default tags PUT Error:", error);
    return NextResponse.json({ error: "Failed to save default tags" }, { status: 500 });
  }
}
