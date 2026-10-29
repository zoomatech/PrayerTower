import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import { isBlocked } from '../messages/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from './index.js';
import { MEDIA_BUCKET, signMedia } from './media.js';
import * as growth from '../growth/index.js';
import { settings as practiceSettings } from '../practices/index.js';
import * as calm from '../calm-threads/index.js';
import * as replyChoice from '../reply-choice/index.js';
import * as checkBack from '../check-back/index.js';
import * as coolDown from '../cool-down/index.js';
import * as radioThanks from '../radio/thanksgiving.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov' } as const;

export function postRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null) {
  app.post('/posts', async (req, reply) => {
    const input = posts.NewPost.parse(req.body);
    const userId = requireUser(req);
    const post = await withTx(db, (tx) => posts.create(tx, userId, input));
    reply.code(201);
    // harm: a gentle word for the poster when the harmful-prayer check flagged it (null otherwise).
    return { post: (await posts.cards(db, [post.id], userId))[0], harm: post.harm };
  });

  app.get<{ Params: { id: string } }>('/posts/:id', async (req) => {
    const viewerId = requireUser(req);
    const post = await posts.get(db, req.params.id);
    if (!post || (post.moderation_status !== 'visible' && post.user_id !== viewerId)) throw notFound('Post');
    if (post.user_id !== viewerId && (await isBlocked(db, viewerId, post.user_id))) throw notFound('Post');
    if (post.user_id !== viewerId && !(await posts.inCommunity(db, viewerId, post.community_id))) throw notFound('Post');
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

  // Answered, optionally with a testimony in the same step.
  app.post<{ Params: { id: string } }>('/posts/:id/answered', async (req) => {
    const userId = requireUser(req);
    const { testimony } = z.object({ testimony: z.string().trim().min(1).max(2000).optional() }).parse(req.body ?? {});
    const crisis = await withTx(db, (tx) => markAnsweredAndTell(tx, userId, req.params.id, testimony));
    return { post: (await posts.cards(db, [req.params.id], userId))[0], crisis };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/answered-story', async (req, reply) => {
    const userId = requireUser(req);
    const { body } = AnsweredStory.parse(req.body);
    const r = await withTx(db, (tx) => postAnsweredStory(tx, userId, req.params.id, body));
    reply.code(201);
    return { post: (await posts.cards(db, [r.id], userId))[0], crisis: r.crisis };
  });

  app.put<{ Params: { id: string } }>('/posts/:id/lament', async (req) =>
    posts.setLament(db, requireUser(req), req.params.id, posts.LamentPatch.parse(req.body)),
  );

  app.put<{ Params: { id: string } }>('/posts/:id/testimony', async (req) => {
    const userId = requireUser(req);
    const { body } = posts.Testimony.parse(req.body);
    const crisis = await withTx(db, (tx) => shareTestimony(tx, userId, req.params.id, body));
    return { post: (await posts.cards(db, [req.params.id], userId))[0], crisis };
  });

  app.delete<{ Params: { id: string } }>('/posts/:id/testimony', async (req) => {
    const userId = requireUser(req);
    await posts.removeTestimony(db, userId, req.params.id);
    return { post: (await posts.cards(db, [req.params.id], userId))[0] };
  });

  app.get<{ Params: { id: string } }>('/posts/:id/comments', async (req) => {
    const viewerId = requireUser(req);
    if (!(await posts.getViewable(db, viewerId, req.params.id))) throw notFound('Post');
    return { comments: await posts.listComments(db, req.params.id, viewerId) };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/comments', async (req, reply) => {
    const userId = requireUser(req);
    const input = posts.NewComment.parse(req.body);
    const { comment, coolDown: cool } = await withTx(db, async (tx) => {
      await replyChoice.check(tx, userId, req.params.id);
      await calm.checkSlow(tx, userId, req.params.id);
      const comment = await posts.addComment(tx, userId, req.params.id, input);
      if (!comment.harm) await calm.noteComment(tx, userId, req.params.id, input.body);
      if (input.isUpdate && !comment.harm) await checkBack.noteUpdate(tx, userId, req.params.id);
      return { comment, coolDown: await coolDown.noteComment(tx, userId, req.params.id, input.parentId, input.body) };
    });
    reply.code(201);
    return cool ? { comment, coolDown: true } : { comment };
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
    if (!(await posts.getViewable(db, viewerId, req.params.id))) throw notFound('Post');
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
      const { recipients, nameFor, preview } = await posts.askToPray(tx, userId, req.params.id, input);
      let n = 0;
      for (const recipientId of recipients) {
        const senderName = nameFor(recipientId);
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

/** Mark a request answered and tell the pray-ers once (also used by the follow-up, modules/practices). Returns whether the testimony mentions crisis. */
export async function markAnsweredAndTell(tx: Parameters<typeof posts.setTestimony>[0], userId: string, postId: string, testimony?: string) {
  const post = await posts.markAnswered(tx, userId, postId);
  await growth.queueGuestAnswered(tx, post.id);
  // A request that went out by radio gets a short thanksgiving on the air, while that switch is on.
  await radioThanks.onAnswered(tx, post.id);
  if (testimony) return shareTestimony(tx, userId, postId, testimony);
  await tellPrayersAnswered(tx, userId, post);
  return false;
}

/**
 * "Prayer answered" stories (docs/GROWTH_PRACTICES.md): the poster tells how a request
 * turned out in a post of its own, linked to the request. The request is marked answered
 * if it wasn't, and everyone who prayed hears about the story once.
 */
export const AnsweredStory = z.object({ body: z.string().trim().min(1).max(2000) });

export async function postAnsweredStory(tx: Parameters<typeof posts.setTestimony>[0], userId: string, postId: string, body: string) {
  if (!(await practiceSettings(tx)).answered_stories_enabled) throw badRequest('Answered stories are switched off');
  const request = await posts.get(tx, postId);
  if (!request || request.moderation_status !== 'visible') throw notFound('Post');
  if (request.user_id !== userId) throw forbidden('Only the person who posted the request can share how it turned out');
  if (request.post_type !== 'prayer_request') throw badRequest('Only a request can have an answered story');
  const { rowCount } = await tx.query('select 1 from public.posts where answers_post_id = $1', [postId]);
  if (rowCount) throw conflict('This request already has its story');
  if (request.state !== 'answered') {
    await posts.markAnswered(tx, userId, postId);
    await growth.queueGuestAnswered(tx, postId);
    await radioThanks.onAnswered(tx, postId);
  }
  const story = await posts.create(
    tx,
    userId,
    posts.NewPost.parse({ postType: 'testimony', body, isAnonymous: request.is_anonymous, isSensitive: request.is_sensitive }),
  );
  await tx.query('update public.posts set answers_post_id = $2 where id = $1', [story.id, postId]);
  if (story.moderation_status === 'visible') {
    const who = request.is_anonymous ? null : ((await getProfile(tx, userId))?.display_name || null);
    const excerpt = body.slice(0, 120) + (body.length > 120 ? '…' : '');
    const data = { ...(await answeredData(tx, story.id)), answeredId: postId };
    for (const recipientId of await posts.prayedBy(tx, postId, userId)) {
      await notifications.notify(tx, recipientId, {
        kind: 'testimony',
        title: 'A prayer you prayed was answered',
        body: `${who ?? 'Someone'} shared what God did: "${excerpt}"`,
        data,
        dedupeKey: `story:${postId}`,
        t: { key: 'testimony', params: { who, excerpt } },
      });
    }
  }
  return { id: story.id, crisis: story.crisis };
}

/** With the Believe moment on (docs/GROWTH_PRACTICES.md), the post opens with a "Believe" card for the people who prayed. */
async function answeredData(tx: Parameters<typeof posts.setTestimony>[0], postId: string): Promise<Record<string, string>> {
  return (await practiceSettings(tx)).believe_enabled ? { postId, believe: '1' } : { postId };
}

/** Answered without a testimony: the pray-ers still hear the good news once (Notes p8, Ethel 10–11). */
async function tellPrayersAnswered(tx: Parameters<typeof posts.setTestimony>[0], userId: string, post: Awaited<ReturnType<typeof posts.markAnswered>>) {
  if (post.moderation_status !== 'visible') return;
  const who = post.is_anonymous ? null : ((await getProfile(tx, userId))?.display_name || null);
  const data = await answeredData(tx, post.id);
  for (const recipientId of await posts.prayedBy(tx, post.id, userId)) {
    await notifications.notify(tx, recipientId, {
      kind: 'answered',
      title: 'A prayer you prayed was answered',
      body: `${who ?? 'Someone'} marked their request answered. Thank you for praying.`,
      data,
      dedupeKey: `answered:${post.id}`,
      t: { key: 'answered', params: { who } },
    });
  }
}

/** Save the testimony; the first time, tell everyone who prayed. Returns whether it mentions crisis. */
async function shareTestimony(tx: Parameters<typeof posts.setTestimony>[0], userId: string, postId: string, body: string) {
  const r = await posts.setTestimony(tx, userId, postId, { body });
  if (r.first && r.post.moderation_status === 'visible') {
    const who = r.post.is_anonymous ? null : ((await getProfile(tx, userId))?.display_name || null);
    const data = await answeredData(tx, postId);
    for (const recipientId of await posts.prayedBy(tx, postId, userId)) {
      await notifications.notify(tx, recipientId, {
        kind: 'testimony',
        title: `A prayer you prayed was answered`,
        body: `${who ?? 'Someone'} shared what God did: "${body.slice(0, 120)}${body.length > 120 ? '…' : ''}"`,
        data,
        dedupeKey: `testimony:${postId}`,
        t: { key: 'testimony', params: { who, excerpt: body.slice(0, 120) + (body.length > 120 ? '…' : '') } },
      });
    }
  }
  return r.crisis;
}
