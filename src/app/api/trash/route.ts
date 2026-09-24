import { NextResponse } from "next/server";
import { clearTrash, listTrashItems } from "@/lib/trash";
import { revalidatePath, revalidateTag } from "next/cache";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || 1);
    const limit = Number(url.searchParams.get("limit") || 50);
    return NextResponse.json(await listTrashItems(page, limit), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Trash list error:", error);
    return NextResponse.json({ error: "Failed to load trash" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearTrash();
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidateTag("videos", { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trash clear error:", error);
    return NextResponse.json({ error: "Failed to clear trash" }, { status: 500 });
  }
}
