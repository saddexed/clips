"use client";

import { useState } from "react";
import { Eye, EyeOff, MessageSquare, MessageSquareOff } from "lucide-react";

export default function SettingsClient({
  initialDefaultTags,
  initialCommentsEnabled,
  initialVisibilityEnabled,
}: {
  initialDefaultTags: string[];
  initialCommentsEnabled: boolean;
  initialVisibilityEnabled: boolean;
}) {
  const normalizeTag = (input: string) => input.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").replace(/[^a-z0-9\s-_]/g, "");

  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialDefaultTags.map((t) => normalizeTag(t)).filter(Boolean)
  );
  const [tagQuery, setTagQuery] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(initialCommentsEnabled);
  const [visibilityEnabled, setVisibilityEnabled] = useState(initialVisibilityEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iconButtonStyle: React.CSSProperties = {
    width: "2.1rem",
    height: "2.1rem",
    padding: "0",
    background: "var(--secondary)",
    border: "none",
    borderRadius: "0.375rem",
    color: "var(--foreground)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.2s",
  };

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagQuery("");
  };

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/settings/default-tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: selectedTags,
          commentsEnabled,
          visibilityEnabled,
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save default tags");
      }

      const normalizedTags = Array.isArray(payload.tags)
        ? payload.tags.map((t: string) => normalizeTag(t)).filter(Boolean)
        : [];
      setSelectedTags(normalizedTags);
      setCommentsEnabled(Boolean(payload.commentsEnabled));
      setVisibilityEnabled(Boolean(payload.visibilityEnabled));
      setMessage("Default upload settings updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ borderRadius: "var(--radius)", padding: "1.25rem" }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>Defaults</h2>
      <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Any new upload will automatically receive these tags. Use comma-separated values.
      </p>

      <div className="search-inline-shell" style={{ marginBottom: "0.8rem" }}>
        {selectedTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="search-tag-chip search-tag-chip--selected"
            onClick={() => removeTag(tag)}
            title="Remove tag"
          >
            × {tag}
          </button>
        ))}

        <input
          type="text"
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" || e.key === "Enter") {
              e.preventDefault();
              addTag(tagQuery);
              return;
            }

            if ((e.key === "Backspace" || e.key === "Delete") && !tagQuery.trim() && selectedTags.length > 0) {
              e.preventDefault();
              setSelectedTags((prev) => prev.slice(0, -1));
            }
          }}
          placeholder="Type tag and press Enter/Tab"
          className="search-inline-input"
        />
      </div>


      <div style={{ marginTop: "0.9rem", marginBottom: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setCommentsEnabled((prev) => !prev)}
            title={commentsEnabled ? "Comments enabled by default" : "Comments disabled by default"}
            aria-label={commentsEnabled ? "Comments enabled by default" : "Comments disabled by default"}
            style={iconButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--secondary)";
            }}
          >
            {commentsEnabled ? <MessageSquare size={16} /> : <MessageSquareOff size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setVisibilityEnabled((prev) => !prev)}
            title={visibilityEnabled ? "Visible by default" : "Hidden by default"}
            aria-label={visibilityEnabled ? "Visible by default" : "Hidden by default"}
            style={iconButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--secondary)";
            }}
          >
            {visibilityEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>

        <button className="btn-primary" onClick={save} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {message ? <p style={{ color: "#4ade80", marginTop: "0.75rem", fontSize: "0.85rem" }}>{message}</p> : null}
      {error ? <p style={{ color: "#f87171", marginTop: "0.75rem", fontSize: "0.85rem" }}>{error}</p> : null}
    </div>
  );
}
