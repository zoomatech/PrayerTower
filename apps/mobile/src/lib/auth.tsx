import type { Session } from '@supabase/supabase-js';
import type { Profile, Role } from '@prayer-tower/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, ApiError } from './api';
import { setWording, wordingForTradition } from './i18n';
import { clearOffline } from './offline';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  loading: boolean;
  /** Set when signed in but the profile couldn't be loaded; the app shows a retry. */
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const me = await api.me();
      setProfile(me.profile);
      setRoles(me.roles ?? []);
      setWording(wordingForTradition(me.community?.tradition));
      setProfileError(null);
    } catch (e) {
      // The account is gone or the sign-in no longer works: back to the sign-in screen.
      if (e instanceof ApiError && e.status === 401) {
        await supabase.auth.signOut();
        await clearOffline();
        return;
      }
      // Anything else (no signal and nothing saved, a server error): keep what we have and offer a retry.
      setProfileError((e as Error).message);
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
      else {
        setProfile(null);
        setRoles([]);
        setWording('faith');
        setProfileError(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Saved prayers and queued actions belong to this member only.
    await clearOffline();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, roles, loading, profileError, refreshProfile, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
