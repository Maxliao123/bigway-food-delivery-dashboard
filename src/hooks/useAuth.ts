// src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Session, AuthError } from '@supabase/supabase-js';

const AUTH_ENABLED = import.meta.env.VITE_ENABLE_AUTH === 'true';

export type UserRole = 'RM' | 'COO';
export type AllowedRegion = 'BC' | 'ON' | 'CA' | 'ALL';

type AuthState = {
  session: Session | null;
  loading: boolean;
};

const noopSignIn = async (): Promise<AuthError | null> => null;
const noopSignOut = async (): Promise<void> => {};

export function useAuth() {
  // Always call hooks unconditionally (React rules of hooks)
  const [authState, setAuthState] = useState<AuthState>({
    session: null,
    loading: AUTH_ENABLED, // only loading if auth is enabled
  });

  useEffect(() => {
    if (!AUTH_ENABLED) return;

    // Check existing session on mount (handles refresh persistence)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState({ session, loading: false });
    });

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState({ session, loading: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthError | null> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // If auth is disabled (dev site), return defaults
  if (!AUTH_ENABLED) {
    return {
      authEnabled: false as const,
      session: null as Session | null,
      loading: false,
      userRole: 'COO' as UserRole,
      allowedRegion: 'ALL' as AllowedRegion,
      signIn: noopSignIn,
      signOut: noopSignOut,
    };
  }

  // Read role & region from user_metadata
  const meta = authState.session?.user?.user_metadata ?? {};
  const userRole: UserRole = meta.role === 'COO' ? 'COO' : 'RM';
  const allowedRegion: AllowedRegion = meta.region ?? 'ALL';

  return {
    authEnabled: true as const,
    session: authState.session,
    loading: authState.loading,
    userRole,
    allowedRegion,
    signIn,
    signOut,
  };
}
