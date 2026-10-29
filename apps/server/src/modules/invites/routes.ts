import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { memberLang } from '../../language.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import type { Mailer } from '../digest/mailer.js';
import { EmailInvite, renderInviteEmail, type InviteLinks } from './email.js';
import { importCsv, ImportInput } from './import.js';
import * as invites from './index.js';
import * as security from '../security/index.js';

/**
 * Public: the sign-in screens ask whether to show the invite code field, "Sign in
 * with a passkey", and "Use a backup code" (before the code, /features is refused).
 */
export function signupConfigRoutes(app: FastifyInstance, db: Db) {
  app.get('/signup-config', async () => {
    const s = await security.settings(db);
    return { inviteOnly: await invites.inviteOnly(db), passkeys: s.passkeys_enabled, backupCodes: s.backup_codes_enabled };
  });
}


export function inviteRoutes(app: FastifyInstance, db: Db, mailer: Mailer | null = null, links: InviteLinks = { webAppUrl: null, appStoreUrl: null, playStoreUrl: null }) {
  const requireAdmin = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/admin/invites', async (req) => {
    await requireAdmin(requireUser(req));
    const [inviteOnly, list] = await Promise.all([invites.inviteOnly(db), invites.list(db)]);
    return { inviteOnly, invites: list };
  });

  app.post('/admin/invites', async (req, reply) => {
    const userId = requireUser(req);
    await requireAdmin(userId);
    const created = await invites.create(db, userId, invites.NewInvites.parse(req.body ?? {}));
    reply.code(201);
    return { invites: created };
  });

  app.post<{ Params: { code: string } }>('/admin/invites/:code/revoke', async (req) => {
    await requireAdmin(requireUser(req));
    return { invite: await invites.revoke(db, req.params.code) };
  });

  // Email a code to someone, in their language. 503 when no SMTP server is set.
  app.post<{ Params: { code: string } }>('/admin/invites/:code/email', async (req, reply) => {
    const userId = requireUser(req);
    await requireAdmin(userId);
    const body = EmailInvite.parse(req.body);
    const invite = (await invites.list(db, { code: req.params.code.toUpperCase() }))[0];
    if (!invite) throw notFound('Invite code');
    if (invite.status !== 'active') throw conflict(`This code is ${invite.status}`);
    if (!mailer) return reply.code(503).send({ error: 'email_off', message: 'Email is not set up (SMTP_URL)' });
    const { rows } = await db.query<{ name: string; locale: 'en' | 'es' }>(
      `select coalesce(nullif(display_name, ''), 'Prayer Tower') as name, locale from public.profiles where id = $1`,
      [userId],
    );
    const lang = memberLang(body.language ?? rows[0]?.locale);
    await mailer(
      renderInviteEmail({ to: body.email, code: invite.code, lang, from: rows[0]?.name ?? 'Prayer Tower', message: body.message, links, community: invite.community }),
    );
    return { sent: true, language: lang };
  });

  // CSV import for a church: members as single-use invites, or starter prayer requests.
  app.post('/admin/import', async (req) => {
    const userId = requireUser(req);
    await requireAdmin(userId);
    const input = ImportInput.parse(req.body);
    const { rows } = await db.query<{ name: string; locale: 'en' | 'es' }>(
      `select coalesce(nullif(display_name, ''), 'Prayer Tower') as name, locale from public.profiles where id = $1`,
      [userId],
    );
    return importCsv(db, userId, input, { mailer, links, from: rows[0]?.name ?? 'Prayer Tower', adminLocale: rows[0]?.locale ?? 'en' });
  });

  app.patch('/admin/invite-settings', async (req) => {
    await requireAdmin(requireUser(req));
    const { inviteOnly } = z.object({ inviteOnly: z.boolean() }).parse(req.body);
    return { inviteOnly: await invites.setInviteOnly(db, inviteOnly) };
  });
}
