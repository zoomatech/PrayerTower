// Two-step sign-in with an authenticator app (Supabase Auth TOTP MFA,
// https://supabase.com/docs/guides/auth/auth-mfa/totp). The app enrolls and
// verifies factors with Supabase directly; the server only keeps the switch and
// refuses a one-step (aal1) session from a member who has a verified factor.
import { z } from 'zod';
import type { Queryable } from '../../db.js';

export interface SecuritySettings {
  two_step_enabled: boolean;
}

export async function settings(q: Queryable): Promise<SecuritySettings> {
  const { rows } = await q.query<SecuritySettings>('select two_step_enabled from public.security_settings');
  return rows[0] ?? { two_step_enabled: false };
}

export const SettingsPatch = z.object({ twoStepEnabled: z.boolean().optional() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.security_settings set two_step_enabled = coalesce($1, two_step_enabled)', [p.twoStepEnabled ?? null]);
  return settings(q);
}

export async function features(q: Queryable) {
  return { twoStep: (await settings(q)).two_step_enabled };
}
