import type { Session } from '@supabase/supabase-js';
import type { Profile, Role } from '@prayer-tower/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from './api';
import { clearOffline } from './offline';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const me = await api.me();
      setProfile(me.profile);
      setRoles(me.roles ?? []);
    } catch {
      setProfile(null);
      setRoles([]);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshProfile();
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) refreshProfile();
      else setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Saved prayers and queued actions belong to this member only.
    await clearOffline();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, roles, loading, refreshProfile, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
