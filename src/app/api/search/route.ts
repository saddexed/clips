import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/database";

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    const context = (
      request.nextUrl.searchParams.get("context") || "public"
    ).toLowerCase();

    if (!q) {
      return NextResponse.json({ tags: [], videos: [] });
    }

    const isAdmin = context === "admin";
    const result = search(q, isAdmin, "date", "desc");

    return NextResponse.json(result);
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
