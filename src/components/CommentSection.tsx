"use client";

import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";

type Comment = {
  id: string;
  content: string;
  createdAt: Date;
};

export default function CommentSection({
  videoId,
  initialComments
}: {
  videoId: string;
  initialComments: { id: string, content: string, createdAt: Date }[]
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, content }),
      });

      if (!res.ok) throw new Error("Failed to post comment");
      
      const { comment } = await res.json();
      setComments([comment, ...comments]); // Prepend to UI list instantly
      setContent("");
    } catch (error) {
      console.error(error);
      alert("Failed to submit comment. Try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <MessageSquare size={20} />
        Comments ({comments.length})
      </h3>

      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius)', marginBottom: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a public comment..."
            rows={3}
            disabled={isSubmitting}
            style={{ 
              width: '100%', 
              padding: '1rem', 
              background: 'rgba(0,0,0,0.2)', 
              border: '1px solid var(--border)', 
              borderRadius: 'var(--radius)', 
              color: 'var(--foreground)',
              resize: 'vertical'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={!content.trim() || isSubmitting}
            >
              <Send size={16} />
              {isSubmitting ? "Posting..." : "Comment"}
            </button>
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {comments.length === 0 ? (
          <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', padding: '2rem' }}>No comments yet. Be the first to start the discussion!</p>
        ) : (
          comments.map(comment => (
            <div key={comment.id} style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1.5rem' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                background: 'var(--secondary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--foreground)',
                fontWeight: 600
              }}>
                A
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--foreground)' }}>Anonymous</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                    {new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p style={{ color: 'var(--foreground)', fontSize: '0.95rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {comment.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
