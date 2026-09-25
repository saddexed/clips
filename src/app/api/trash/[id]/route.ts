import { NextResponse } from "next/server";
import { permanentlyDeleteArtifact, type TrashArtifactKind } from "@/lib/trash";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const unauthorized = await requireAdmin(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== "original" && kind !== "converted") {
      return NextResponse.json({ error: "A valid artifact kind is required" }, { status: 400 });
    }
    const deleted = await permanentlyDeleteArtifact(id, kind as TrashArtifactKind);
    if (!deleted) {
      return NextResponse.json({ error: "Trash item not found" }, { status: 404 });
    }
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidateTag("videos", { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trash delete error:", error);
    return NextResponse.json({ error: "Failed to delete trash item" }, { status: 500 });
  }
}
