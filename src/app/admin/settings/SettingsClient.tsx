"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, RotateCcw, Trash2, Save, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal, Pager, Segmented, StatusPill, btn, inputClass, labelClass, panelClass, tableClass } from "@/components/ui";

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

function Section({
  title,
  description,
  actions,
  footer,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(panelClass, "flex flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-5 px-5 py-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-bg/40 px-5 py-3">{footer}</div>
      ) : null}
    </section>
  );
}

function Notice({ tone, children }: { tone: "ok" | "bad"; children: ReactNode }) {
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={cn("flex items-center gap-2 text-sm font-medium", tone === "ok" ? "text-ok" : "text-bad")}
    >
      {tone === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      {children}
    </p>
  );
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
  const [tagError, setTagError] = useState<string | null>(null);
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

  // The header reload button broadcasts this event; refresh tags and trash in place.
  useEffect(() => {
    const refresh = () => { void loadTags(tagPage); void loadTrash(trashPage); };
    window.addEventListener("admin-data-refresh", refresh);
    return () => window.removeEventListener("admin-data-refresh", refresh);
  }, [loadTags, loadTrash, tagPage, trashPage]);

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
      setMessage("Upload defaults saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  };

  const closeTagModal = useCallback(() => {
    setEditingTag(null);
    setTagError(null);
  }, []);

  const renameTag = async () => {
    if (!editingTag) return;
    const response = await fetch("/api/settings/tags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingTag) });
    if (!response.ok) {
      const payload = await response.json();
      setTagError(payload.error || "Failed to rename tag.");
      return;
    }
    closeTagModal();
    void loadTags(tagPage);
  };

  const deleteTag = async () => {
    if (!editingTag) return;
    if (!window.confirm(`Delete ${editingTag.name}?`)) return;
    await fetch(`/api/settings/tags?id=${encodeURIComponent(editingTag.id)}`, { method: "DELETE" });
    closeTagModal();
    void loadTags(tagPage);
  };

  const restoreTag = async (id: string) => {
    await fetch("/api/settings/tags", { method: "POST", body: JSON.stringify({ id }) });
    void loadTags(tagPage);
  };

  const trashBusy = isLoadingTrash || trashAction !== null;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section
        title="Upload defaults"
        description="Applied to every new upload."
        footer={
          <>
            <div className="min-h-5">
              {message ? <Notice tone="ok">{message}</Notice> : null}
              {error ? <Notice tone="bad">{error}</Notice> : null}
            </div>
            <button className={btn("solid")} onClick={save} disabled={isSaving}>
              <Save size={16} />
              {isSaving ? "Saving…" : "Save defaults"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <span className={labelClass}>Tags</span>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line-soft bg-bg px-2 py-1.5 transition-colors focus-within:border-line">
            {selectedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-solid px-2.5 py-0.5 font-mono text-xs lowercase text-solid-ink hover:opacity-85"
                onClick={() => removeTag(tag)}
                title="Remove tag"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={11} />
                {tag}
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
              placeholder="Add a tag, then Enter"
              aria-label="Add default tag"
              className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={labelClass}>Visibility</span>
          <Segmented
            className="self-start"
            value={visibilityEnabled ? "visible" : "hidden"}
            onChange={(value) => setVisibilityEnabled(value === "visible")}
            options={[
              { value: "visible", label: <><Eye size={14} />Visible on homepage</> },
              { value: "hidden", label: <><EyeOff size={14} />Hidden</> },
            ]}
          />
        </div>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Encoder parameters</span>
          <input
            value={ffmpegParameters}
            onChange={(event) => setFfmpegParameters(event.target.value)}
            aria-label="Encoder parameters"
            spellCheck={false}
            className={cn(inputClass, "font-mono text-xs")}
          />
          <span className="text-xs text-muted">
            A leading <code className="font-mono">ffmpeg</code> is optional. Input, output, format and overwrite options are set by the app.
          </span>
        </label>
      </Section>

      <Section title="Tags" description="Select a tag to rename or delete it.">
        {tagItems.length === 0 ? (
          <p className="text-sm text-muted">No tags yet. Tags you add to clips appear here.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tagItems.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="cursor-pointer rounded-full bg-chip px-3 py-1 font-mono text-xs lowercase text-chip-ink transition-colors hover:ring-1 hover:ring-line"
                onClick={() => setEditingTag(tag)}
              >
                #{tag.name}
              </button>
            ))}
          </div>
        )}

        {deletedTags.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
            <span className={labelClass}>Deleted tags</span>
            <div className="flex flex-wrap gap-1.5">
              {deletedTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1 font-mono text-xs lowercase text-muted transition-colors hover:border-solid hover:text-ink"
                  onClick={() => void restoreTag(tag.id)}
                  title={`Restore ${tag.name}`}
                >
                  <RotateCcw size={11} />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tagTotalPages > 1 ? (
          <div className="mt-auto">
            <Pager page={tagPage} totalPages={tagTotalPages} onPage={(next) => void loadTags(next)} />
          </div>
        ) : null}
      </Section>

      <Section
        className="xl:col-span-2"
        title="Trash"
        description="Kept for 14 days, then deleted for good."
        actions={
          trashTotal > 0 || trashItems.length > 0 ? (
            <button
              className={btn("danger", "sm")}
              onClick={() => void runTrashAction({
                key: "clear",
                url: "/api/trash",
                method: "DELETE",
                confirmText: `Permanently delete all ${trashTotal || trashItems.length} trash items? This cannot be undone.`,
                successMessage: "Trash emptied.",
                reloadPage: 1,
              })}
              disabled={trashBusy}
            >
              <Trash2 size={14} />
              Empty trash
            </button>
          ) : null
        }
      >
        {trashError && <Notice tone="bad">{trashError}</Notice>}
        {trashMessage && <Notice tone="ok">{trashMessage}</Notice>}

        {isLoadingTrash && trashItems.length === 0 ? (
          <p className="text-sm text-muted">Loading trash…</p>
        ) : trashItems.length === 0 ? (
          <p className="text-sm text-muted">Trash is empty.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto first:-mt-5 last:-mb-5">
            <table className={cn(tableClass, "min-w-[40rem]")}>
              <thead>
                <tr>
                  <th scope="col">Clip</th>
                  <th scope="col">File</th>
                  <th scope="col">Deleted</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashItems.map((item) => (
                  <tr key={`${item.videoId}:${item.artifactKind}`} className="hover:bg-chip/35">
                    <td className="max-w-[20rem]">
                      <div className="break-words font-medium text-ink">{item.title || item.filename}</div>
                      {item.title && item.title !== item.filename ? (
                        <div className="mt-0.5 break-all font-mono text-[0.6875rem] text-muted">{item.filename}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <StatusPill tone="neutral">{item.artifactKind === "original" ? "Original" : "Converted"}</StatusPill>
                    </td>
                    <td className="whitespace-nowrap text-muted">{formatDeletedAt(item.deletedAt)}</td>
                    <td>
                      {item.missing ? (
                        <StatusPill tone="bad" icon={<AlertCircle size={12} />}>Missing file</StatusPill>
                      ) : (
                        <StatusPill tone="ok">Available</StatusPill>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className={btn("ghost", "icon-sm")}
                          onClick={() => void runTrashAction({
                            key: `restore:${item.videoId}:${item.artifactKind}`,
                            url: `/api/trash/${encodeURIComponent(item.videoId)}/restore?kind=${encodeURIComponent(item.artifactKind)}`,
                            method: "POST",
                            successMessage: `${item.artifactKind === "original" ? "Original" : "Converted"} file restored.`,
                          })}
                          disabled={item.missing || trashBusy}
                          title={item.missing ? "Cannot restore because the artifact is missing" : `Restore ${item.filename}`}
                          aria-label={item.missing ? `Cannot restore ${item.filename}; artifact is missing` : `Restore ${item.filename}`}
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button
                          type="button"
                          className={btn("danger", "icon-sm")}
                          onClick={() => void runTrashAction({
                            key: `delete:${item.videoId}:${item.artifactKind}`,
                            url: `/api/trash/${encodeURIComponent(item.videoId)}?kind=${encodeURIComponent(item.artifactKind)}`,
                            method: "DELETE",
                            confirmText: `Permanently delete ${item.filename}? This cannot be undone.`,
                            successMessage: "File permanently deleted.",
                          })}
                          disabled={trashBusy}
                          title={`Permanently delete ${item.filename}`}
                          aria-label={`Permanently delete ${item.filename}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {trashItems.length > 0 && trashTotalPages > 1 ? (
          <Pager page={trashPage} totalPages={trashTotalPages} onPage={(next) => { if (!trashBusy) void loadTrash(next); }} />
        ) : null}
      </Section>

      {editingTag ? (
        <Modal
          title="Edit tag"
          onClose={closeTagModal}
          className="max-w-sm"
          footer={
            <>
              <button className={btn("danger")} onClick={() => void deleteTag()}>
                <Trash2 size={15} />
                Delete
              </button>
              <div className="flex gap-2">
                <button className={btn("ghost")} onClick={closeTagModal}>Cancel</button>
                <button className={btn("solid")} onClick={() => void renameTag()}>Save</button>
              </div>
            </>
          }
        >
          <label className="flex flex-col gap-2">
            <span className={labelClass}>Name</span>
            <input
              value={editingTag.name}
              onChange={(event) => setEditingTag({ ...editingTag, name: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") void renameTag(); }}
              aria-label="Tag name"
              autoFocus
              className={inputClass}
            />
          </label>
          {tagError ? <div className="mt-3"><Notice tone="bad">{tagError}</Notice></div> : null}
        </Modal>
      ) : null}
    </div>
  );
}
