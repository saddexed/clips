'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { UploadCloud, X, CheckCircle2, AlertCircle, Plus, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { btn } from '@/components/ui';

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

export type UploadItem = {
  id: string; // unique local id
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  videoId?: string;
};

interface GlobalUploadContextType {
  uploads: UploadItem[];
  addFiles: (files: FileList | File[]) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  isOverlayOpen: boolean;
  setOverlayOpen: (open: boolean) => void;
}

const GlobalUploadContext = createContext<GlobalUploadContextType | undefined>(undefined);

export function GlobalUploadProvider({ children }: { children: ReactNode }) {
  const MAX_CONCURRENT_UPLOADS = 3;
  const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverlayOpen, setOverlayOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const router = useRouter();

  // 1. Process files and add to state
  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Check for invalid files
    const invalidFiles = fileArray.filter(f => !f.type.startsWith('video/') && !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      setFileError('Invalid file type, only images and videos are supported.');
      setTimeout(() => setFileError(null), 3000);
    }

    const newItems: UploadItem[] = fileArray
      .filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'))
      .map(f => ({
        id: Math.random().toString(36).substring(7),
        file: f,
        progress: 0,
        status: 'pending'
      }));

    if (newItems.length > 0) {
      setUploads(prev => [...prev, ...newItems]);
      setOverlayOpen(true);
    } else if (invalidFiles.length > 0) {
      // Open overlay to show the error even if no valid files were dropped
      setOverlayOpen(true);
    }
  }, []);

  // 2. The global drag handlers
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        addFiles(e.clipboardData.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('paste', handlePaste);
    };
  }, [addFiles]);

  const doUpload = useCallback(async (upload: UploadItem) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('Upload timeout'), UPLOAD_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append('file', upload.file);
      formData.append('lastModified', upload.file.lastModified.toString());

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = 'Upload failed';
        try {
          const data = await res.json();
          message = data?.error || message;
        } catch {
          // no-op, keep fallback message
        }
        throw new Error(message);
      }

      const data = await res.json();

      setUploads(prev => prev.map(p =>
        p.id === upload.id ? { ...p, status: 'success', progress: 100, videoId: data.videoId } : p
      ));
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || err?.message === 'Upload timeout';
      setUploads(prev => prev.map(p =>
        p.id === upload.id
          ? { ...p, status: 'error', progress: 0, error: isAbort ? 'Upload timed out. Please retry.' : (err?.message || 'Error occurred') }
          : p
      ));
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // 3. Controlled queue runner (prevents stalled pending files)
  useEffect(() => {
    const activeCount = uploads.filter(u => u.status === 'uploading').length;
    if (activeCount >= MAX_CONCURRENT_UPLOADS) return;

    const availableSlots = MAX_CONCURRENT_UPLOADS - activeCount;
    const nextPending = uploads.filter(u => u.status === 'pending').slice(0, availableSlots);
    if (nextPending.length === 0) return;

    for (const upload of nextPending) {
      // Mark as uploading immediately so this item won't be picked again
      setUploads(prev => prev.map(p => p.id === upload.id ? { ...p, status: 'uploading', progress: 10 } : p));
      void doUpload(upload);
    }
  }, [uploads, doUpload]);

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(p => p.id !== id));
  };

  const clearCompleted = () => {
    setUploads(prev => {
      const remaining = prev.filter(p => p.status === 'uploading' || p.status === 'pending');
      if (remaining.length === 0) {
        setOverlayOpen(false);
        router.refresh();
      }
      return remaining;
    });
  };

  // 4. Compute overall progress for the minimized tracker
  const combinedProgress = useMemo(() => {
    if (uploads.length === 0) return 0;
    const totalSelected = uploads.length * 100;
    const currentAbsolute = uploads.reduce((acc, curr) => acc + curr.progress, 0);
    return Math.floor((currentAbsolute / totalSelected) * 100);
  }, [uploads]);

  const activeUploads = uploads.filter(u => u.status === 'uploading' || u.status === 'pending').length;
  const errorUploads = uploads.filter(u => u.status === 'error').length;
  const completedUploads = uploads.filter(u => u.status === 'success').length;
  const showMiniTracker = !isOverlayOpen && uploads.length > 0;

  return (
    <GlobalUploadContext.Provider value={{ uploads, addFiles, removeUpload, clearCompleted, isOverlayOpen, setOverlayOpen }}>
      {children}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
      `}} />

      {/* The Global Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d1b2a]/55 p-4 backdrop-blur-sm">
          <div className="animate-in flex w-full max-w-xl flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface px-8 py-16 text-center">
            <div className="mb-3 grid size-20 place-items-center rounded-full bg-chip text-chip-ink">
              <UploadCloud size={40} />
            </div>
            <h3 className="font-display text-2xl font-bold tracking-tight text-ink">Drop files to upload</h3>
            <p className="text-muted">Files are queued for conversion as soon as they land.</p>
          </div>
        </div>
      )}

      {/* Hidden File Input for OS Selection */}
      <input type="file" id="global-os-file-picker" multiple accept="video/*,image/*" className="hidden" onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        // Reset the input value so the same file can be selected again if needed
        e.target.value = '';
      }} />

      {/* The Floating Action Button (FAB) */}
      <button
        onClick={() => document.getElementById('global-os-file-picker')?.click()}
        title="Upload files"
        aria-label="Upload files"
        className={cn(
          'fixed right-6 z-50 grid size-14 cursor-pointer place-items-center rounded-full bg-solid text-solid-ink shadow-[0_16px_32px_-12px_rgba(13,27,42,0.55)] transition-all duration-300 hover:-translate-y-0.5',
          showMiniTracker ? 'bottom-32' : 'bottom-6',
        )}
      >
        <Plus size={28} />
      </button>

      {/* The Minimized Progress Tracker */}
      {showMiniTracker && (
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          className="animate-in fixed bottom-6 right-6 z-[49] flex w-80 cursor-pointer flex-col gap-3 rounded-2xl bg-surface p-4 text-left text-ink shadow-[0_20px_40px_-16px_rgba(13,27,42,0.5)] ring-1 ring-line-soft transition-transform hover:-translate-y-0.5"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              {activeUploads > 0 ? (
                <Loader2 size={16} className="animate-spin text-info" />
              ) : errorUploads > 0 ? (
                <AlertCircle size={16} className="text-bad" />
              ) : (
                <CheckCircle2 size={16} className="text-ok" />
              )}
              <span>
                {activeUploads > 0 ? `Uploading ${activeUploads} file${activeUploads > 1 ? 's' : ''}` :
                 errorUploads > 0 ? `${errorUploads} failed` : 'Uploads complete'}
              </span>
            </div>
            {activeUploads > 0 && <span className="font-mono text-xs text-muted">{combinedProgress}%</span>}
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn(
                'h-full transition-[width,background-color] duration-300',
                errorUploads > 0 && activeUploads === 0 ? 'bg-bad' : activeUploads === 0 ? 'bg-ok' : 'bg-solid',
              )}
              style={{ width: `${combinedProgress}%` }}
            />
          </div>

          <div className="flex w-full justify-between font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
            <span>{completedUploads} / {uploads.length} finished</span>
            <span>View details</span>
          </div>
        </button>
      )}

      {/* The Active Uploads Overlay Pane */}
      {isOverlayOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1b2a]/55 p-4 backdrop-blur-sm" onClick={() => setOverlayOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Uploads"
            onClick={(e) => e.stopPropagation()}
            className="animate-in flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface text-ink ring-1 ring-line-soft"
          >
            <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
              <h3 className="font-display text-lg font-bold tracking-tight">Uploads</h3>
              <button onClick={() => setOverlayOpen(false)} className={btn('ghost', 'icon-sm')} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {fileError && (
              <div
                className="flex items-center gap-2 border-b border-bad/25 bg-bad/10 px-6 py-3 text-sm font-medium text-bad"
                style={{ animation: 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both' }}
              >
                <AlertCircle size={16} />
                {fileError}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              {uploads.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
                  <UploadCloud size={44} className="mb-2 opacity-60" />
                  <p className="text-ink">No uploads yet.</p>
                  <p className="text-sm">Drop files anywhere on the page, paste them, or use the + button.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {uploads.map(up => (
                    <li key={up.id} className="flex flex-col gap-2 rounded-xl bg-bg p-4 ring-1 ring-line-soft">
                      <div className="break-all text-sm font-medium">{up.file.name}</div>

                      <div className="flex items-center gap-4">
                        {up.status === 'success' ? (
                          <CheckCircle2 size={18} className="text-ok" />
                        ) : up.status === 'error' ? (
                          <AlertCircle size={18} className="text-bad" />
                        ) : (
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full bg-solid transition-[width] duration-300" style={{ width: up.progress + '%' }} />
                          </div>
                        )}
                        <span className="ml-auto w-16 text-right font-mono text-xs text-muted">
                          {up.status === 'success' ? 'Done' : up.status === 'error' ? 'Failed' : (up.progress + '%')}
                        </span>
                      </div>
                      {up.error && <div className="text-xs text-bad">{up.error}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {uploads.length > 0 && (
              <div className="flex justify-end gap-3 border-t border-line-soft bg-bg/40 px-6 py-4">
                <label className={btn('solid')}>
                  Select files
                  <input type="file" multiple accept="video/*,image/*" className="hidden" onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </GlobalUploadContext.Provider>
  );
}

export function useGlobalUpload() {
  const context = useContext(GlobalUploadContext);
  if (context === undefined) {
    throw new Error('useGlobalUpload must be used within a GlobalUploadProvider');
  }
  return context;
}
