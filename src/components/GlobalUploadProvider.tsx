'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UploadCloud, X, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverlayOpen, setOverlayOpen] = useState(false);
  const router = useRouter();

  // 1. Process files and add to state
  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = Array.from(files)
      .filter(f => f.type.startsWith('video/'))
      .map(f => ({
        id: Math.random().toString(36).substring(7),
        file: f,
        progress: 0,
        status: 'pending'
      }));

    if (newItems.length > 0) {
      setUploads(prev => [...prev, ...newItems]);
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

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [addFiles]);

  // 3. The actual upload logic (simultaneous runner)
  useEffect(() => {
    // Find all pending uploads and start them
    uploads.filter(u => u.status === 'pending').forEach(upload => {
      // Mark as uploading immediately to prevent double-firing
      setUploads(prev => prev.map(p => p.id === upload.id ? { ...p, status: 'uploading', progress: 10 } : p));

      const doUpload = async () => {
        try {
          const formData = new FormData();
          formData.append('file', upload.file);
          
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Upload failed');
          }

          const data = await res.json();

          setUploads(prev => prev.map(p => 
            p.id === upload.id ? { ...p, status: 'success', progress: 100, videoId: data.videoId } : p
          ));
        } catch (err: any) {
          setUploads(prev => prev.map(p => 
            p.id === upload.id ? { ...p, status: 'error', progress: 0, error: err.message || 'Error occurred' } : p
          ));
        }
      };

      doUpload();
    });
  }, [uploads]);

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(p => p.id !== id));
  };

  const clearCompleted = () => {
    setUploads(prev => prev.filter(p => p.status === 'uploading' || p.status === 'pending'));
    if (uploads.filter(p => p.status === 'uploading' || p.status === 'pending').length === 0) {
      setOverlayOpen(false);
      router.refresh();
    }
  };

  return (
    <GlobalUploadContext.Provider value={{ uploads, addFiles, removeUpload, clearCompleted, isOverlayOpen, setOverlayOpen }}>
      {children}

      {/* The Global Drag Overlay -> Styled to resemble the Upload Manager */}
      {isDragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="glass-panel animate-in" style={{
            width: '100%',
            maxWidth: '600px',
            borderRadius: 'var(--radius)',
            padding: '4rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px dashed var(--primary)'
          }}>
            <div style={{ background: 'var(--secondary)', padding: '1.5rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
              <UploadCloud size={48} className="text-white" />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Drop videos to upload</h3>
            <p style={{ color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>Files will be instantly queued for conversion.</p>
          </div>
        </div>
      )}

      {/* Hidden File Input for OS Selection */}
      <input type="file" id="global-os-file-picker" multiple accept="video/*" style={{ display: 'none' }} onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        // Reset the input value so the same file can be selected again if needed
        e.target.value = '';
      }} />

      {/* The Floating Action Button (FAB) */}
      <button 
        onClick={() => document.getElementById('global-os-file-picker')?.click()}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'var(--foreground)',
          color: 'var(--background)',
          border: 'none',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
      >
        <Plus size={32} />
      </button>

      {/* The Active Uploads Overlay Pane */}
      {isOverlayOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }} onClick={() => setOverlayOpen(false)}>
          <div 
            className="glass-panel animate-in"
            onClick={(e) => e.stopPropagation()} 
            style={{
              width: '100%',
              maxWidth: '600px',
              maxHeight: '80vh',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--card)'
            }}
          >
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Upload Manager</h3>
              <button onClick={() => setOverlayOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {uploads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--muted-foreground)' }}>
                  <UploadCloud size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p>No active uploads.</p>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Drag & drop files anywhere on the screen, or click the + button.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {uploads.map(up => (
                    <div key={up.id} style={{ background: 'var(--scene)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 500, wordBreak: 'break-all', paddingRight: '1rem' }}>{up.file.name}</div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {up.status === 'success' ? (
                          <CheckCircle2 size={20} color="#4ade80" />
                        ) : up.status === 'error' ? (
                          <AlertCircle size={20} color="#f87171" />
                        ) : (
                          <div style={{ flex: 1, height: '6px', background: 'var(--secondary)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: up.progress + '%', background: 'var(--foreground)', transition: 'width 0.3s ease' }} />
                          </div>
                        )}
                        <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', width: '60px', textAlign: 'right' }}>
                          {up.status === 'success' ? 'Done' : up.status === 'error' ? 'Failed' : (up.progress + '%')}
                        </span>
                      </div>
                      {up.error && <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '0.5rem' }}>{up.error}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {uploads.length > 0 && (
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', background: 'rgba(9, 9, 11, 0.4)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <label className="btn-primary" style={{ margin: 0 }}>
                  Select Files
                  <input type="file" multiple accept="video/*" style={{ display: 'none' }} onChange={(e) => {
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
