"use client";

import { useState } from "react";

export default function SettingsClient({ initialDefaultTags }: { initialDefaultTags: string[] }) {
  const [input, setInput] = useState(initialDefaultTags.join(", "));
  const [savedTags, setSavedTags] = useState(initialDefaultTags);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseInput = () =>
    input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/settings/default-tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: parseInput() }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save default tags");
      }

      setSavedTags(payload.tags || []);
      setInput((payload.tags || []).join(", "));
      setMessage("Default tags updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ borderRadius: "var(--radius)", padding: "1.25rem" }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>Default Tags</h2>
      <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Any new upload will automatically receive these tags. Use comma-separated values.
      </p>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="example: archive, highlights, personal"
        style={{
          width: "100%",
          height: "42px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--foreground)",
          padding: "0 0.85rem",
          outline: "none",
          marginBottom: "0.8rem",
        }}
      />

      <button className="btn-primary" onClick={save} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save Default Tags"}
      </button>

      {message ? <p style={{ color: "#4ade80", marginTop: "0.75rem", fontSize: "0.85rem" }}>{message}</p> : null}
      {error ? <p style={{ color: "#f87171", marginTop: "0.75rem", fontSize: "0.85rem" }}>{error}</p> : null}

      {savedTags.length > 0 ? (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          {savedTags.map((tag) => (
            <span key={tag} className="badge info">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
