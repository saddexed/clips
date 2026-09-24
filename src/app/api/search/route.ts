import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/repository";

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

    const tags = await repository.tag.findMany({
      where: {
        name: {
          contains: q,
          mode: "insensitive",
        },
      },
      orderBy: { name: "asc" },
      take: 12,
      select: {
        name: true,
      },
    });

    const videos = await repository.video.findMany({
      where: {
        deletedAt: null,
        ...(isAdmin ? {} : { isHidden: false }),
        OR: [
          {
            title: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            tags: {
              some: {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      },
      orderBy: {
        date: "desc",
      },
      take: 20,
      select: {
        id: true,
        title: true,
        filename: true,
      },
    });

    return NextResponse.json({
      tags,
      videos,
    });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
