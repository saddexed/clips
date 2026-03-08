'use client';

import { useState, useEffect, useOptimistic, useTransition, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X, Save, AlertCircle, CheckCircle, Clock, Activity, AlertTriangle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SafeVideoPlayer from '@/components/SafeVideoPlayer';

type Video = {
  id: string;
  filename: string;
  title: string;
  description: string;
  status: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  originalSize: bigint | number;
  processedSize: bigint | number;
  createdAt: Date;
  tags: { name: string }[];
  originalMetadata?: any;
  isHidden: boolean;
};

export default function VideoTable({ initialVideos }: { initialVideos: Video[] }) {
  const router = useRouter();
  // We use useMemo to force a re-render when initialVideos identity changes deeply
  // NextJS router.refresh() updates Server Component props, but React might hold old state
  // if we simply use useState.
  const [localVideos, setLocalVideos] = useState<Video[]>(initialVideos);
  
  useEffect(() => {
    setLocalVideos(initialVideos);
  }, [initialVideos]);

  const [editingVideo, setEditingVideo] = useState<Video | null>(null);

  const handleEditComplete = (updatedVideo: Video) => {
    setLocalVideos(localVideos.map(v => v.id === updatedVideo.id ? updatedVideo : v));
    setEditingVideo(null);
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

  const videos = localVideos;

  return (
    <>
      <div className="glass-panel" style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {videos.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
            <p>No videos found in the library.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title / File</th>
                <th>Tags</th>
                <th>Duration / Res</th>
                <th>Size</th>
                <th>Uploaded At</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((vid) => (
                <tr 
                  key={vid.id} 
                  style={{ transition: 'background-color 0.2s', cursor: 'pointer' }}
                  onClick={() => setEditingVideo(vid)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>
                      {vid.title || vid.filename}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                      ID: {vid.id.slice(0, 8)}...
                    </div>
                  </td>
                  <td>
                    {vid.tags && vid.tags.length > 0 ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {vid.tags.map(t => (
                          <span key={t.name} style={{ background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                            #{t.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>None</span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
                      {vid.duration ? `${Math.round(vid.duration)}s` : '-'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                      {vid.width && vid.height ? `${vid.width}x${vid.height}` : ''}
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted-foreground)' }}>
                    {formatBytes(vid.originalSize)}
                    {vid.processedSize ? ` → ${formatBytes(vid.processedSize)}` : ''}
                  </td>
                  <td style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(vid.createdAt).toLocaleString(undefined, { 
                      year: 'numeric', month: 'numeric', day: 'numeric', 
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td style={{ textAlign: 'center' }} title={vid.status}>
                    <StatusIcon status={vid.status} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleToggleVisibility(vid); }}
                        style={{ padding: '0.4rem', background: 'var(--secondary)', border: 'none', borderRadius: '0.375rem', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background-color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--secondary)'}
                        title={vid.isHidden ? "Hidden from Homepage (Click to Show)" : "Visible on Homepage (Click to Hide)"}
                      >
                        {vid.isHidden ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingVideo(vid); }}
                        style={{ padding: '0.4rem', background: 'var(--secondary)', border: 'none', borderRadius: '0.375rem', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background-color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--secondary)'}
                        title="Edit metadata"
                      >
                        <Pencil size={20} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteInline(vid.id); }}
                        style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '0.375rem', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background-color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                        title="Move to Recycle Bin"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingVideo && (
        <EditVideoModal 
          video={editingVideo} 
          onClose={() => setEditingVideo(null)} 
          onSave={handleEditComplete}
          onDelete={(id) => {
            setLocalVideos(localVideos.filter(v => v.id !== id));
            setEditingVideo(null);
          }}
        />
      )}
    </>
  );
}

function EditVideoModal({ video, onClose, onSave, onDelete }: { video: Video, onClose: () => void, onSave: (v: Video) => void, onDelete: (id: string) => void }) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [tagsInput, setTagsInput] = useState(video.tags?.map(t => t.name).join(', ') || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError('');

    try {
      // Parse tags separated by commas
      const tagsArray = tagsInput.split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const res = await fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          tags: tagsArray
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

  if (!mounted) return null;

  return createPortal(
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50
      }}
    >
      <div 
        className="glass-panel animate-in" 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 'var(--radius)',
          padding: '2rem',
          position: 'relative'
        }}
      >
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
        
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Edit Video Info</h2>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {/* Left Column: Player & Metadata */}
          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {video.status === 'COMPLETED' ? (
              <SafeVideoPlayer 
                src={`/api/videos/stream/${video.id}`} 
              />
            ) : (
              <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--card)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)' }}>
                Preview Not Available
              </div>
            )}
            
            <div style={{ fontSize: '0.875rem', background: 'var(--secondary)', padding: '0.75rem', borderRadius: 'var(--radius)', wordBreak: 'break-all' }}>
              <strong>Original Filename:</strong> {video.originalMetadata?.originalFilename || video.filename}<br/>
              <strong>Date:</strong> {new Date(video.createdAt).toLocaleString()}<br/>
              <strong>ID:</strong> {video.id}
            </div>
          </div>

          {/* Right Column: Editable Fields */}
          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Title</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--foreground)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '0.75rem', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--foreground)', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Tags (comma separated)</label>
              <input 
                type="text" 
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. funny, headshot, win"
                style={{ width: '100%', padding: '0.75rem', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--foreground)' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <button 
            className="btn-secondary" 
            style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} 
            onClick={handleDelete} 
            disabled={isSaving}
          >
            Delete
          </button>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
              <Save size={18} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED': return <CheckCircle size={20} color="#4ade80" />;
    case 'FAILED': return <AlertTriangle size={20} color="#f87171" />;
    case 'PROCESSING': return <Activity size={20} color="#60a5fa" />;
    default: return <Clock size={20} color="#94a3b8" />;
  }
}

function formatBytes(bytes: number | bigint | null) {
  if (bytes === null) return '-';
  const val = Number(bytes);
  if (val === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(val) / Math.log(k));
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
