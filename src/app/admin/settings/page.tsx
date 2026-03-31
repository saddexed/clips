import {
  getDefaultCommentsEnabled,
  getDefaultTags,
  getDefaultVisibilityEnabled,
  getGlobalCommentsEnabled,
} from "@/lib/settings";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [defaultTags, defaultCommentsEnabled, defaultVisibilityEnabled, globalCommentsEnabled] = await Promise.all([
    getDefaultTags(),
    getDefaultCommentsEnabled(),
    getDefaultVisibilityEnabled(),
    getGlobalCommentsEnabled(),
  ]);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.875rem", fontWeight: 600, letterSpacing: "-0.025em", marginBottom: "0.25rem" }}>
          Settings
        </h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Configure defaults for newly uploaded media.
        </p>
      </div>

      <SettingsClient
        initialDefaultTags={defaultTags}
        initialCommentsEnabled={defaultCommentsEnabled}
        initialVisibilityEnabled={defaultVisibilityEnabled}
        initialGlobalCommentsEnabled={globalCommentsEnabled}
      />
    </div>
  );
}
