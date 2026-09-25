import { NextResponse } from "next/server";
import { restoreTrashArtifact, type TrashArtifactKind } from "@/lib/trash";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export async function POST(
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
    const result = await restoreTrashArtifact(id, kind as TrashArtifactKind);
    if (result.status === "not_found") {
      return NextResponse.json({ error: "Trash item not found" }, { status: 404 });
    }
    if (result.status === "missing") {
      return NextResponse.json({ error: "Artifact is missing" }, { status: 409 });
    }
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/settings");
    revalidateTag("videos", { expire: 0 });
    return NextResponse.json({ success: true, requeued: result.requeued });
  } catch (error) {
    console.error("Trash restore error:", error);
    return NextResponse.json({ error: "Failed to restore trash item" }, { status: 500 });
  }
}
