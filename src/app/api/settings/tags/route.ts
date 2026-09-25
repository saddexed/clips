import { NextResponse } from "next/server";
import { listDeletedTags, listTagsPage, renameTag, restoreTag, softDeleteTag } from "@/lib/database";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const page = listTagsPage(Number(url.searchParams.get("page") || 1), 50);
  return NextResponse.json({ ...page, deleted: url.searchParams.get("includeDeleted") === "true" ? listDeletedTags() : [] });
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim().toLowerCase().replace(/\s+/g, " ") : "";
    if (!name || name.length > 100 || !/^[a-z0-9 _-]+$/.test(name)) return NextResponse.json({ error: "Tag names may contain letters, numbers, spaces, underscores, and hyphens." }, { status: 400 });
    renameTag(String(body?.id || ""), name);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to rename tag." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;
    softDeleteTag(new URL(request.url).searchParams.get("id") || "");
    return NextResponse.json({ success: true });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete tag." }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;
    restoreTag((await request.json()).id);
    return NextResponse.json({ success: true });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to restore tag." }, { status: 400 }); }
}
