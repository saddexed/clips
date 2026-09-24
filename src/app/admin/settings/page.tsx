import {
  getDefaultTags,
  getDefaultVisibilityEnabled,
  getFfmpegParameters,
} from "@/lib/settings";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [defaultTags, defaultVisibilityEnabled, ffmpegParameters] = await Promise.all([
    getDefaultTags(),
    getDefaultVisibilityEnabled(),
    Promise.resolve(getFfmpegParameters()),
  ]);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.875rem", fontWeight: 600, letterSpacing: "-0.025em", marginBottom: "0.25rem" }}>
          Settings
        </h1>
      </div>

      <SettingsClient
        initialDefaultTags={defaultTags}
          initialVisibilityEnabled={defaultVisibilityEnabled}
          initialFfmpegParameters={ffmpegParameters}
      />
    </div>
  );
}
