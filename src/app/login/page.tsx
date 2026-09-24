'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { btn, inputClass, labelClass } from '@/lib/ui-classes';
import { cn } from '@/lib/utils';

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

      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            sd3xV
          </span>
          <span className="ml-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted">
            admin
          </span>
        </div>

        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-4 rounded-2xl bg-surface p-6 ring-1 ring-line-soft"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <div className="relative">
              <Lock
                size={15}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              />
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'password-error' : undefined}
                className={cn(inputClass, 'pl-9', error && 'border-bad focus:border-bad')}
              />
            </div>
            {error && (
              <p id="password-error" role="alert" className="text-xs text-bad">
                {error}
              </p>
            )}
          </div>

          <button type="submit" disabled={isLoading || !password} className={cn(btn('solid'), 'h-10 w-full')}>
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Unlock dashboard'}
          </button>
        </form>
      </div>
    </main>
  );
}
