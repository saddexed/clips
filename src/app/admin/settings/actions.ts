"use server";

import { revalidateTag } from "next/cache";

export async function revalidateVideosCache() {
  // @ts-expect-error Next.js 16.1 Turbopack type mismatch for revalidateTag
  revalidateTag("videos");
}
