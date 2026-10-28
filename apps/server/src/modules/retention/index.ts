// Data retention, as promised in docs/legal/PRIVACY_POLICY_DRAFT.md. Runs daily
// in the worker. Each period is set in days by an env var; 0 turns that purge off.
//
// - Removed content: requests, comments, encouragements, messages and events
//   that moderators removed keep their row (moderation records point at it) but
//   lose their text and photos once the period has passed since the decision,
//   unless an appeal is still pending.
// - Notifications older than the period are deleted, read or not.
// - Finished queues: deletion requests sent from the website (they hold an
//   email address) once handled, push tokens Expo reported dead, and scheduled
//   gifts that are done, cancelled or failed.
import type { Task } from 'graphile-worker';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';

export const REMOVED_TEXT = '(removed)';

export interface RetentionPeriods {
  removedDays: number;
  notificationDays: number;
  queueDays: number;
}

export const periodsFrom = (config: Pick<Config, 'RETENTION_REMOVED_DAYS' | 'RETENTION_NOTIFICATION_DAYS' | 'RETENTION_QUEUE_DAYS'>): RetentionPeriods => ({
  removedDays: config.RETENTION_REMOVED_DAYS,
  notificationDays: config.RETENTION_NOTIFICATION_DAYS,
  queueDays: config.RETENTION_QUEUE_DAYS,
});

export interface PurgeResult {
  posts: number;
  comments: number;
  reactions: number;
  messages: number;
  events: number;
  notifications: number;
  deletionRequests: number;
  pushTokens: number;
  scheduledGifts: number;
  /** Storage paths of photos whose rows were removed; the caller deletes the files. */
  mediaPaths: string[];
}

// Removed this long ago: the last moderator decision on it, else when it was written.
const due = (target: string, alias: string, created = `${alias}.created_at`) => `
  ${alias}.moderation_status = 'removed'
  and coalesce((select max(m.decided_at) from public.moderation_items m
                 where m.target_type = '${target}' and m.target_id = ${alias}.id), ${created}) < now() - make_interval(days => $1)
  and not exists (select 1 from public.moderation_items m join public.moderation_appeals a on a.moderation_item_id = m.id
                   where m.target_type = '${target}' and m.target_id = ${alias}.id and a.status = 'pending')`;

export async function purge(q: Queryable, p: RetentionPeriods): Promise<PurgeResult> {
  const r: PurgeResult = { posts: 0, comments: 0, reactions: 0, messages: 0, events: 0, notifications: 0, deletionRequests: 0, pushTokens: 0, scheduledGifts: 0, mediaPaths: [] };
  const n = async (sql: string, days: number) => (days > 0 ? ((await q.query(sql, [days])).rowCount ?? 0) : 0);

  if (p.removedDays > 0) {
    const { rows: media } = await q.query<{ storage_path: string }>(
      `delete from public.post_media pm using public.posts p
        where pm.post_id = p.id and ${due('post', 'p')} returning pm.storage_path`,
      [p.removedDays],
    );
    r.mediaPaths = media.map((m) => m.storage_path);
    r.posts = await n(`update public.posts p set body = '${REMOVED_TEXT}', background = null, testimony = null, updated_at = now() where p.body not in ('${REMOVED_TEXT}', '(deleted)') and ${due('post', 'p')}`, p.removedDays);
    r.comments = await n(`update public.comments c set body = '${REMOVED_TEXT}' where c.body not in ('${REMOVED_TEXT}', '(deleted)') and ${due('comment', 'c')}`, p.removedDays);
    // A note is required on encouragements, so the whole reaction goes.
    r.reactions = await n(`delete from public.reactions x where ${due('reaction', 'x')}`, p.removedDays);
    r.messages = await n(`update public.messages x set body = '${REMOVED_TEXT}' where x.body <> '${REMOVED_TEXT}' and ${due('message', 'x')}`, p.removedDays);
    r.events = await n(
      `update public.events x set title = '${REMOVED_TEXT}', description = '', location = '${REMOVED_TEXT}', video_url = null
        where x.title <> '${REMOVED_TEXT}' and ${due('event', 'x')}`,
      p.removedDays,
    );
  }

  r.notifications = await n(`delete from public.notifications where created_at < now() - make_interval(days => $1)`, p.notificationDays);

  r.deletionRequests = await n(
    `delete from public.account_deletion_requests where status <> 'pending' and coalesce(handled_at, created_at) < now() - make_interval(days => $1)`,
    p.queueDays,
  );
  r.pushTokens = await n(`delete from public.push_tokens where disabled_at < now() - make_interval(days => $1)`, p.queueDays);
  r.scheduledGifts = await n(
    `delete from public.scheduled_spends where status in ('done', 'cancelled', 'failed') and next_run_at < now() - make_interval(days => $1)`,
    p.queueDays,
  );
  return r;
}

export function purgeTask(q: Queryable, periods: RetentionPeriods, removeMedia: ((paths: string[]) => Promise<void>) | null): Task {
  return async (_payload, helpers) => {
    const r = await purge(q, periods);
    // The rows are already gone, so a retry wouldn't find these paths again: log them instead of failing.
    if (removeMedia && r.mediaPaths.length) {
      await removeMedia(r.mediaPaths).catch((e) => helpers.logger.error(`retention: photos not deleted from storage: ${r.mediaPaths.join(', ')}: ${e}`));
    }
    const { mediaPaths, ...counts } = r;
    helpers.logger.info(`retention: ${JSON.stringify({ ...counts, photos: mediaPaths.length })}`);
  };
}
