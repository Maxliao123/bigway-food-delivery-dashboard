// src/components/LoginPage.tsx
import React, { useState } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import './LoginPage.css';

type Props = {
  onLogin: (email: string, password: string) => Promise<AuthError | null>;
};

export function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const authError = await onLogin(email, password);
    if (authError) {
      setError(authError.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-header">
          <p className="login-badge">FOOD DELIVERY · INTERNAL</p>
          <h1 className="login-title">Sign In</h1>
          <p className="login-subtitle">
            Enter your credentials to access the dashboard.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className="login-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            autoComplete="email"
            disabled={submitting}
          />

          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            disabled={submitting}
          />

          {error && <p className="login-error">{error}</p>}

          <button
            className="login-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
