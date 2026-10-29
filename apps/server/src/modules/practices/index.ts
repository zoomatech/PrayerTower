// Personal-growth practices ("What would Ted Lasso do?", Steve 2026-10-29), each
// off until Admin → Growth practices turns it on (practice_settings). Research:
// research/Personal_Growth_Research.md; docs/GROWTH_PRACTICES.md.
//   1. Follow-up: once, some days after a request, its author may tell the people
//      who prayed how it's going. A grateful update uses the existing "answered"
//      notice; "prefer not to say" closes it quietly. Nothing counts answers.
//   2. Gratitude card: a private weekly "three good things", reminded on the day
//      the member picks. A skipped week is never mentioned.
//   3. Gentle rhythm: the switch the app reads to show days this month instead of
//      the streak (the numbers are in prayer-stats/).
import type { Task } from "graphile-worker";
import { z } from "zod";
import type { Queryable } from "../../db.js";
import { badRequest, forbidden, notFound } from "../../errors.js";
import { getProfile } from "../accounts/index.js";
import * as notifications from "../notifications/index.js";
import * as posts from "../posts/index.js";

export interface PracticeSettings {
  followup_enabled: boolean;
  followup_days: number;
  gratitude_enabled: boolean;
  gentle_rhythm_enabled: boolean;
}

export async function settings(q: Queryable): Promise<PracticeSettings> {
  const { rows } = await q.query<PracticeSettings>(
    "select followup_enabled, followup_days, gratitude_enabled, gentle_rhythm_enabled from public.practice_settings",
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  followupEnabled: z.boolean().optional(),
  followupDays: z.number().int().min(3).max(120).optional(),
  gratitudeEnabled: z.boolean().optional(),
  gentleRhythmEnabled: z.boolean().optional(),
});

export async function updateSettings(
  q: Queryable,
  p: z.infer<typeof SettingsPatch>,
) {
  await q.query(
    `update public.practice_settings set
       followup_enabled = coalesce($1, followup_enabled), followup_days = coalesce($2, followup_days),
       gratitude_enabled = coalesce($3, gratitude_enabled), gentle_rhythm_enabled = coalesce($4, gentle_rhythm_enabled)`,
    [
      p.followupEnabled ?? null,
      p.followupDays ?? null,
      p.gratitudeEnabled ?? null,
      p.gentleRhythmEnabled ?? null,
    ],
  );
  return settings(q);
}

export async function features(q: Queryable) {
  const s = await settings(q);
  return {
    followupNudge: s.followup_enabled,
    gratitudeCard: s.gratitude_enabled,
    gentleRhythm: s.gentle_rhythm_enabled,
  };
}

// 1. Follow-up ------------------------------------------------------------------------

/**
 * Ask each author once, `followup_days` after an unanswered request that someone
 * prayed for. Requests older than another 30 days are left alone, so turning the
 * switch on doesn't wake up old requests all at once.
 */
export function followupDueTask(q: Queryable): Task {
  return async () => {
    const s = await settings(q);
    if (!s.followup_enabled) return;
    const { rows } = await q.query<{
      id: string;
      user_id: string;
      people: number;
    }>(
      `select p.id, p.user_id,
              (select count(distinct e.user_id)::int from public.prayer_events e where e.post_id = p.id and e.user_id <> p.user_id) as people
         from public.posts p
        where p.post_type = 'prayer_request' and p.state <> 'answered' and p.moderation_status = 'visible'
          and p.created_at < now() - make_interval(days => $1)
          and p.created_at > now() - make_interval(days => $1 + 30)
          and not exists (select 1 from public.request_followups f where f.post_id = p.id)
          and exists (select 1 from public.prayer_events e where e.post_id = p.id and e.user_id <> p.user_id)
        order by p.created_at
        limit 200`,
      [s.followup_days],
    );
    for (const r of rows) {
      const { rowCount } = await q.query(
        "insert into public.request_followups (post_id, user_id) values ($1, $2) on conflict do nothing",
        [r.id, r.user_id],
      );
      if (!rowCount) continue;
      await notifications.notify(q, r.user_id, {
        kind: "followup",
        title: "Share how it's going?",
        body: `${r.people === 1 ? "1 person" : `${r.people} people`} prayed for your request. If you'd like, let them know how it's going. No pressure at all.`,
        data: { postId: r.id, followup: true },
        dedupeKey: `followup:${r.id}`,
      });
    }
  };
}

/** Whether the viewer has an open follow-up on this post. */
export async function followupFor(
  q: Queryable,
  userId: string,
  postId: string,
) {
  if (!(await settings(q)).followup_enabled)
    return { enabled: false, pending: false };
  const { rowCount } = await q.query(
    "select 1 from public.request_followups where post_id = $1 and user_id = $2 and answer is null",
    [postId, userId],
  );
  return { enabled: true, pending: rowCount === 1 };
}

export const FollowupAnswer = z.object({
  answer: z.enum(["grateful", "still", "changed", "private"]),
  body: z.string().trim().min(1).max(2000).optional(),
});

/**
 * Record the author's answer. "grateful" marks the request answered through the
 * caller's `markAnswered` (which tells the pray-ers once, with the body as the
 * testimony). "still" and "changed" with words post an update and tell the pray-ers
 * once. "private" just closes the follow-up.
 */
export async function answerFollowup(
  q: Queryable,
  userId: string,
  postId: string,
  input: z.infer<typeof FollowupAnswer>,
  markAnswered: (testimony?: string) => Promise<boolean>,
) {
  if (!(await settings(q)).followup_enabled)
    throw badRequest("Follow-ups are switched off");
  const post = await posts.get(q, postId);
  if (!post) throw notFound("Post");
  if (post.user_id !== userId) throw forbidden("Only the poster can answer");
  const { rowCount } = await q.query(
    `update public.request_followups set answer = $3, answered_at = now()
      where post_id = $1 and user_id = $2 and answer is null`,
    [postId, userId, input.answer],
  );
  if (!rowCount) throw badRequest("There is no follow-up to answer");
  if (input.answer === "grateful") {
    const crisis =
      post.state === "answered" ? false : await markAnswered(input.body);
    return { answer: input.answer, crisis };
  }
  if ((input.answer === "still" || input.answer === "changed") && input.body) {
    const c = await posts.addComment(q, userId, postId, {
      body: input.body,
      isUpdate: true,
    });
    if (post.moderation_status === "visible" && !c.harm) {
      const who = post.is_anonymous
        ? null
        : (await getProfile(q, userId))?.display_name || null;
      for (const recipientId of await posts.prayedBy(q, postId, userId)) {
        await notifications.notify(q, recipientId, {
          kind: "followup_update",
          title: "An update on a request you prayed for",
          body: `${who ?? "Someone"} shared how it's going: "${input.body.slice(0, 120)}${input.body.length > 120 ? "…" : ""}"`,
          data: { postId },
          dedupeKey: `followup_update:${postId}`,
        });
      }
    }
    return { answer: input.answer, crisis: c.crisis };
  }
  return { answer: input.answer, crisis: false };
}

// 2. Gratitude card ---------------------------------------------------------------------

const weekStartSql = `date_trunc('week', now() at time zone $2)::date`;

async function requireGratitude(q: Queryable) {
  if (!(await settings(q)).gratitude_enabled)
    throw badRequest("The gratitude card is switched off");
}

/** The member's chosen day and this week's card, if any. Earlier weeks are never shown as missed. */
export async function gratitude(
  q: Queryable,
  userId: string,
  timeZone: string,
) {
  if (!(await settings(q)).gratitude_enabled)
    return { enabled: false as const };
  const { rows: pref } = await q.query<{ weekday: number; time_zone: string }>(
    "select weekday, time_zone from public.gratitude_prefs where user_id = $1",
    [userId],
  );
  const tz = pref[0]?.time_zone ?? timeZone;
  const { rows } = await q.query<{ week_start: string; items: string[] }>(
    `select to_char(${weekStartSql}, 'YYYY-MM-DD') as week_start,
            (select items from public.gratitude_entries where user_id = $1 and week_start = ${weekStartSql}) as items`,
    [userId, tz],
  );
  return {
    enabled: true as const,
    weekday: pref[0]?.weekday ?? null,
    weekStart: rows[0]!.week_start,
    items: rows[0]!.items ?? [],
  };
}

export const GratitudeDay = z.object({
  weekday: z.number().int().min(0).max(6).nullable(),
  timeZone: z.string().min(1).max(64),
});

export async function setGratitudeDay(
  q: Queryable,
  userId: string,
  input: z.infer<typeof GratitudeDay>,
) {
  await requireGratitude(q);
  if (input.weekday === null)
    await q.query("delete from public.gratitude_prefs where user_id = $1", [
      userId,
    ]);
  else
    await q.query(
      `insert into public.gratitude_prefs (user_id, weekday, time_zone) values ($1, $2, $3)
       on conflict (user_id) do update set weekday = excluded.weekday, time_zone = excluded.time_zone, updated_at = now()`,
      [userId, input.weekday, input.timeZone],
    );
  return gratitude(q, userId, input.timeZone);
}

export const GratitudeCard = z.object({
  items: z
    .array(z.string().trim().max(280))
    .max(3)
    .transform((a) => a.filter(Boolean)),
  timeZone: z.string().min(1).max(64),
});

/** Save this week's good things (one to three); an empty list clears the card. */
export async function saveGratitude(
  q: Queryable,
  userId: string,
  input: z.infer<typeof GratitudeCard>,
) {
  await requireGratitude(q);
  if (!input.items.length)
    await q.query(
      `delete from public.gratitude_entries where user_id = $1 and week_start = ${weekStartSql}`,
      [userId, input.timeZone],
    );
  else
    await q.query(
      `insert into public.gratitude_entries (user_id, week_start, items) values ($1, ${weekStartSql}, $3)
       on conflict (user_id, week_start) do update set items = excluded.items, updated_at = now()`,
      [userId, input.timeZone, input.items],
    );
  return gratitude(q, userId, input.timeZone);
}

/** Hourly: at 6 pm on each member's chosen day, a gentle invitation, unless this week's card is filled. */
export function gratitudeDueTask(q: Queryable): Task {
  return async () => {
    if (!(await settings(q)).gratitude_enabled) return;
    const { rows } = await q.query<{ user_id: string; week: string }>(
      `select g.user_id, to_char(date_trunc('week', now() at time zone g.time_zone), 'YYYY-MM-DD') as week
         from public.gratitude_prefs g
        where extract(dow from now() at time zone g.time_zone)::int = g.weekday
          and extract(hour from now() at time zone g.time_zone)::int = 18
          and not exists (select 1 from public.gratitude_entries e
                           where e.user_id = g.user_id and e.week_start = date_trunc('week', now() at time zone g.time_zone)::date)`,
    );
    for (const r of rows) {
      await notifications.notify(q, r.user_id, {
        kind: "gratitude",
        title: "Three good things",
        body: "What went well this week, big or small? A minute to notice it, just for you.",
        data: { screen: "gratitude" },
        dedupeKey: `gratitude:${r.user_id}:${r.week}`,
      });
    }
  };
}
