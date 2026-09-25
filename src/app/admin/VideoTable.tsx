'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Pencil, X, Save, AlertCircle, CheckCircle, Clock, Activity, AlertTriangle, Eye, EyeOff, Trash2, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SafeVideoPlayer from '@/components/SafeVideoPlayer';
import SearchBar, { type SearchItem } from '@/components/SearchBar';
import { mediaTypeLabel } from '@/lib/media';
import { HistorySizeDetail, getActionDetails } from '@/lib/history-actions';
import { cn, formatBytes } from '@/lib/utils';
import type { VideoSortField, VideoSortOrder } from '@/lib/database';
import { Modal, Pager, Segmented, StatusPill, btn, inputClass, labelClass, panelClass, tableClass, type Tone } from '@/components/ui';

type Video = {
  id: string;
  filename: string;
  title: string;
  description?: string;
  status: string;
  activePath?: string;
  mediaType?: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  originalSize: bigint | number;
  processedSize: bigint | number;
  createdAt: Date;
  uploadedAt: Date;
  date: Date;
  tags: { name: string }[];
  originalMetadata?: any;
  activeMetadata?: any;
  isHidden: boolean;
};

const displayTagName = (name: string) => name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

const formatDateTime = (value: Date | string) =>
  new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

export default function VideoTable({ initialVideos, page, total, totalPages, initialQuery = '', initialTags = [], sortField, sortOrder }: { initialVideos: Video[]; page: number; total: number; totalPages: number; initialQuery?: string; initialTags?: string[]; sortField: VideoSortField; sortOrder: VideoSortOrder }) {
  const router = useRouter();
  const [localVideos, setLocalVideos] = useState<Video[]>(initialVideos);

  useEffect(() => {
    setLocalVideos(initialVideos);
  }, [initialVideos]);

  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [tagToAddSignal, setTagToAddSignal] = useState<{ tag: string; seq: number } | null>(null);

  const handleSort = (field: VideoSortField) => {
    const params = new URLSearchParams(window.location.search);
    params.set('sort', field);
    params.set('order', sortField === field ? (sortOrder === 'asc' ? 'desc' : 'asc') : (field === 'date' || field === 'uploadedAt' ? 'desc' : 'asc'));
    params.delete('page');
    router.push(`/admin?${params.toString()}`);
  };

  const visibleVideos = useMemo(() => {
    if (!filteredIds) return localVideos;
    return localVideos.filter((video) => filteredIds.has(video.id));
  }, [localVideos, filteredIds]);

  const searchItems = useMemo<SearchItem[]>(
    () =>
      localVideos.map((video) => ({
        id: video.id,
        title: video.title,
        filename: video.filename,
        tags: video.tags || [],
      })),
    [localVideos]
  );

  const allAvailableTags = useMemo(
    () =>
      Array.from(
        new Set(
          localVideos
            .flatMap((video) => (video.tags || []).map((tag) => tag.name.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')).filter(Boolean))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [localVideos]
  );

  const handleSearchResultsChange = useCallback((items: SearchItem[]) => {
    setFilteredIds(new Set(items.map((item) => item.id)));
  }, []);

  const handleFiltersChange = useCallback((query: string, tags: string[]) => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('q') || '') === query.trim() && (params.get('tag') || '') === tags.join(',')) return;
    if (query.trim()) params.set('q', query.trim()); else params.delete('q');
    if (tags.length) params.set('tag', tags.join(',')); else params.delete('tag');
    params.delete('page');
    const nextUrl = `/admin${params.toString() ? `?${params.toString()}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) router.replace(nextUrl);
  }, [router]);

  const pageUrl = (nextPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set('page', String(nextPage));
    return `/admin?${params.toString()}`;
  };

  const handleEditComplete = (updatedVideo: Video) => {
    setLocalVideos(localVideos.map(v => v.id === updatedVideo.id ? updatedVideo : v));
    setEditingVideo(null);
    router.refresh();
  };

  const handleToggleVisibility = async (vid: Video) => {
    // Optimistic UI update
    setLocalVideos(localVideos.map(v => v.id === vid.id ? { ...v, isHidden: !v.isHidden } : v));
    try {
      await fetch(`/api/videos/${vid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden: !vid.isHidden })
      });
      router.refresh();
    } catch (e) {
      console.error(e);
      setLocalVideos(localVideos.map(v => v.id === vid.id ? { ...v, isHidden: vid.isHidden } : v));
    }
  };

  const handleDeleteInline = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video? It will be moved to the recycle bin.')) return;
    // Optimistic UI update
    setLocalVideos(localVideos.filter(v => v.id !== id));
    try {
      await fetch(`/api/videos/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
      // Revert logic would require caching the deleted item, but for now we accept the risk
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SearchBar
        items={searchItems}
        onResultsChange={handleSearchResultsChange}
        placeholder="Filter by title or tags"
        tagToAddSignal={tagToAddSignal}
        initialQuery={initialQuery}
        initialTags={initialTags}
        onFiltersChange={handleFiltersChange}
      />

      <div className={cn(panelClass, 'overflow-x-auto')}>
        {visibleVideos.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted">
            No clips match. Remove a tag or change the filter.
          </div>
        ) : (
          <table className={tableClass}>
            <thead>
              <tr>
                <SortableHeader label="Title" field="title" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <th>Tags</th>
                <SortableHeader label="Length" field="duration" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Size" field="originalSize" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Date" field="date" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Uploaded" field="uploadedAt" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleVideos.map((vid) => (
                <tr
                  key={vid.id}
                  className={cn(
                    'cursor-pointer',
                    vid.status === 'FAILED' ? 'bg-bad/5 hover:bg-bad/10' : 'hover:bg-chip/35',
                  )}
                  onClick={() => setEditingVideo(vid)}
                >
                  <td className="max-w-[22rem]">
                    <div className={cn('flex items-center gap-2 font-medium text-ink', vid.isHidden && 'text-muted')}>
                      <span className="truncate">{vid.title || vid.filename}</span>
                      {vid.isHidden ? <EyeOff size={13} className="shrink-0" aria-label="Hidden" /> : null}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted">{vid.id}</div>
                  </td>
                  <td>
                    {vid.tags && vid.tags.length > 0 ? (
                      <div className="flex max-w-[16rem] flex-wrap gap-1">
                        {vid.tags.map(t => {
                          const displayTag = displayTagName(t.name);
                          return (
                            <button
                              key={t.name}
                              type="button"
                              className="cursor-pointer rounded-full bg-chip px-2 py-0.5 font-mono text-[0.6875rem] lowercase text-chip-ink transition-colors hover:ring-1 hover:ring-line"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTagToAddSignal((prev) => ({
                                  tag: displayTag,
                                  seq: (prev?.seq || 0) + 1,
                                }));
                              }}
                              title={`Filter by tag: ${displayTag}`}
                            >
                              #{displayTag}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    <div className="text-ink">{vid.duration ? formatDuration(vid.duration) : '-'}</div>
                    <div className="text-muted">{vid.width && vid.height ? `${vid.width}×${vid.height}` : ''}</div>
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs text-muted">
                    {getCompressionInfo(vid.originalSize, vid.processedSize).columnStr}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {formatDateTime(vid.date || vid.createdAt)}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {formatDateTime(vid.uploadedAt)}
                  </td>
                  <td>
                    <VideoStatus status={vid.status} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleVisibility(vid); }}
                        className={btn('ghost', 'icon-sm')}
                        title={vid.isHidden ? "Hidden from Homepage (Click to Show)" : "Visible on Homepage (Click to Hide)"}
                        aria-label={vid.isHidden ? 'Show on homepage' : 'Hide from homepage'}
                      >
                        {vid.isHidden ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingVideo(vid); }}
                        className={btn('ghost', 'icon-sm')}
                        title="Edit metadata"
                        aria-label="Edit"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteInline(vid.id); }}
                        className={btn('danger', 'icon-sm')}
                        title="Move to Recycle Bin"
                        aria-label="Move to trash"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <Pager page={page} totalPages={totalPages} onPage={(next) => router.push(pageUrl(next))} summary={`${total} clips`} />
      )}

      {editingVideo && (
        <EditVideoModal
          video={editingVideo}
          allTags={allAvailableTags}
          onClose={() => setEditingVideo(null)}
          onSave={handleEditComplete}
          onDelete={(id) => {
            setLocalVideos(localVideos.filter(v => v.id !== id));
            setEditingVideo(null);
          }}
        />
      )}
    </div>
  );
}

function EditVideoModal({ video, allTags, onClose, onSave, onDelete }: { video: Video, allTags: string[], onClose: () => void, onSave: (v: Video) => void, onDelete: (id: string) => void }) {
  const normalizeTag = (input: string) => input.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/[^a-z0-9\s-_]/g, '');

  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    (video.tags || [])
      .map((t) => normalizeTag(t.name))
      .filter(Boolean)
  );
  const [tagQuery, setTagQuery] = useState('');

  const [activeTab, setActiveTab] = useState<'edit' | 'metadata' | 'history'>('edit');
  const [history, setHistory] = useState<any[]>([]);

  // Infer active mode from the value of video.date
  const activeParsedDate = new Date(video.date || video.createdAt).getTime();
  const originalParsedDate = new Date(video.createdAt).getTime();
  const uploadParsedDate = new Date(video.uploadedAt).getTime();

  const isUploadMode = activeParsedDate === uploadParsedDate && activeParsedDate !== originalParsedDate;
  const isOriginalMode = activeParsedDate === originalParsedDate;

  const [dateMode, setDateMode] = useState<'original' | 'upload' | 'custom'>(
    isUploadMode ? 'upload' :
    isOriginalMode ? 'original' :
    'custom'
  );

  // Format dates for datetime-local input
  const pad = (n: number) => n.toString().padStart(2, '0');

  const initialCustomDate = new Date(video.date || video.createdAt);
  const initialCustomDateStr = `${initialCustomDate.getFullYear()}-${pad(initialCustomDate.getMonth() + 1)}-${pad(initialCustomDate.getDate())}T${pad(initialCustomDate.getHours())}:${pad(initialCustomDate.getMinutes())}`;
  const [customDate, setCustomDate] = useState(initialCustomDateStr);

  const originalDate = new Date(video.createdAt);
  const originalDateStr = `${originalDate.getFullYear()}-${pad(originalDate.getMonth() + 1)}-${pad(originalDate.getDate())}T${pad(originalDate.getHours())}:${pad(originalDate.getMinutes())}`;

  const uploadDate = new Date(video.uploadedAt);
  const uploadDateStr = `${uploadDate.getFullYear()}-${pad(uploadDate.getMonth() + 1)}-${pad(uploadDate.getDate())}T${pad(uploadDate.getHours())}:${pad(uploadDate.getMinutes())}`;

  const displayDate = dateMode === 'custom' ? customDate : dateMode === 'upload' ? uploadDateStr : originalDateStr;

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const suggestedTags = useMemo(() => {
    const q = normalizeTag(tagQuery);
    if (!q) return [];
    return allTags.filter((tag) => tag.includes(q) && !selectedTags.includes(tag)).slice(0, 6);
  }, [allTags, selectedTags, tagQuery]);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagQuery('');
  };

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  useEffect(() => {
    if (activeTab !== 'history') return;
    fetch(`/api/history?videoId=${encodeURIComponent(video.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load history')))
      .then((payload) => setHistory(payload.items || []))
      .catch(() => setHistory([]));
  }, [activeTab, video.id]);

  const handleSave = async () => {
    setIsSaving(true);
    setError('');

    try {
      const tagsArray = selectedTags;

      const payloadDate =
        dateMode === 'original' ? video.createdAt
        : dateMode === 'upload' ? video.uploadedAt
        : new Date(customDate);

      const res = await fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          tags: tagsArray,
          date: new Date(payloadDate).toISOString(),
        })
      });

      if (!res.ok) throw new Error('Failed to update video');

      const { video: updatedVideo } = await res.json();
      onSave({ ...video, ...updatedVideo });
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this video? It will be moved to the recycle bin.')) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/videos/${video.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onDelete(video.id);
    } catch (err: any) {
      setError(err.message || 'Deletion failed');
      setIsSaving(false);
    }
  };

  const metadataRows: [string, string][] = [
    ['ID', video.id],
    ['Type', video.mediaType === 'IMAGE' ? 'image' : mediaTypeLabel(video.activeMetadata || video.originalMetadata)],
    ['Duration', video.duration !== null ? `${video.duration}s` : 'N/A'],
    ['Dimensions', video.width && video.height ? `${video.width}×${video.height}` : 'N/A'],
    ['Size', getCompressionInfo(video.originalSize, video.processedSize).editStr],
    ['Date', new Date(video.createdAt).toLocaleString()],
  ];

  return (
    <Modal
      title={`Edit ${video.mediaType === 'IMAGE' ? 'image' : 'video'}`}
      onClose={onClose}
      className="max-w-6xl"
      footer={
        <>
          <button className={btn('danger')} onClick={handleDelete} disabled={isSaving}>
            <Trash2 size={16} />
            Delete
          </button>
          <button className={btn('solid')} onClick={handleSave} disabled={isSaving}>
            <Save size={16} />
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-bad/10 px-4 py-3 text-sm font-medium text-bad">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <Segmented
          className="self-start"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'metadata', label: 'Metadata' },
            { value: 'history', label: 'History' },
          ]}
        />

        {activeTab === 'edit' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="overflow-hidden rounded-xl bg-black ring-1 ring-line-soft">
              {video.activePath ? (
                video.mediaType === 'IMAGE' ? (
                  <img
                    src={`/v/${video.id}`}
                    alt={video.originalMetadata?.filename || video.title}
                    className="block max-h-[600px] w-full object-contain"
                  />
                ) : (
                  <SafeVideoPlayer
                    src={`/v/${video.id}`}
                  />
                )
              ) : (
                <div className={cn('flex aspect-video w-full flex-col items-center justify-center gap-2 bg-surface-2 text-center', video.status === 'FAILED' ? 'text-bad' : 'text-muted')}>
                  {video.status === 'FAILED' ? (
                     <>
                       <AlertTriangle size={30} />
                       <span className="font-medium">Processing failed</span>
                       <span className="text-sm opacity-80">This media could not be processed.</span>
                     </>
                  ) : (
                     <>
                       <Activity size={30} className="text-info" />
                       <span className="font-medium text-ink">Processing</span>
                       <span className="text-sm">The background worker hasn’t finished this file yet.</span>
                     </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className={labelClass}>Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className={labelClass}>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Add a short description for this clip."
                  className={cn(inputClass, 'h-auto resize-y py-2 leading-relaxed')}
                />
              </label>

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
                      if (e.key === 'Tab' && suggestedTags.length > 0) {
                        e.preventDefault();
                        addTag(suggestedTags[0]);
                        return;
                      }

                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const exact = allTags.find((t) => t === normalizeTag(tagQuery));
                        addTag(exact || tagQuery);
                        return;
                      }

                      if ((e.key === 'Backspace' || e.key === 'Delete') && !tagQuery.trim() && selectedTags.length > 0) {
                        e.preventDefault();
                        setSelectedTags((prev) => prev.slice(0, -1));
                      }
                    }}
                    placeholder="Add a tag, then Enter"
                    aria-label="Add tag"
                    className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-none"
                  />
                </div>
                {suggestedTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedTags.slice(0, 3).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="cursor-pointer rounded-full bg-chip px-2.5 py-0.5 font-mono text-xs lowercase text-chip-ink hover:ring-1 hover:ring-line"
                        onClick={() => addTag(tag)}
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <span className={labelClass}>Date</span>
                <Segmented
                  value={dateMode}
                  onChange={setDateMode}
                  options={[
                    { value: 'original', label: 'Original' },
                    { value: 'upload', label: 'Upload' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
                <input
                  type="datetime-local"
                  value={displayDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  disabled={dateMode !== 'custom'}
                  aria-label="Date"
                  className={cn(inputClass, 'font-mono')}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-bg p-5 ring-1 ring-line-soft sm:grid-cols-[8rem_1fr]">
              {metadataRows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className={labelClass}>{label}</dt>
                  <dd className="break-all font-mono text-sm text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {video.originalMetadata && (
              <div className="flex flex-col gap-2">
                <span className={labelClass}>Raw metadata</span>
                <pre className="max-h-[400px] overflow-auto rounded-xl bg-[#0d1b2a] p-5 font-mono text-xs leading-relaxed text-[#e0e1dd]">
                  {JSON.stringify(video.originalMetadata, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? <p className="py-8 text-center text-muted">No history for this clip yet.</p> : (
              <ol className="flex flex-col">
                {history.map((event, index) => {
                  const { icon, label, tone } = getActionDetails(event, 13);
                  const failed = event.status === 'FAILED';
                  const isLast = index === history.length - 1;
                  return (
                    <li key={event.id} className="grid grid-cols-[auto_1.5rem_1fr] gap-x-3">
                      <time className="whitespace-nowrap pt-1 text-right font-mono text-xs text-muted">
                        {new Date(event.completedAt || event.startedAt).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
                        })}
                      </time>
                      <div className="flex flex-col items-center">
                        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface', failed ? 'bg-bad' : 'bg-line')} />
                        {!isLast && <span className="w-px flex-1 bg-line-soft" />}
                      </div>
                      <div className={cn('flex flex-col items-start gap-1', !isLast && 'pb-5')}>
                        <div className="flex items-center gap-2">
                          <StatusPill tone={tone} icon={icon}>{label}</StatusPill>
                          {event.status !== 'COMPLETED' && (
                            <StatusPill tone={failed ? 'bad' : 'neutral'} icon={failed ? <AlertTriangle size={12} /> : undefined}>
                              {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
                            </StatusPill>
                          )}
                        </div>
                        <HistorySizeDetail job={event} />
                        {failed && event.errorMessage ? <div className="text-xs text-bad">{event.errorMessage}</div> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

const VIDEO_STATUS: Record<string, { tone: Tone; label: string; icon: typeof CheckCircle }> = {
  COMPLETED: { tone: 'ok', label: 'Ready', icon: CheckCircle },
  FAILED: { tone: 'bad', label: 'Failed', icon: AlertTriangle },
  PROCESSING: { tone: 'info', label: 'Processing', icon: Activity },
};

function VideoStatus({ status }: { status: string }) {
  const config = VIDEO_STATUS[status] || { tone: 'neutral' as Tone, label: status.charAt(0) + status.slice(1).toLowerCase(), icon: Clock };
  const Icon = config.icon;
  return (
    <span title={status}>
      <StatusPill tone={config.tone} icon={<Icon size={12} />}>{config.label}</StatusPill>
    </span>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}



function getCompressionInfo(originalSize: number | bigint, processedSize: number | bigint | null) {
  const orig = Number(originalSize);
  const proc = processedSize ? Number(processedSize) : orig;

  const ratio = orig > 0 ? Math.round((proc / orig) * 100) : 100;

  const editStr = (!processedSize || proc === orig)
      ? `${formatBytes(orig)} (100%)`
      : `${formatBytes(orig)} → ${formatBytes(proc)} (${ratio}%)`;

  const columnStr = `${formatBytes(proc)} (${ratio}%)`;

  return { columnStr, editStr };
}

function SortableHeader({ label, field, currentField, currentOrder, onSort }: { label: string, field: string, currentField: string, currentOrder: 'asc' | 'desc', onSort: (field: any) => void }) {
  const active = currentField === field;
  return (
    <th aria-sort={active ? (currentOrder === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn('inline-flex cursor-pointer items-center gap-1.5 uppercase transition-colors hover:text-ink', active && 'text-ink')}
      >
        {label}
        {active ? (
          currentOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
        ) : (
          <ArrowUpDown size={13} className="opacity-40" />
        )}
      </button>
    </th>
  );
}
