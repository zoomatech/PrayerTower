import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { AppError, badRequest } from '../../errors.js';
import * as crosspost from './index.js';
import * as meta from './meta.js';

const provider = (p: unknown) => z.enum(crosspost.SOURCES).parse(p);

/** A photo the extension sends: base64 bytes, at most MAX_IMAGE_BYTES each. */
const ExtensionImage = z.object({ data: z.string().max(Math.ceil((crosspost.MAX_IMAGE_BYTES * 4) / 3) + 4) });
export const ExtensionPost = z.object({
  source: z.enum(crosspost.SOURCES),
  text: z.string().max(20_000).default(''),
  /** The page the post was written on (the extension can't know the new post's own link). */
  pageUrl: z.string().max(2000).optional(),
  images: z.array(ExtensionImage).max(crosspost.MAX_IMAGES).default([]),
});

/** The member's settings, keys and connected accounts. */
export function crosspostRoutes(app: FastifyInstance, db: Db, opts: meta.CrosspostOptions | null) {
  app.get('/crosspost', async (req) => crosspost.status(db, requireUser(req), meta.connectable(opts)));

  app.patch('/crosspost/settings', async (req) => {
    const userId = requireUser(req);
    await crosspost.updateSettings(db, userId, crosspost.SettingsPatch.parse(req.body));
    return crosspost.status(db, userId, meta.connectable(opts));
  });

  app.post('/crosspost/extension-key', async (req) => ({ key: await crosspost.newExtensionKey(db, requireUser(req)) }));
  app.delete('/crosspost/extension-key', async (req) => {
    await crosspost.revokeExtensionKey(db, requireUser(req));
    return { revoked: true };
  });

  app.post<{ Params: { provider: string } }>('/crosspost/:provider/connect', async (req) => ({
    url: await meta.connectUrl(db, requireUser(req), provider(req.params.provider), opts),
  }));
  app.delete<{ Params: { provider: string } }>('/crosspost/:provider', async (req) => {
    await meta.disconnect(db, requireUser(req), provider(req.params.provider));
    return { disconnected: true };
  });
}

const page = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1f2937}</style></head>
<body><h1>${title}</h1><p>${text}</p></body></html>`;

/**
 * No member sign-in: the extension uses its own key (x-crosspost-key), the sign-in
 * return carries a one-time state, and the Threads webhook is signed by Meta.
 */
export function crosspostPublicRoutes(app: FastifyInstance, db: Db, opts: meta.CrosspostOptions | null, storeImage: crosspost.ImageStore | null) {
  // The webhook signature covers the exact bytes Meta sent, so keep them.
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 30 * 1024 * 1024 }, (req, raw, done) => {
    (req as { rawBody?: Buffer }).rawBody = raw as Buffer;
    if ((raw as Buffer).length === 0) return done(null, {});
    try {
      done(null, JSON.parse((raw as Buffer).toString('utf8')));
    } catch {
      done(new AppError(400, 'invalid_request', 'Body is not JSON'), undefined);
    }
  });

  // The browser extension: one post, with its photos, sent the moment the member clicked Post.
  app.post('/crosspost/extension/posts', { bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const key = req.headers['x-crosspost-key'];
    const userId = await crosspost.userForExtensionKey(db, typeof key === 'string' ? key : undefined);
    if (!userId) return reply.code(401).send({ error: 'unauthorized', message: 'Unknown extension key. Make a new one in the app: Me → Cross-posting.' });
    const input = ExtensionPost.parse(req.body);
    const images: { bytes: Buffer; contentType: crosspost.ImageType }[] = [];
    for (const img of input.images) {
      const bytes = Buffer.from(img.data, 'base64');
      const type = bytes.length <= crosspost.MAX_IMAGE_BYTES ? crosspost.sniffImage(bytes) : null;
      if (type) images.push({ bytes, contentType: type });
    }
    if (images.length && !storeImage) throw new AppError(503, 'storage_unavailable', 'Media storage is not configured');
    const pageUrl = input.pageUrl?.startsWith('https://') ? input.pageUrl : null;
    const result = await withTx(db, (tx) =>
      crosspost.importPost(
        tx,
        userId,
        // The extension can't know the new post's id; the text and photos stand in for it.
        { source: input.source, via: 'extension', externalId: `ext:${crosspost.bodyHash(input.text + images.map((i) => i.bytes.length).join(','))}`, text: input.text, permalink: pageUrl, images },
        storeImage,
      ),
    );
    reply.code(result.status === 'posted' ? 201 : 200);
    return result;
  });

  // The return from "Connect Threads" / "Connect Facebook".
  app.get<{ Params: { provider: string }; Querystring: Record<string, string | undefined> }>('/crosspost/:provider/callback', async (req, reply) => {
    reply.type('text/html; charset=utf-8');
    const p = z.enum(crosspost.SOURCES).safeParse(req.params.provider);
    const name = p.success && p.data === 'threads' ? 'Threads' : 'Facebook';
    const { code, state, error } = req.query;
    if (!p.success || error || !code || !state) return reply.code(400).send(page('Not connected', `${name} was not connected. You can close this page and try again from the app.`));
    try {
      await withTx(db, (tx) => meta.finishConnect(tx, p.data, state, code, opts));
    } catch (err) {
      const message = err instanceof AppError ? err.message : `${name} did not accept the sign-in. Try again from the app.`;
      return reply.code(400).send(page('Not connected', message.replace(/[<>&]/g, '')));
    }
    return page(`${name} connected`, `Your new ${name} posts will now appear on your Prayer Tower account too. You can close this page and go back to the app.`);
  });

  // Threads webhook: Meta checks the endpoint with a GET, then POSTs signed notifications.
  app.get<{ Querystring: Record<string, string | undefined> }>('/crosspost/threads/webhook', async (req, reply) => {
    const challenge = meta.verifyWebhook(opts, req.query);
    if (challenge === null) return reply.code(403).type('text/plain').send('Forbidden');
    return reply.type('text/plain').send(challenge);
  });
  app.post('/crosspost/threads/webhook', async (req, reply) => {
    const raw = (req as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    const sig = req.headers['x-hub-signature-256'];
    if (!meta.signatureOk(opts, raw, typeof sig === 'string' ? sig : undefined)) return reply.code(401).send({ error: 'unauthorized', message: 'Bad signature' });
    if (!(await crosspost.enabled(db))) return { queued: 0 };
    if (!req.body || typeof req.body !== 'object') throw badRequest('Expected a JSON body');
    return { queued: await meta.handleWebhook(db, req.body) };
  });
}
