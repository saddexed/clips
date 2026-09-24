"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { revalidateVideosCache } from "@/app/admin/settings/actions";
import { btn } from "@/components/ui";

export default function AdminReloadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return <button className={btn("ghost", "icon-sm")} title="Refresh data" aria-label="Refresh data" disabled={loading} onClick={async () => { setLoading(true); try { await revalidateVideosCache(); router.refresh(); window.dispatchEvent(new Event("admin-data-refresh")); } finally { setLoading(false); } }}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>;
}
