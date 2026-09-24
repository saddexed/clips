import {
  getDefaultTags,
  getDefaultVisibilityEnabled,
  getFfmpegParameters,
} from "@/lib/settings";
import SettingsClient from "./SettingsClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [defaultTags, defaultVisibilityEnabled, ffmpegParameters] = await Promise.all([
    getDefaultTags(),
    getDefaultVisibilityEnabled(),
    Promise.resolve(getFfmpegParameters()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <SettingsClient
        initialDefaultTags={defaultTags}
        initialVisibilityEnabled={defaultVisibilityEnabled}
        initialFfmpegParameters={ffmpegParameters}
      />
    </div>
  );
}
