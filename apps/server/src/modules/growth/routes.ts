import { crisisLine } from '@prayer-tower/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as site from '../site/index.js';
import * as openCircle from '../site/open-circle.js';
import * as growth from './index.js';

type Id = { Params: { id: string } };

/** Member routes (signed in). */
export function growthRoutes(app: FastifyInstance, db: Db) {
  // 1. Guest prayer: the asker's link for their own request.
  app.get<Id>('/posts/:id/guest-link', async (req) => ({ link: await growth.guestLink(db, requireUser(req), req.params.id) }));
  app.post<Id>('/posts/:id/guest-link', async (req, reply) => {
    reply.code(201);
    return { link: await growth.createGuestLink(db, requireUser(req), req.params.id) };
  });
  app.delete<Id>('/posts/:id/guest-link', async (req) => {
    await growth.revokeGuestLink(db, requireUser(req), req.params.id);
    return { revoked: true };
  });

  // 2. Prayer chain.
  app.get('/me/prayer-chain', async (req) => ({ people: await growth.listChain(db, requireUser(req)) }));
  app.post('/me/prayer-chain', async (req, reply) => {
    const to = growth.ChainMember.parse(req.body);
    const r = await withTx(db, (tx) => growth.addChainMember(tx, requireUser(req), to));
    reply.code(201);
    return r;
  });
  app.delete<Id>('/me/prayer-chain/:id', async (req) => {
    await growth.removeChainMember(db, requireUser(req), req.params.id);
    return { removed: true };
  });
  app.post<Id>('/posts/:id/prayer-chain', async (req) => withTx(db, (tx) => growth.sendToChain(tx, requireUser(req), req.params.id)));

  // 3. Prayed-for widget.
  app.get('/me/prayed-for', async (req) => ({ prayedFor: await growth.prayedForToday(db, requireUser(req)) }));

  // 5. Sharing with consent.
  app.get<Id>('/posts/:id/share', async (req) => ({ share: await growth.shareState(db, requireUser(req), req.params.id) }));
  app.put<Id>('/posts/:id/share', async (req) => {
    const { level } = growth.ShareChoice.parse(req.body);
    return { share: await growth.setShareLevel(db, requireUser(req), req.params.id, level) };
  });

  // 4. Prayer minute.
  app.get('/me/prayer-minute', async (req) => ({ minute: await growth.myMinute(db, requireUser(req)) }));
  app.put('/me/prayer-minute', async (req) => ({ minute: await growth.setMinute(db, requireUser(req), growth.Minute.parse(req.body)) }));
  app.delete('/me/prayer-minute', async (req) => {
    await growth.clearMinute(db, requireUser(req));
    return { cleared: true };
  });
  app.get('/prayer-minute/now', async (req) => ({ now: await growth.now(db, requireUser(req)) }));
  app.post('/prayer-minute/join', async (req) => {
    await growth.join(db, requireUser(req));
    return { joined: true };
  });
}

// Public pages ----------------------------------------------------------------------

const HTML = 'text/html; charset=utf-8';
const esc = site.esc;

/** The page wears Open Circle's brand and wording for a request from that community. */
function brandFor(opts: site.SiteOptions, secular: boolean) {
  return secular && opts.openCircle ? openCircle.brand(opts.openCircle, openCircle.PREFIX) : undefined;
}

function prayPage(opts: site.SiteOptions, token: string, v: growth.GuestView, done: boolean, error?: string) {
  const s = v.secular;
  const who = v.name ? esc(v.name) : 'Someone';
  const base = growth.guestPath(token, s);
  const count = v.prayers > 0 ? `<p>${v.prayers} ${v.prayers === 1 ? 'person has' : 'people have'} ${s ? 'sent support' : 'prayed'} so far.</p>` : '';
  const line = crisisLine(opts.crisisCountry);
  const crisis = v.crisis
    ? `<p class="notice">If someone is in danger right now, ${esc(line.reach)} (${esc(line.name)}).</p>`
    : '';
  const quote = `<blockquote>${esc(v.body).replace(/\n/g, '<br>')}</blockquote>`;
  let action: string;
  if (v.answered) {
    action = `<p class="notice">${s ? 'Good news: this worked out!' : 'Good news: this prayer was answered!'}</p>${v.testimony ? `<blockquote>${esc(v.testimony)}</blockquote>` : ''}`;
  } else if (done) {
    action = `<h2>${s ? 'Thank you for thinking of them.' : 'Thank you for praying.'}</h2>
<p>${who === 'Someone' ? 'They' : who} will see that ${s ? 'someone sent support' : 'someone prayed'} from this link.</p>
<p>${s ? esc(opts.openCircle?.name ?? 'Open Circle') : 'Prayer Tower'} is a small, ad-free, invite-only community. If you'd like to join, ask ${who === 'Someone' ? 'the person who shared this link' : who} for an invite.</p>`;
  } else {
    action = `${error ? `<p class="notice">${esc(error)}</p>` : ''}
<form method="post" action="${esc(base)}">
  <p><label>Your first name (optional)<br><input name="firstName" maxlength="40" autocomplete="given-name"></label></p>
  <p><label>Your email (optional)<br><input name="email" type="email" maxlength="254" autocomplete="email"></label></p>
  <p><label><input type="checkbox" name="notify" value="on"> Email me once if there's good news. Nothing else, ever.</label></p>
  <p style="position:absolute;left:-9999px" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></p>
  <p><button class="button" type="submit" style="border:0;cursor:pointer;font-size:17px">${s ? "🤝 I'm thinking of you" : '🙏 I prayed'}</button></p>
</form>
<p style="font-size:14px">No account needed. We keep your email only if you tick the box, and erase it after that one email.</p>`;
  }
  const title = s ? `${who} could use some support` : `${who} asked for prayer`;
  return site.layout(title, `<h1>${title}</h1>${quote}${count}${crisis}${action}`, '', 'en', brandFor(opts, s));
}

/** The share card: the words the author chose to share, with a first name unless anonymous. */
function cardPage(opts: site.SiteOptions, c: growth.CardView) {
  const s = c.secular;
  const who = c.name ? esc(c.name) : 'Someone';
  const request = c.postType === 'prayer_request';
  const title = request ? (s ? `${who} could use some support` : `${who} asked for prayer`) : s ? `${who} shared this` : `${who} shared this with the church`;
  const quote = `<blockquote>${esc(c.body).replace(/\n/g, '<br>')}</blockquote>`;
  const answered = c.answered
    ? `<p class="notice">${s ? 'Good news: this worked out!' : 'Good news: this prayer was answered!'}</p>${c.testimony ? `<blockquote>${esc(c.testimony)}</blockquote>` : ''}`
    : '';
  const action = c.guestPath
    ? `<p><a class="button" href="${esc(c.guestPath)}">${s ? "🤝 Let them know you're thinking of them" : '🙏 Let them know you prayed'}</a></p>`
    : '';
  const brandName = s ? esc(opts.openCircle?.name ?? 'Open Circle') : 'Prayer Tower';
  const about = `<p style="font-size:14px">${who === 'Someone' ? 'The person who posted this' : who} chose to let it be shared outside ${brandName}, a small, ad-free, invite-only community.</p>`;
  return site.layout(title, `<h1>${title}</h1>${quote}${answered}${action}${about}`, '', 'en', brandFor(opts, s));
}

function chainPage(opts: site.SiteOptions, token: string, e: NonNullable<Awaited<ReturnType<typeof growth.chainEntry>>>) {
  const s = e.secular;
  const name = esc(e.ownerName);
  const what = s ? `${name}'s requests for support` : `${name}'s prayer requests`;
  const by = e.byText ? 'by text message' : 'by email';
  const msgs = e.byText ? 'texts' : 'emails';
  const body =
    e.status === 'confirmed'
      ? `<h1>You're on ${name}'s list.</h1><p>You'll get ${what} ${by}.</p>
<form method="post" action="/chain/${esc(token)}"><input type="hidden" name="join" value="no"><button class="button" type="submit" style="border:0;cursor:pointer">Stop these ${msgs}</button></form>`
      : e.status === 'left'
        ? `<h1>You won't get any more ${msgs}.</h1><p>You won't get ${what}. Changed your mind?</p>
<form method="post" action="/chain/${esc(token)}"><input type="hidden" name="join" value="yes"><button class="button" type="submit" style="border:0;cursor:pointer">Join again</button></form>`
        : `<h1>${s ? `${name} would like to keep you posted.` : `${name} asked you to join their prayer chain.`}</h1>
<p>If you say yes, you'll get ${what} ${by}, each with a one-tap link to let them know you ${s ? 'are thinking of them' : 'prayed'}. No app or account needed.</p>
<form method="post" action="/chain/${esc(token)}" style="display:inline"><input type="hidden" name="join" value="yes"><button class="button" type="submit" style="border:0;cursor:pointer">Yes, send them to me</button></form>
<form method="post" action="/chain/${esc(token)}" style="display:inline"><input type="hidden" name="join" value="no"><button class="button" type="submit" style="border:0;cursor:pointer">No thanks</button></form>`;
  return site.layout(s ? 'Keep in touch' : 'Prayer chain', body, '', 'en', brandFor(opts, s));
}

/** No sign-in: the guest prayer page and the prayer-chain join/leave page. Rate-limited per IP by the caller. */
export function growthPublicRoutes(app: FastifyInstance, db: Db, opts: site.SiteOptions) {
  // Plain HTML forms post url-encoded bodies; they're tiny.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });
  const gone = () => site.layout('Not available', '<h1>This link is not available.</h1><p>It may have been turned off by the person who shared it.</p>', '');

  type Req = FastifyRequest<{ Params: { token: string } }>;
  const show = async (req: Req, reply: FastifyReply) => {
    const v = await growth.guestView(db, req.params.token);
    if (!v) return reply.code(404).type(HTML).send(gone());
    return reply.type(HTML).header('cache-control', 'no-store').header('x-robots-tag', 'noindex').send(prayPage(opts, req.params.token, v, false));
  };
  const pray = async (req: Req, reply: FastifyReply) => {
    const v = await growth.guestView(db, req.params.token);
    if (!v) return reply.code(404).type(HTML).send(gone());
    const parsed = growth.GuestPrayer.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).type(HTML).send(prayPage(opts, req.params.token, v, false, parsed.error.issues[0]?.message ?? 'Please check the form'));
    }
    if (v.answered) return reply.type(HTML).send(prayPage(opts, req.params.token, v, false));
    await withTx(db, (tx) => growth.guestPray(tx, req.params.token, req.clientIp, parsed.data));
    const after = (await growth.guestView(db, req.params.token)) ?? v;
    return reply.type(HTML).header('cache-control', 'no-store').header('x-robots-tag', 'noindex').send(prayPage(opts, req.params.token, after, true));
  };
  // Prayer Tower links are /pray/…; Open Circle's are /circle/… (no religious word in its links). Either works.
  for (const prefix of ['/pray', '/circle']) {
    app.get<{ Params: { token: string } }>(`${prefix}/:token`, show);
    app.post<{ Params: { token: string } }>(`${prefix}/:token`, pray);
  }

  // The share card (sharing with consent): read-only, a 404 unless the author chose a card.
  app.get<{ Params: { token: string } }>('/card/:token', async (req, reply) => {
    const c = await growth.cardView(db, req.params.token);
    if (!c) return reply.code(404).type(HTML).send(gone());
    return reply.type(HTML).header('cache-control', 'no-store').header('x-robots-tag', 'noindex').send(cardPage(opts, c));
  });

  app.get<{ Params: { token: string } }>('/chain/:token', async (req, reply) => {
    const e = await growth.chainEntry(db, req.params.token);
    if (!e) return reply.code(404).type(HTML).send(gone());
    return reply.type(HTML).header('cache-control', 'no-store').header('x-robots-tag', 'noindex').send(chainPage(opts, req.params.token, e));
  });
  // A POST, not the emailed GET, changes anything: mail scanners open links but don't submit forms.
  app.post<{ Params: { token: string } }>('/chain/:token', async (req, reply) => {
    const join = (req.body as { join?: string } | undefined)?.join === 'yes';
    const e = await growth.chainEntry(db, req.params.token);
    if (!e) return reply.code(404).type(HTML).send(gone());
    const after = await growth.chainDecision(db, req.params.token, join);
    return reply.type(HTML).header('cache-control', 'no-store').send(chainPage(opts, req.params.token, after));
  });
}
