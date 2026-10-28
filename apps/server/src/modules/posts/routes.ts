import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { AppError, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import { isBlocked } from '../messages/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from './index.js';
import { MEDIA_BUCKET, signMedia } from './media.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov' } as const;

export function postRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null) {
  app.post('/posts', async (req, reply) => {
    const input = posts.NewPost.parse(req.body);
    const userId = requireUser(req);
    const post = await withTx(db, (tx) => posts.create(tx, userId, input));
    reply.code(201);
    return { post: (await posts.cards(db, [post.id], userId))[0] };
  });

  app.get<{ Params: { id: string } }>('/posts/:id', async (req) => {
    const viewerId = requireUser(req);
    const post = await posts.get(db, req.params.id);
    if (!post || (post.moderation_status !== 'visible' && post.user_id !== viewerId)) throw notFound('Post');
    if (post.user_id !== viewerId && (await isBlocked(db, viewerId, post.user_id))) throw notFound('Post');
    return { post: (await signMedia(storage, await posts.cards(db, [post.id], viewerId)))[0] };
  });

  // The poster deletes their request.
  app.delete<{ Params: { id: string } }>('/posts/:id', async (req) => {
    const userId = requireUser(req);
    const paths = await withTx(db, (tx) => posts.remove(tx, userId, req.params.id));
    if (storage && paths.length) await storage.storage.from(MEDIA_BUCKET).remove(paths);
    return { deleted: true };
  });

  app.delete<{ Params: { id: string } }>('/comments/:id', async (req) => {
    await posts.removeComment(db, requireUser(req), req.params.id);
    return { deleted: true };
  });

  // "Not for me": hide a post from my feed, or bring it back.
  app.put<{ Params: { id: string } }>('/posts/:id/hide', async (req) => {
    const userId = requireUser(req);
    if (!(await posts.get(db, req.params.id))) throw notFound('Post');
    await db.query('insert into public.hidden_posts (user_id, post_id) values ($1, $2) on conflict do nothing', [userId, req.params.id]);
    return { hidden: true };
  });

  app.delete<{ Params: { id: string } }>('/posts/:id/hide', async (req) => {
    await db.query('delete from public.hidden_posts where user_id = $1 and post_id = $2', [requireUser(req), req.params.id]);
    return { hidden: false };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/answered', async (req) => {
    const userId = requireUser(req);
    await posts.markAnswered(db, userId, req.params.id);
    return { post: (await posts.cards(db, [req.params.id], userId))[0] };
  });

  app.get<{ Params: { id: string } }>('/posts/:id/comments', async (req) => {
    const viewerId = requireUser(req);
    if (!(await posts.getVisible(db, req.params.id))) throw notFound('Post');
    return { comments: await posts.listComments(db, req.params.id, viewerId) };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/comments', async (req, reply) => {
    const userId = requireUser(req);
    const input = posts.NewComment.parse(req.body);
    const comment = await withTx(db, (tx) => posts.addComment(tx, userId, req.params.id, input));
    reply.code(201);
    return { comment };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/reactions', async (req, reply) => {
    const userId = requireUser(req);
    const input = posts.NewReaction.parse(req.body);
    const result = await withTx(db, async (tx) => {
      const r = await posts.react(tx, userId, req.params.id, input);
      if (input.kind === 'encouragement' && r.post.user_id !== userId) {
        const sender = input.isAnonymous ? null : await getProfile(tx, userId);
        await notifications.notify(tx, r.post.user_id, {
          kind: 'encouragement',
          title: `${sender?.display_name || 'Someone'} sent you encouragement`,
          body: input.note,
          t: { key: 'encouragement', params: { who: sender?.display_name, body: input.note } },
          data: { postId: r.post.id },
        });
      }
      return r;
    });
    reply.code(201);
    return { reactionId: result.id };
  });

  app.get<{ Params: { id: string } }>('/posts/:id/prayers', async (req) => {
    const viewerId = requireUser(req);
    if (!(await posts.getVisible(db, req.params.id))) throw notFound('Post');
    return posts.prayers(db, req.params.id, viewerId);
  });

  app.post<{ Params: { id: string } }>('/posts/:id/thanks', async (req) => {
    const userId = requireUser(req);
    const input = posts.NewThanks.parse(req.body);
    const sent = await withTx(db, async (tx) => {
      const { recipients } = await posts.thank(tx, userId, req.params.id, input);
      for (const recipientId of recipients) {
        await notifications.notify(tx, recipientId, {
          kind: 'thanks',
          title: 'Thank you for praying',
          body: input.message ?? 'Someone you prayed for sent thanks.',
          t: { key: 'thanks', params: { body: input.message } },
          data: { postId: req.params.id, icon: input.icon },
        });
      }
      return recipients.length;
    });
    return { sent };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/ask', async (req) => {
    const userId = requireUser(req);
    const input = posts.AskToPray.parse(req.body);
    const sent = await withTx(db, async (tx) => {
      const { recipients, senderName, preview } = await posts.askToPray(tx, userId, req.params.id, input);
      let n = 0;
      for (const recipientId of recipients) {
        const id = await notifications.notify(tx, recipientId, {
          kind: 'pray_request',
          title: `${senderName} would like you to pray for this`,
          body: input.note || preview,
          t: { key: 'pray_request', params: { who: senderName, body: input.note || preview } },
          data: { postId: req.params.id },
          dedupeKey: `ask:${req.params.id}:${userId}`,
        });
        if (id) n++;
      }
      return n;
    });
    return { sent };
  });

  // Media is uploaded straight to Supabase Storage with a signed upload URL,
  // so files never pass through (or stay on) the API server.
  app.post('/media/upload-url', async (req) => {
    const userId = requireUser(req);
    const { contentType } = z.object({ contentType: z.enum(Object.keys(EXT) as [keyof typeof EXT]) }).parse(req.body);
    if (!storage) throw new AppError(503, 'storage_unavailable', 'Media storage is not configured');
    const path = `${userId}/${randomUUID()}.${EXT[contentType]}`;
    const { data, error } = await storage.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error) throw new AppError(502, 'storage_error', error.message);
    return { path: data.path, token: data.token, signedUrl: data.signedUrl };
  });
}
