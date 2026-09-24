import { listJobHistoryPage } from "@/lib/database";
import HistoryClient from "./HistoryClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = await searchParams;
  const history = listJobHistoryPage(Number(page.page || 1), 50);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="History" />

      <HistoryClient items={history.items} page={history.page} totalPages={history.totalPages} />
    </div>
  );
}
