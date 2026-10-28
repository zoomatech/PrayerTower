import type { Session } from '@supabase/supabase-js';
import type { Profile, Role } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, ApiError, type Community } from './api';
import { authLinkError, parseAuthLink } from './auth-links';
import { setWording, wordingFor } from './i18n';
import { clearOffline } from './offline';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  /** The member's community: decides their feed, the kinds of post they can make, and the wording. */
  community: Community | null;
  loading: boolean;
  /** Set when signed in but the profile couldn't be loaded; the app shows a retry. */
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Signed in from a password reset: the app shows only "Choose a new password" until it's done. */
  recovering: boolean;
  setRecovering: (on: boolean) => void;
  /** Why the last email link didn't work (expired or already used), to show on the sign-in screen. */
  linkError: string | null;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const url = Linking.useLinkingURL();

  const refreshProfile = useCallback(async () => {
    try {
      const me = await api.me();
      setProfile(me.profile);
      setRoles(me.roles ?? []);
      setCommunity(me.community ?? null);
      setWording(wordingFor(me.community));
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
        setCommunity(null);
        setWording('faith');
        setProfileError(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refreshProfile]);

  // A link from a password reset or email change email signs the member in with its session.
  useEffect(() => {
    const link = parseAuthLink(url);
    if (!link) {
      setLinkError(authLinkError(url));
      return;
    }
    setLinkError(null);
    if (link.type === 'recovery') setRecovering(true);
    supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken }).then(({ error }) => {
      if (error) {
        setRecovering(false);
        setLinkError(error.message);
      }
    });
  }, [url]);

  const signOut = useCallback(async () => {
    setRecovering(false);
    await supabase.auth.signOut();
    // Saved prayers and queued actions belong to this member only.
    await clearOffline();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, roles, community, loading, profileError, refreshProfile, signOut, recovering, setRecovering, linkError }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
