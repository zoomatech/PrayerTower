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
//   4. Encourager: a newcomer may ask for one welcoming volunteer for their first
//      days. Either side ends it with one tap, no reason shown; it ends on its own.
//   5. Answered & remembered: a look-back, opened only when the member chooses, of
//      their own answered requests with a grateful word. Loss never resurfaces.
//   6. Ted Lasso nudges: a private weekly "Who did you lift up this week?", a count of
//      weeks of gratitude that only grows (never a streak to lose), and a "Believe"
//      moment when a prayer is answered.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';

export interface PracticeSettings {
  followup_enabled: boolean;
  followup_days: number;
  gratitude_enabled: boolean;
  gentle_rhythm_enabled: boolean;
  encourager_enabled: boolean;
  encourager_days: number;
  newcomer_days: number;
  remembered_enabled: boolean;
  welcome_card_enabled: boolean;
  welcome_text: string | null;
  ask_kindly_enabled: boolean;
  mend_enabled: boolean;
  lift_up_enabled: boolean;
  gratitude_count_enabled: boolean;
  believe_enabled: boolean;
  partners_enabled: boolean;
  partner_days: number;
  highlights_enabled: boolean;
  cool_down_enabled: boolean;
  lament_enabled: boolean;
  answered_stories_enabled: boolean;
  kindness_intro_enabled: boolean;
  check_back_enabled: boolean;
  kind_milestones_enabled: boolean;
  thank_note_enabled: boolean;
  calm_threads_enabled: boolean;
  prayer_circles_enabled: boolean;
  encourager_checkin_enabled: boolean;
  encourager_checkin_days: number;
  kindness_weather_enabled: boolean;
  circle_welcome_enabled: boolean;
  path_back_enabled: boolean;
  empathy_practice_enabled: boolean;
}

export async function settings(q: Queryable): Promise<PracticeSettings> {
  const { rows } = await q.query<PracticeSettings>(`select followup_enabled, followup_days, gratitude_enabled, gentle_rhythm_enabled, encourager_enabled, encourager_days, newcomer_days, remembered_enabled,
            welcome_card_enabled, welcome_text, ask_kindly_enabled, mend_enabled, lift_up_enabled, gratitude_count_enabled, believe_enabled,
            partners_enabled, partner_days, highlights_enabled, cool_down_enabled, lament_enabled, answered_stories_enabled, kindness_intro_enabled, check_back_enabled, kind_milestones_enabled, thank_note_enabled, calm_threads_enabled,
            prayer_circles_enabled, encourager_checkin_enabled, encourager_checkin_days, kindness_weather_enabled, circle_welcome_enabled, path_back_enabled, empathy_practice_enabled
       from public.practice_settings`);
  return rows[0]!;
}

export const SettingsPatch = z.object({
  followupEnabled: z.boolean().optional(),
  followupDays: z.number().int().min(3).max(120).optional(),
  gratitudeEnabled: z.boolean().optional(),
  gentleRhythmEnabled: z.boolean().optional(),
  encouragerEnabled: z.boolean().optional(),
  encouragerDays: z.number().int().min(7).max(90).optional(),
  newcomerDays: z.number().int().min(1).max(365).optional(),
  rememberedEnabled: z.boolean().optional(),
  welcomeCardEnabled: z.boolean().optional(),
  /** An empty string goes back to the app's default wording. */
  welcomeText: z.string().trim().max(600).optional(),
  askKindlyEnabled: z.boolean().optional(),
  mendEnabled: z.boolean().optional(),
  liftUpEnabled: z.boolean().optional(),
  gratitudeCountEnabled: z.boolean().optional(),
  believeEnabled: z.boolean().optional(),
  partnersEnabled: z.boolean().optional(),
  partnerDays: z.number().int().min(7).max(90).optional(),
  highlightsEnabled: z.boolean().optional(),
  coolDownEnabled: z.boolean().optional(),
  lamentEnabled: z.boolean().optional(),
  answeredStoriesEnabled: z.boolean().optional(),
  kindnessIntroEnabled: z.boolean().optional(),
  checkBackEnabled: z.boolean().optional(),
  kindMilestonesEnabled: z.boolean().optional(),
  thankNoteEnabled: z.boolean().optional(),
  calmThreadsEnabled: z.boolean().optional(),
  prayerCirclesEnabled: z.boolean().optional(),
  encouragerCheckinEnabled: z.boolean().optional(),
  encouragerCheckinDays: z.number().int().min(3).max(60).optional(),
  kindnessWeatherEnabled: z.boolean().optional(),
  circleWelcomeEnabled: z.boolean().optional(),
  pathBackEnabled: z.boolean().optional(),
  empathyPracticeEnabled: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.practice_settings set
       followup_enabled = coalesce($1, followup_enabled), followup_days = coalesce($2, followup_days),
       gratitude_enabled = coalesce($3, gratitude_enabled), gentle_rhythm_enabled = coalesce($4, gentle_rhythm_enabled),
       encourager_enabled = coalesce($5, encourager_enabled), encourager_days = coalesce($6, encourager_days),
       newcomer_days = coalesce($7, newcomer_days), remembered_enabled = coalesce($8, remembered_enabled),
       welcome_card_enabled = coalesce($9, welcome_card_enabled),
       welcome_text = case when $10::text is null then welcome_text else nullif($10, '') end,
       ask_kindly_enabled = coalesce($11, ask_kindly_enabled), mend_enabled = coalesce($12, mend_enabled),
       lift_up_enabled = coalesce($13, lift_up_enabled), gratitude_count_enabled = coalesce($14, gratitude_count_enabled),
       believe_enabled = coalesce($15, believe_enabled),
       partners_enabled = coalesce($16, partners_enabled), partner_days = coalesce($17, partner_days),
       highlights_enabled = coalesce($18, highlights_enabled), cool_down_enabled = coalesce($19, cool_down_enabled),
       lament_enabled = coalesce($20, lament_enabled), answered_stories_enabled = coalesce($21, answered_stories_enabled),
       kindness_intro_enabled = coalesce($22, kindness_intro_enabled), check_back_enabled = coalesce($23, check_back_enabled),
       kind_milestones_enabled = coalesce($24, kind_milestones_enabled), thank_note_enabled = coalesce($25, thank_note_enabled),
       calm_threads_enabled = coalesce($26, calm_threads_enabled),
       prayer_circles_enabled = coalesce($27, prayer_circles_enabled), encourager_checkin_enabled = coalesce($28, encourager_checkin_enabled),
       encourager_checkin_days = coalesce($29, encourager_checkin_days), kindness_weather_enabled = coalesce($30, kindness_weather_enabled),
       circle_welcome_enabled = coalesce($31, circle_welcome_enabled), path_back_enabled = coalesce($32, path_back_enabled),
       empathy_practice_enabled = coalesce($33, empathy_practice_enabled)`,
    [
      p.followupEnabled ?? null,
      p.followupDays ?? null,
      p.gratitudeEnabled ?? null,
      p.gentleRhythmEnabled ?? null,
      p.encouragerEnabled ?? null,
      p.encouragerDays ?? null,
      p.newcomerDays ?? null,
      p.rememberedEnabled ?? null,
      p.welcomeCardEnabled ?? null,
      p.welcomeText ?? null,
      p.askKindlyEnabled ?? null,
      p.mendEnabled ?? null,
      p.liftUpEnabled ?? null,
      p.gratitudeCountEnabled ?? null,
      p.believeEnabled ?? null,
      p.partnersEnabled ?? null,
      p.partnerDays ?? null,
      p.highlightsEnabled ?? null,
      p.coolDownEnabled ?? null,
      p.lamentEnabled ?? null,
      p.answeredStoriesEnabled ?? null,
      p.kindnessIntroEnabled ?? null,
      p.checkBackEnabled ?? null,
      p.kindMilestonesEnabled ?? null,
      p.thankNoteEnabled ?? null,
      p.calmThreadsEnabled ?? null,
      p.prayerCirclesEnabled ?? null,
      p.encouragerCheckinEnabled ?? null,
      p.encouragerCheckinDays ?? null,
      p.kindnessWeatherEnabled ?? null,
      p.circleWelcomeEnabled ?? null,
      p.pathBackEnabled ?? null,
      p.empathyPracticeEnabled ?? null,
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
    encourager: s.encourager_enabled,
    remembered: s.remembered_enabled,
    welcomeCard: s.welcome_card_enabled,
    askKindly: s.ask_kindly_enabled,
    mend: s.mend_enabled,
    liftUp: s.lift_up_enabled,
    gratitudeCount: s.gratitude_count_enabled,
    believe: s.believe_enabled,
    partners: s.partners_enabled,
    kindnessHighlights: s.highlights_enabled,
    coolDown: s.cool_down_enabled,
    lament: s.lament_enabled,
    answeredStories: s.answered_stories_enabled,
    kindnessIntro: s.kindness_intro_enabled,
    checkBack: s.check_back_enabled,
    kindMilestones: s.kind_milestones_enabled,
    thankNote: s.thank_note_enabled,
    calmThreads: s.calm_threads_enabled,
    prayerCircles: s.prayer_circles_enabled,
    encouragerCheckin: s.encourager_enabled && s.encourager_checkin_enabled,
    circleWelcome: s.prayer_circles_enabled && s.circle_welcome_enabled,
    pathBack: s.path_back_enabled,
    empathyPractice: s.empathy_practice_enabled,
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
      const { rowCount } = await q.query('insert into public.request_followups (post_id, user_id) values ($1, $2) on conflict do nothing', [r.id, r.user_id]);
      if (!rowCount) continue;
      await notifications.notify(q, r.user_id, {
        kind: 'followup',
        title: "Share how it's going?",
        body: `${r.people === 1 ? '1 person' : `${r.people} people`} prayed for your request. If you'd like, let them know how it's going. No pressure at all.`,
        data: { postId: r.id, followup: true },
        dedupeKey: `followup:${r.id}`,
      });
    }
  };
}

/** Whether the viewer has an open follow-up on this post. */
export async function followupFor(q: Queryable, userId: string, postId: string) {
  if (!(await settings(q)).followup_enabled) return { enabled: false, pending: false };
  const { rowCount } = await q.query('select 1 from public.request_followups where post_id = $1 and user_id = $2 and answer is null', [postId, userId]);
  return { enabled: true, pending: rowCount === 1 };
}

export const FollowupAnswer = z.object({
  answer: z.enum(['grateful', 'still', 'changed', 'private']),
  body: z.string().trim().min(1).max(2000).optional(),
});

/**
 * Record the author's answer. "grateful" marks the request answered through the
 * caller's `markAnswered` (which tells the pray-ers once, with the body as the
 * testimony). "still" and "changed" with words post an update and tell the pray-ers
 * once. "private" just closes the follow-up.
 */
export async function answerFollowup(q: Queryable, userId: string, postId: string, input: z.infer<typeof FollowupAnswer>, markAnswered: (testimony?: string) => Promise<boolean>) {
  if (!(await settings(q)).followup_enabled) throw badRequest('Follow-ups are switched off');
  const post = await posts.get(q, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the poster can answer');
  const { rowCount } = await q.query(
    `update public.request_followups set answer = $3, answered_at = now()
      where post_id = $1 and user_id = $2 and answer is null`,
    [postId, userId, input.answer],
  );
  if (!rowCount) throw badRequest('There is no follow-up to answer');
  if (input.answer === 'grateful') {
    const crisis = post.state === 'answered' ? false : await markAnswered(input.body);
    return { answer: input.answer, crisis };
  }
  if ((input.answer === 'still' || input.answer === 'changed') && input.body) {
    const c = await posts.addComment(q, userId, postId, {
      body: input.body,
      isUpdate: true,
    });
    if (post.moderation_status === 'visible' && !c.harm) {
      const who = post.is_anonymous ? null : (await getProfile(q, userId))?.display_name || null;
      for (const recipientId of await posts.prayedBy(q, postId, userId)) {
        await notifications.notify(q, recipientId, {
          kind: 'followup_update',
          title: 'An update on a request you prayed for',
          body: `${who ?? 'Someone'} shared how it's going: "${input.body.slice(0, 120)}${input.body.length > 120 ? '…' : ''}"`,
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
  if (!(await settings(q)).gratitude_enabled) throw badRequest('The gratitude card is switched off');
}

/** The member's chosen day and this week's card, if any. Earlier weeks are never shown as missed. */
export async function gratitude(q: Queryable, userId: string, timeZone: string) {
  const s = await settings(q);
  if (!s.gratitude_enabled) return { enabled: false as const };
  const { rows: pref } = await q.query<{ weekday: number; time_zone: string }>('select weekday, time_zone from public.gratitude_prefs where user_id = $1', [userId]);
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
    // Weeks of gratitude: every week with a card, ever. It only grows; nothing is "missed".
    weeks: s.gratitude_count_enabled ? await gratitudeWeeks(q, userId) : null,
  };
}

async function gratitudeWeeks(q: Queryable, userId: string) {
  const { rows } = await q.query<{ n: number }>('select count(*)::int as n from public.gratitude_entries where user_id = $1', [userId]);
  return rows[0]!.n;
}

// 6. Lift-up reflection -------------------------------------------------------------------

/** This week's private answer to "Who did you lift up this week?". Earlier weeks stay private and are never counted. */
export async function liftUp(q: Queryable, userId: string, timeZone: string) {
  if (!(await settings(q)).lift_up_enabled) return { enabled: false as const };
  const { rows } = await q.query<{ week_start: string; body: string | null }>(
    `select to_char(${weekStartSql}, 'YYYY-MM-DD') as week_start,
            (select body from public.lift_up_entries where user_id = $1 and week_start = ${weekStartSql}) as body`,
    [userId, timeZone],
  );
  return { enabled: true as const, weekStart: rows[0]!.week_start, body: rows[0]!.body ?? '' };
}

export const LiftUp = z.object({ body: z.string().trim().max(280), timeZone: z.string().min(1).max(64) });

/** Save this week's answer; an empty answer clears it. */
export async function saveLiftUp(q: Queryable, userId: string, input: z.infer<typeof LiftUp>) {
  if (!(await settings(q)).lift_up_enabled) throw badRequest('The weekly reflection is switched off');
  if (!input.body) await q.query(`delete from public.lift_up_entries where user_id = $1 and week_start = ${weekStartSql}`, [userId, input.timeZone]);
  else
    await q.query(
      `insert into public.lift_up_entries (user_id, week_start, body) values ($1, ${weekStartSql}, $3)
       on conflict (user_id, week_start) do update set body = excluded.body, updated_at = now()`,
      [userId, input.timeZone, input.body],
    );
  return liftUp(q, userId, input.timeZone);
}

export const GratitudeDay = z.object({
  weekday: z.number().int().min(0).max(6).nullable(),
  timeZone: z.string().min(1).max(64),
});

export async function setGratitudeDay(q: Queryable, userId: string, input: z.infer<typeof GratitudeDay>) {
  await requireGratitude(q);
  if (input.weekday === null) await q.query('delete from public.gratitude_prefs where user_id = $1', [userId]);
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
export async function saveGratitude(q: Queryable, userId: string, input: z.infer<typeof GratitudeCard>) {
  await requireGratitude(q);
  if (!input.items.length) await q.query(`delete from public.gratitude_entries where user_id = $1 and week_start = ${weekStartSql}`, [userId, input.timeZone]);
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
        kind: 'gratitude',
        title: 'Three good things',
        body: 'What went well this week, big or small? A minute to notice it, just for you.',
        data: { screen: 'gratitude' },
        dedupeKey: `gratitude:${r.user_id}:${r.week}`,
      });
    }
  };
}

// 4. Encourager ------------------------------------------------------------------------

/** An open match: not ended by either side and not past its last day. */
const openMatch = 'm.ended_at is null and m.ends_at > now()';

async function requireEncourager(q: Queryable) {
  const s = await settings(q);
  if (!s.encourager_enabled) throw badRequest('Encouragers are switched off');
  return s;
}

/** The member's side of it: whether they volunteer, can ask, and their open matches. */
export async function encourager(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.encourager_enabled) return { enabled: false as const };
  const { rows: me } = await q.query<{ volunteer: boolean; newcomer: boolean }>(
    `select exists (select 1 from public.encourager_volunteers v where v.user_id = p.id) as volunteer,
            p.created_at > now() - make_interval(days => $2) as newcomer
       from public.profiles p where p.id = $1`,
    [userId, s.newcomer_days],
  );
  const { rows: matches } = await q.query<{ id: string; role: 'newcomer' | 'encourager'; other_id: string; other_name: string; ends_at: Date; check_in_due: boolean }>(
    `select m.id, case when m.newcomer_id = $1 then 'newcomer' else 'encourager' end as role,
            o.id as other_id, o.display_name as other_name, m.ends_at,
            m.checkin_sent_at is not null and not exists (select 1 from public.encourager_checkins c where c.match_id = m.id and c.user_id = $1) as check_in_due
       from public.encourager_matches m
       join public.profiles o on o.id = case when m.newcomer_id = $1 then m.encourager_id else m.newcomer_id end
      where (m.newcomer_id = $1 or m.encourager_id = $1) and ${openMatch}
      order by m.started_at`,
    [userId],
  );
  const asNewcomer = matches.some((m) => m.role === 'newcomer');
  const checkin = s.encourager_checkin_enabled;
  // Someone who asked for a change at the check-in may ask again, even past their first days.
  const changed = checkin && !asNewcomer && (await askedForChange(q, userId));
  return {
    enabled: true as const,
    volunteer: me[0]?.volunteer ?? false,
    canAsk: ((me[0]?.newcomer ?? false) || changed) && !asNewcomer,
    matches: matches.map((m) => ({
      id: m.id,
      role: m.role,
      other: { id: m.other_id, displayName: m.other_name },
      endsAt: m.ends_at.toISOString(),
      ...(checkin ? { checkInDue: m.check_in_due } : {}),
    })),
  };
}

export const Volunteer = z.object({ on: z.boolean(), agree: z.boolean().optional() });

/** Volunteering needs the member to agree to the guidelines. Stepping back leaves current matches to end on their own. */
export async function setVolunteer(q: Queryable, userId: string, input: z.infer<typeof Volunteer>) {
  await requireEncourager(q);
  if (!input.on) await q.query('delete from public.encourager_volunteers where user_id = $1', [userId]);
  else {
    if (!input.agree) throw badRequest('Please agree to the encourager guidelines first');
    await q.query('insert into public.encourager_volunteers (user_id) values ($1) on conflict (user_id) do nothing', [userId]);
  }
  return encourager(q, userId);
}

/**
 * A newcomer asks for an encourager: the volunteer in the same community with the
 * most room (fewest open matches, under their limit), never someone either one blocked.
 */
export async function askForEncourager(q: Queryable, userId: string) {
  const s = await requireEncourager(q);
  const mine = await encourager(q, userId);
  if (!mine.enabled || !mine.canAsk) throw badRequest('Encouragers are for members in their first days here');
  const { rows } = await q.query<{ user_id: string }>(
    `select v.user_id
       from public.encourager_volunteers v
      where v.user_id <> $1
        and public.member_community_id(v.user_id) = public.member_community_id($1)
        and not exists (select 1 from public.user_blocks b where (b.user_id = v.user_id and b.blocked_id = $1) or (b.user_id = $1 and b.blocked_id = v.user_id))
        and (select count(*) from public.encourager_matches m where m.encourager_id = v.user_id and ${openMatch}) < v.max_newcomers
        and not exists (select 1 from public.encourager_matches m join public.encourager_checkins c on c.match_id = m.id
                         where m.newcomer_id = $1 and m.encourager_id = v.user_id and c.answer = 'change')
      order by (select count(*) from public.encourager_matches m where m.encourager_id = v.user_id and ${openMatch}), v.agreed_at
      limit 1`,
    [userId],
  );
  if (!rows[0]) return { ...mine, matched: false };
  // A match that ended on its own still holds the open-match slot; close it first.
  await q.query('update public.encourager_matches set ended_at = ends_at where newcomer_id = $1 and ended_at is null and ends_at <= now()', [userId]);
  await q.query(
    `insert into public.encourager_matches (newcomer_id, encourager_id, ends_at) values ($1, $2, now() + make_interval(days => $3))`,
    [userId, rows[0].user_id, s.encourager_days],
  );
  const who = (await getProfile(q, userId))?.display_name || 'A new member';
  await notifications.notify(q, rows[0].user_id, {
    kind: 'encourager',
    title: 'Someone new would welcome encouragement',
    body: `${who} is new here and asked for an encourager. A kind word when you can is all it takes.`,
    data: { screen: 'encourager' },
  });
  return { ...(await encourager(q, userId)), matched: true };
}

/** Either side ends a match with one tap. No reason is asked, and the other person is not told. */
export async function endMatch(q: Queryable, userId: string, matchId: string) {
  await requireEncourager(q);
  const { rowCount } = await q.query(
    `update public.encourager_matches m set ended_at = now() where m.id = $1 and (m.newcomer_id = $2 or m.encourager_id = $2) and m.ended_at is null`,
    [matchId, userId],
  );
  if (!rowCount) throw notFound('Match');
  return encourager(q, userId);
}

// 4b. Encourager check-in ---------------------------------------------------------------
// Two weeks in (encourager_checkin_days), each side gets one quiet "How is it going?".
// Answers are private: the other person is never told what was said. "I'd like a change"
// ends the pairing; the newcomer can then ask again and is never matched with the same person.

async function askedForChange(q: Queryable, userId: string) {
  const { rows } = await q.query<{ answer: string }>(
    `select c.answer from public.encourager_matches m join public.encourager_checkins c on c.match_id = m.id and c.user_id = m.newcomer_id
      where m.newcomer_id = $1 order by m.started_at desc limit 1`,
    [userId],
  );
  return rows[0]?.answer === 'change';
}

export const CheckIn = z.object({ answer: z.enum(['good', 'okay', 'change']) });

export async function checkIn(q: Queryable, userId: string, matchId: string, answer: z.infer<typeof CheckIn>['answer']) {
  const s = await requireEncourager(q);
  if (!s.encourager_checkin_enabled) throw badRequest('Check-ins are switched off');
  const { rows } = await q.query<{ newcomer_id: string; encourager_id: string }>(
    `select newcomer_id, encourager_id from public.encourager_matches m
      where m.id = $1 and (m.newcomer_id = $2 or m.encourager_id = $2) and m.checkin_sent_at is not null`,
    [matchId, userId],
  );
  const m = rows[0];
  if (!m) throw notFound('Check-in');
  const { rowCount } = await q.query('insert into public.encourager_checkins (match_id, user_id, answer) values ($1, $2, $3) on conflict do nothing', [matchId, userId, answer]);
  if (!rowCount) throw conflict('You already answered');
  if (answer === 'change') {
    await q.query('update public.encourager_matches set ended_at = now() where id = $1 and ended_at is null', [matchId]);
    // The newcomer hears a gentle word whichever side asked, so nobody is left wondering.
    if (userId === m.encourager_id) {
      await notifications.notify(q, m.newcomer_id, {
        kind: 'encourager_checkin',
        title: 'Your encourager time has wrapped up',
        body: 'Thank you for letting someone walk with you. You can ask for another encourager any time.',
        data: { screen: 'encourager' },
        quiet: true,
      });
    }
  }
  return encourager(q, userId);
}

/** Admins see only totals by answer, never who said what. */
export async function checkInTotals(q: Queryable) {
  const { rows } = await q.query<{ answer: string; n: number }>('select answer, count(*)::int as n from public.encourager_checkins group by answer');
  const t = { good: 0, okay: 0, change: 0 };
  for (const r of rows) t[r.answer as keyof typeof t] = r.n;
  return t;
}

export function checkInDueTask(q: Queryable): Task {
  return async () => {
    const s = await settings(q);
    if (!s.encourager_enabled || !s.encourager_checkin_enabled) return;
    const { rows } = await q.query<{ id: string; newcomer_id: string; encourager_id: string }>(
      `update public.encourager_matches m set checkin_sent_at = now()
        where m.checkin_sent_at is null and ${openMatch} and m.started_at <= now() - make_interval(days => $1)
        returning m.id, m.newcomer_id, m.encourager_id`,
      [s.encourager_checkin_days],
    );
    for (const r of rows) {
      for (const [to, body] of [
        [r.newcomer_id, 'Two weeks in with your encourager. How is it going? Your answer stays private.'],
        [r.encourager_id, "Two weeks in with the newcomer you're encouraging. How is it going? Your answer stays private."],
      ] as const) {
        await notifications.notify(q, to, {
          kind: 'encourager_checkin',
          title: 'A quick check-in',
          body,
          data: { screen: 'encourager', matchId: r.id },
          dedupeKey: `encourager_checkin:${r.id}`,
          quiet: true,
        });
      }
    }
  };
}

// 5. Answered & remembered -------------------------------------------------------------

/** Words that mean a request was about a death or loss; those never resurface. */
const LOSS = String.raw`\m(died|dying|passed away|passing|funeral|memorial|grief|grieving|bereave\w*|miscarr\w*|stillborn|lost (my|our) \w+|rest in peace|rip|widow\w*|suicide)\M`;

/** The member's own answered requests with a grateful word, newest first. */
export async function remembered(q: Queryable, userId: string) {
  if (!(await settings(q)).remembered_enabled) return { enabled: false as const, items: [] };
  const { rows } = await q.query<{ id: string; body: string; testimony: string | null; answered_at: Date }>(
    `select p.id, p.body, coalesce(p.testimony, (select c.body from public.comments c join public.request_followups f on f.post_id = c.post_id
                                                   where c.post_id = p.id and c.is_update and f.answer = 'grateful' order by c.created_at desc limit 1)) as testimony,
            p.answered_at
       from public.posts p
      where p.user_id = $1 and p.state = 'answered' and p.moderation_status = 'visible' and not p.is_sensitive and p.harm_category is null
        and (p.testimony is not null or exists (select 1 from public.request_followups f where f.post_id = p.id and f.answer = 'grateful'))
        and not exists (select 1 from public.remembered_hidden h where h.user_id = $1 and h.post_id = p.id)
        and (p.body || ' ' || coalesce(p.testimony, '')) !~* $2
      order by p.answered_at desc
      limit 100`,
    [userId, LOSS],
  );
  return { enabled: true as const, items: rows.map((r) => ({ id: r.id, body: r.body, testimony: r.testimony, answeredAt: r.answered_at.toISOString() })) };
}

/** Hide one item from the look-back for good (the request itself is untouched). */
export async function hideRemembered(q: Queryable, userId: string, postId: string) {
  if (!(await settings(q)).remembered_enabled) throw badRequest('The look-back is switched off');
  await q.query('insert into public.remembered_hidden (user_id, post_id) values ($1, $2) on conflict do nothing', [userId, postId]);
  return remembered(q, userId);
}
