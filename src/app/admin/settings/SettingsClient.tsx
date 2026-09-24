"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw, RotateCcw, Trash2, Pencil } from "lucide-react";

type TrashItem = {
  videoId: string;
  artifactKind: "original" | "converted" | "processed";
  title: string;
  filename: string;
  deletedAt: string;
  missing: boolean;
};

const TRASH_PAGE_SIZE = 50;

async function getResponseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string") return payload.error;
  } catch {
    // Fall back to the action-specific message when the response has no JSON body.
  }
  return fallback;
}

function formatDeletedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function SettingsClient({
  initialDefaultTags,
  initialVisibilityEnabled,
  initialFfmpegParameters,
}: {
  initialDefaultTags: string[];
  initialVisibilityEnabled: boolean;
  initialFfmpegParameters: string;
}) {
  const normalizeTag = (input: string) => input.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").replace(/[^a-z0-9\s-_]/g, "");

  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialDefaultTags.map((t) => normalizeTag(t)).filter(Boolean)
  );
  const [tagQuery, setTagQuery] = useState("");
  const [visibilityEnabled, setVisibilityEnabled] = useState(initialVisibilityEnabled);
  const [ffmpegParameters, setFfmpegParameters] = useState(initialFfmpegParameters);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagItems, setTagItems] = useState<{ id: string; name: string }[]>([]);
  const [deletedTags, setDeletedTags] = useState<{ id: string; name: string }[]>([]);
  const [tagPage, setTagPage] = useState(1);
  const [tagTotalPages, setTagTotalPages] = useState(1);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string } | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashPage, setTrashPage] = useState(1);
  const [trashTotalPages, setTrashTotalPages] = useState(1);
  const [trashTotal, setTrashTotal] = useState(0);
  const [isLoadingTrash, setIsLoadingTrash] = useState(true);
  const [trashAction, setTrashAction] = useState<string | null>(null);
  const [trashMessage, setTrashMessage] = useState<string | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);

  const loadTrash = useCallback(async (page = 1) => {
    setIsLoadingTrash(true);
    setTrashError(null);
    setTrashMessage(null);
    try {
      const safePage = Math.max(1, Math.floor(page));
      const response = await fetch(`/api/trash?page=${safePage}&limit=${TRASH_PAGE_SIZE}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        items?: TrashItem[];
        page?: number;
        total?: number;
        totalPages?: number;
        hasMore?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load trash.");
      }
      setTrashItems(Array.isArray(payload.items) ? payload.items : []);
      const currentPage = Number.isFinite(payload.page) ? Math.max(1, Number(payload.page)) : safePage;
      const total = Number.isFinite(payload.total) ? Math.max(0, Number(payload.total)) : 0;
      const totalPages = Number.isFinite(payload.totalPages)
        ? Math.max(1, Number(payload.totalPages))
        : payload.hasMore
          ? currentPage + 1
          : currentPage;
      setTrashPage(currentPage);
      setTrashTotal(total);
      setTrashTotalPages(totalPages);
    } catch (e) {
      setTrashError(e instanceof Error ? e.message : "Failed to load trash.");
    } finally {
      setIsLoadingTrash(false);
    }
  }, []);

  useEffect(() => {
    void loadTrash(1);
  }, [loadTrash]);

  const loadTags = useCallback(async (page = 1) => {
    const response = await fetch(`/api/settings/tags?page=${page}&includeDeleted=true`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setTagItems(payload.items || []); setDeletedTags(payload.deleted || []); setTagPage(payload.page || page); setTagTotalPages(payload.totalPages || 1);
  }, []);
  useEffect(() => { void loadTags(); }, [loadTags]);

  const runTrashAction = async ({
    key,
    url,
    method,
    confirmText,
    successMessage,
    reloadPage,
  }: {
    key: string;
    url: string;
    method: "POST" | "DELETE";
    confirmText?: string;
    successMessage: string;
    reloadPage?: number;
  }) => {
    if (confirmText && !window.confirm(confirmText)) return;

    setTrashAction(key);
    setTrashMessage(null);
    setTrashError(null);
    try {
      const response = await fetch(url, { method });
      if (!response.ok) {
        throw new Error(await getResponseError(response, "Trash action failed."));
      }

      const page = reloadPage ?? trashPage;
      const nextPage = page > 1 && trashItems.length <= 1 ? page - 1 : page;
      await loadTrash(nextPage);
      setTrashMessage(successMessage);
    } catch (e) {
      setTrashError(e instanceof Error ? e.message : "Trash action failed.");
    } finally {
      setTrashAction(null);
    }
  };

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

  const trashCellStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "0.7rem 0.5rem",
    borderBottom: "1px solid var(--border)",
    fontSize: "0.875rem",
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
          visibilityEnabled,
          ffmpegParameters,
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
      setVisibilityEnabled(Boolean(payload.visibilityEnabled));
      setFfmpegParameters(payload.ffmpegParameters || ffmpegParameters);
      setMessage("Default upload settings updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
      <div className="glass-panel" style={{ borderRadius: "var(--radius)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Encoder parameters</h2>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem", margin: 0 }}>Optional leading <code>ffmpeg</code> is accepted. Input, output, format, and overwrite options are managed by the application.</p>
        <input value={ffmpegParameters} onChange={(event) => setFfmpegParameters(event.target.value)} aria-label="Encoder parameters" style={{ width: "100%" }} />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Tags</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {tagItems.map((tag) => <button key={tag.id} type="button" className="btn-secondary" onClick={() => setEditingTag(tag)}><Pencil size={14} /> {tag.name}</button>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", color: "var(--muted-foreground)" }}>
          {deletedTags.map((tag) => <button key={tag.id} type="button" className="btn-secondary" onClick={async () => { await fetch("/api/settings/tags", { method: "POST", body: JSON.stringify({ id: tag.id }) }); void loadTags(tagPage); }}>Restore {tag.name}</button>)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>Page {tagPage} of {tagTotalPages}</span><span style={{ display: "flex", gap: "0.5rem" }}><button className="btn-secondary" disabled={tagPage <= 1} onClick={() => void loadTags(tagPage - 1)}>Previous</button><button className="btn-secondary" disabled={tagPage >= tagTotalPages} onClick={() => void loadTags(tagPage + 1)}>Next</button></span></div>
      </section>
      {editingTag ? (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="glass-panel" style={{ padding: "1.25rem", width: "min(24rem, calc(100vw - 2rem))", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Manage tag</h2>
            <input value={editingTag.name} onChange={(event) => setEditingTag({ ...editingTag, name: event.target.value })} aria-label="Tag name" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn-secondary" onClick={() => setEditingTag(null)}>Cancel</button>
              <button className="btn-secondary" onClick={async () => { if (!window.confirm(`Delete ${editingTag.name}?`)) return; await fetch(`/api/settings/tags?id=${encodeURIComponent(editingTag.id)}`, { method: "DELETE" }); setEditingTag(null); void loadTags(tagPage); }}>Delete</button>
              <button className="btn-primary" onClick={async () => { const response = await fetch("/api/settings/tags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingTag) }); if (!response.ok) { const payload = await response.json(); setError(payload.error || "Failed to rename tag."); return; } setEditingTag(null); void loadTags(tagPage); }}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      <section style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>Trash</h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: "0.85rem", margin: 0 }}>
              Items are retained for up to 14 days.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn-secondary"
              onClick={() => void loadTrash(trashPage)}
              disabled={isLoadingTrash || trashAction !== null}
              title="Refresh trash"
              aria-label="Refresh trash"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "2.25rem" }}
            >
              <RefreshCw size={15} style={{ animation: isLoadingTrash ? "spin 1s linear infinite" : "none" }} />
            </button>
            {trashTotal > 0 || trashItems.length > 0 ? (
              <button
                className="btn-secondary"
                onClick={() => void runTrashAction({
                  key: "clear",
                  url: "/api/trash",
                  method: "DELETE",
                  confirmText: `Permanently delete all ${trashTotal || trashItems.length} trash items? This cannot be undone.`,
                  successMessage: "Trash cleared.",
                  reloadPage: 1,
                })}
                disabled={isLoadingTrash || trashAction !== null}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#f87171" }}
              >
                <Trash2 size={15} />
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {trashError && <p role="alert" style={{ color: "#f87171", marginTop: "0.75rem", fontSize: "0.85rem" }}>{trashError}</p>}
        {trashMessage && <p role="status" style={{ color: "#4ade80", marginTop: "0.75rem", fontSize: "0.85rem" }}>{trashMessage}</p>}

        {isLoadingTrash ? (
          <p style={{ color: "var(--muted-foreground)", marginTop: "1rem", fontSize: "0.9rem" }}>Loading trash...</p>
        ) : trashItems.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)", marginTop: "1rem", fontSize: "0.9rem" }}>Trash is empty.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", minWidth: "34rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th scope="col" style={trashCellStyle}>Clip</th>
                  <th scope="col" style={trashCellStyle}>Artifact</th>
                  <th scope="col" style={trashCellStyle}>Deleted</th>
                  <th scope="col" style={trashCellStyle}>Status</th>
                  <th scope="col" style={{ ...trashCellStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashItems.map((item) => (
                  <tr key={`${item.videoId}:${item.artifactKind}`}>
                    <td style={{ ...trashCellStyle, maxWidth: "20rem", overflowWrap: "anywhere" }}>
                      <div>{item.title || item.filename}</div>
                      {item.title && item.title !== item.filename ? (
                        <div style={{ color: "var(--muted-foreground)", fontSize: "0.8rem", marginTop: "0.15rem" }}>{item.filename}</div>
                      ) : null}
                    </td>
                    <td style={{ ...trashCellStyle, whiteSpace: "nowrap" }}>
                      {item.artifactKind === "original" ? "Original" : "Converted"}
                    </td>
                    <td style={{ ...trashCellStyle, whiteSpace: "nowrap" }}>{formatDeletedAt(item.deletedAt)}</td>
                    <td style={{ ...trashCellStyle, color: item.missing ? "#f87171" : "var(--muted-foreground)" }}>
                      {item.missing ? "Missing artifact" : "Available"}
                    </td>
                    <td style={trashCellStyle}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
                        <button
                          type="button"
                          onClick={() => void runTrashAction({
                            key: `restore:${item.videoId}:${item.artifactKind}`,
                            url: `/api/trash/${encodeURIComponent(item.videoId)}/restore?kind=${encodeURIComponent(item.artifactKind)}`,
                            method: "POST",
                            successMessage: `${item.artifactKind === "original" ? "Original" : "Converted"} artifact restored.`,
                          })}
                          disabled={item.missing || isLoadingTrash || trashAction !== null}
                          title={item.missing ? "Cannot restore because the artifact is missing" : `Restore ${item.filename}`}
                          aria-label={item.missing ? `Cannot restore ${item.filename}; artifact is missing` : `Restore ${item.filename}`}
                          style={{ ...iconButtonStyle, opacity: item.missing ? 0.5 : 1, cursor: item.missing ? "not-allowed" : "pointer" }}
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void runTrashAction({
                            key: `delete:${item.videoId}:${item.artifactKind}`,
                            url: `/api/trash/${encodeURIComponent(item.videoId)}?kind=${encodeURIComponent(item.artifactKind)}`,
                            method: "DELETE",
                            confirmText: `Permanently delete ${item.filename}? This cannot be undone.`,
                            successMessage: "Item permanently deleted.",
                          })}
                          disabled={isLoadingTrash || trashAction !== null}
                          title={`Permanently delete ${item.filename}`}
                          aria-label={`Permanently delete ${item.filename}`}
                          style={{ ...iconButtonStyle, color: "#f87171" }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoadingTrash && trashItems.length > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem" }}>
            <span style={{ color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
              Page {trashPage} of {trashTotalPages}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadTrash(trashPage - 1)}
                disabled={trashPage <= 1 || isLoadingTrash || trashAction !== null}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadTrash(trashPage + 1)}
                disabled={trashPage >= trashTotalPages || isLoadingTrash || trashAction !== null}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
