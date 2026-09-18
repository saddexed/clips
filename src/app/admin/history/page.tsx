import { listJobHistory } from "@/lib/database";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const historyRows = listJobHistory(100);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "1.875rem",
            fontWeight: 600,
            letterSpacing: "-0.025em",
            marginBottom: "0.25rem",
          }}
        >
          Job History Timeline
        </h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Track the exact lifecycle timestamps of every video from upload to
          transcoding completion.
        </p>
      </div>

      <HistoryClient items={historyRows} />
    </div>
  );
}
