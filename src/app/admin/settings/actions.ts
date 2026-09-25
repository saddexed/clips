"use server";

import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export async function revalidateVideosCache() {
  const unauthorized = await requireAdmin();
  if (unauthorized) throw new Error("Unauthorized");
  revalidateTag("videos", { expire: 0 });
}
