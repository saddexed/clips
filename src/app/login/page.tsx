'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        throw new Error('Invalid password');
      }

      // Automatically redirect to the admin dashboard on success
      router.push('/admin');
      router.refresh(); // Force refresh to clear any cached states
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'url(/grid.svg) var(--background)', // Optional texture if present in global css
    }}>
      <div className="glass-panel animate-in" style={{
        padding: '3rem 2.5rem',
        borderRadius: 'var(--radius)',
        width: '100%',
        maxWidth: '420px',
        textAlign: 'center',
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        border: '1px solid var(--border)'
      }}>
        
        <div style={{
          width: '64px',
          height: '64px',
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)'
        }}>
          <Shield size={32} color="var(--foreground)" />
        </div>

        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>
            Admin Access
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
            Enter your password to unlock the dashboard.
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(0,0,0,0.2)',
                border: error ? '1px solid #ef4444' : '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--foreground)',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />
            {error && (
               <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'left' }}>
                 {error}
               </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--foreground)',
              color: 'var(--background)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '1rem',
              fontWeight: 500,
              cursor: isLoading || !password ? 'not-allowed' : 'pointer',
              opacity: isLoading || !password ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'opacity 0.2s',
            }}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Unlock Dashboard'}
          </button>
        </form>

      </div>
    </div>
  );
}
