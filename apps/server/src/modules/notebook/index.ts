// Notebook ideas built in Batch 7, each behind a switch in notebook_settings
// (see the migration 20261029000600_notebook_ideas.sql):
//   * the worldwide count and "people have prayed for you" (real counts only);
//   * the thanksgiving card in the feed (Notes Page 14);
//   * sermon and meeting inputs on events (Notes Page 12);
//   * the "Prayer and positive thoughts welcome" label (note of 2026-09-19);
//   * Witness stories, off by default (the switch lives here; the code is in witness/);
//   * the "don't pressure people" rule and the public ad-free promise page (20261029004700);
//   * the "no misleading claims" and "no automated accounts" rules (20261029006000).
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as events from '../events/index.js';
import * as safety from '../safety/index.js';

export interface NotebookSettings {
  worldwide_count_enabled: boolean;
  thanks_card_enabled: boolean;
  thanks_card_days: number;
  sermon_inputs_enabled: boolean;
  support_label_enabled: boolean;
  witness_stories_enabled: boolean;
  pressure_rule_enabled: boolean;
  promise_page_enabled: boolean;
  podcasts_enabled: boolean;
  misleading_rule_enabled: boolean;
  automation_rule_enabled: boolean;
  urgency_glow_enabled: boolean;
  reaction_tray_enabled: boolean;
  member_town_enabled: boolean;
  prize_choice_enabled: boolean;
  waitlist_enabled: boolean;
}

export async function settings(q: Queryable): Promise<NotebookSettings> {
  const { rows } = await q.query<NotebookSettings>(
    `select worldwide_count_enabled, thanks_card_enabled, thanks_card_days, sermon_inputs_enabled, support_label_enabled, witness_stories_enabled,
            pressure_rule_enabled, promise_page_enabled, podcasts_enabled, misleading_rule_enabled, automation_rule_enabled,
            urgency_glow_enabled, reaction_tray_enabled, member_town_enabled, prize_choice_enabled, waitlist_enabled from public.notebook_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  worldwideCountEnabled: z.boolean().optional(),
  thanksCardEnabled: z.boolean().optional(),
  thanksCardDays: z.number().int().min(1).max(60).optional(),
  sermonInputsEnabled: z.boolean().optional(),
  supportLabelEnabled: z.boolean().optional(),
  witnessStoriesEnabled: z.boolean().optional(),
  pressureRuleEnabled: z.boolean().optional(),
  promisePageEnabled: z.boolean().optional(),
  podcastsEnabled: z.boolean().optional(),
  misleadingRuleEnabled: z.boolean().optional(),
  automationRuleEnabled: z.boolean().optional(),
  urgencyGlowEnabled: z.boolean().optional(),
  reactionTrayEnabled: z.boolean().optional(),
  memberTownEnabled: z.boolean().optional(),
  prizeChoiceEnabled: z.boolean().optional(),
  waitlistEnabled: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.notebook_settings set
       worldwide_count_enabled = coalesce($1, worldwide_count_enabled), thanks_card_enabled = coalesce($2, thanks_card_enabled),
       thanks_card_days = coalesce($3, thanks_card_days), sermon_inputs_enabled = coalesce($4, sermon_inputs_enabled),
       support_label_enabled = coalesce($5, support_label_enabled), witness_stories_enabled = coalesce($6, witness_stories_enabled),
       pressure_rule_enabled = coalesce($7, pressure_rule_enabled), promise_page_enabled = coalesce($8, promise_page_enabled),
       podcasts_enabled = coalesce($9, podcasts_enabled), misleading_rule_enabled = coalesce($10, misleading_rule_enabled),
       automation_rule_enabled = coalesce($11, automation_rule_enabled),
       urgency_glow_enabled = coalesce($12, urgency_glow_enabled), reaction_tray_enabled = coalesce($13, reaction_tray_enabled), member_town_enabled = coalesce($14, member_town_enabled), prize_choice_enabled = coalesce($15, prize_choice_enabled),
       waitlist_enabled = coalesce($16, waitlist_enabled)`,
    [
      p.worldwideCountEnabled ?? null,
      p.thanksCardEnabled ?? null,
      p.thanksCardDays ?? null,
      p.sermonInputsEnabled ?? null,
      p.supportLabelEnabled ?? null,
      p.witnessStoriesEnabled ?? null,
      p.pressureRuleEnabled ?? null,
      p.promisePageEnabled ?? null,
      p.podcastsEnabled ?? null,
      p.misleadingRuleEnabled ?? null,
      p.automationRuleEnabled ?? null,
      p.urgencyGlowEnabled ?? null,
      p.reactionTrayEnabled ?? null,
      p.memberTownEnabled ?? null,
      p.prizeChoiceEnabled ?? null,
      p.waitlistEnabled ?? null,
    ],
  );
  return settings(q);
}

/** The switches the app needs to show or hide these features. */
export async function features(q: Queryable) {
  const s = await settings(q);
  const { rows: legal } = await q.query<{ enabled: boolean }>('select enabled from public.legal_settings');
  const { rows: match } = await q.query<{ enabled: boolean }>('select enabled from public.material_match_settings');
  return {
    worldwideCount: s.worldwide_count_enabled,
    thanksCard: s.thanks_card_enabled,
    sermonInputs: s.sermon_inputs_enabled,
    supportLabel: s.support_label_enabled,
    witnessStories: s.witness_stories_enabled,
    pressureRule: s.pressure_rule_enabled,
    misleadingRule: s.misleading_rule_enabled,
    automationRule: s.automation_rule_enabled,
    urgencyGlow: s.urgency_glow_enabled,
    reactionTray: s.reaction_tray_enabled,
    memberTown: s.member_town_enabled,
    prizeChoice: s.prize_choice_enabled,
    /** Moderators can escalate a report for a law-enforcement review (modules/legal). */
    legalReview: legal[0]?.enabled === true,
    podcasts: s.podcasts_enabled,
    /** Paid radio prayers are matched with equal material help (modules/material-match). */
    materialMatch: match[0]?.enabled === true,
  };
}

// Worldwide count ---------------------------------------------------------------------

/**
 * Real, anonymous counts from the prayer log: prayers offered in the last 24
 * hours and in all, how many people prayed in the last 24 hours, and how many
 * different people have ever prayed for the viewer's requests. No names.
 */
export async function worldwide(q: Queryable, viewerId: string) {
  const s = await settings(q);
  if (!s.worldwide_count_enabled) return { enabled: false as const };
  const { rows } = await q.query<{ today: number; all_time: number; people_today: number; prayed_for_you: number }>(
    `select count(*) filter (where e.created_at > now() - interval '24 hours')::int as today,
            count(*)::int as all_time,
            count(distinct e.user_id) filter (where e.created_at > now() - interval '24 hours')::int as people_today,
            (select count(distinct x.user_id)::int from public.prayer_events x join public.posts p on p.id = x.post_id
              where p.user_id = $1 and x.user_id <> $1) as prayed_for_you
       from public.prayer_events e`,
    [viewerId],
  );
  const r = rows[0]!;
  return { enabled: true as const, prayersToday: r.today, prayersAllTime: r.all_time, peopleToday: r.people_today, peoplePrayedForYou: r.prayed_for_you };
}

// Thanksgiving card --------------------------------------------------------------------

/**
 * Shown in the feed when the member hasn't posted a praise in the last
 * `thanks_card_days` days and hasn't dismissed the card in that time. It
 * counts the answered requests they prayed for in that window, if any.
 */
export async function thanksCard(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.thanks_card_enabled) return { show: false, answeredYouPrayedFor: 0 };
  const { rows } = await q.query<{ dismissed: boolean; praised: boolean; answered: number }>(
    `select coalesce(pr.thanks_card_dismissed_at > now() - make_interval(days => $2), false) as dismissed,
            exists (select 1 from public.posts p where p.user_id = $1 and p.post_type = 'praise'
                     and p.created_at > now() - make_interval(days => $2)) as praised,
            (select count(distinct p.id)::int from public.posts p
              where p.state = 'answered' and p.answered_at > now() - make_interval(days => $2)
                and p.moderation_status = 'visible' and p.user_id <> $1
                and exists (select 1 from public.prayer_events e where e.post_id = p.id and e.user_id = $1)) as answered
       from public.profiles pr where pr.id = $1`,
    [userId, s.thanks_card_days],
  );
  const r = rows[0];
  if (!r) throw notFound('Profile');
  return { show: !r.dismissed && !r.praised, answeredYouPrayedFor: r.answered };
}

export async function dismissThanksCard(q: Queryable, userId: string) {
  await q.query('update public.profiles set thanks_card_dismissed_at = now() where id = $1', [userId]);
}

// Sermon and meeting inputs ------------------------------------------------------------

export const NewInput = z.object({ body: z.string().trim().min(1).max(500) });

async function eventFor(q: Queryable, userId: string, eventId: string) {
  const s = await settings(q);
  if (!s.sermon_inputs_enabled) throw forbidden('Sermon and meeting inputs are turned off for now');
  const event = await events.get(q, userId, eventId);
  const staff = await hasRole(q, userId, 'moderator', 'admin');
  return { event, canSeeAll: event.isHost || staff };
}

/** A member who said they're coming tells the host what to pray about or cover. */
export async function addInput(q: Queryable, userId: string, eventId: string, input: z.infer<typeof NewInput>) {
  const { event } = await eventFor(q, userId, eventId);
  if (event.cancelled) throw badRequest('This event was cancelled');
  if (!event.myRsvp && !event.isHost) throw forbidden("Say you're coming first");
  await safety.checkNewMember(q, userId, 'comment', input.body);
  const { rows } = await q.query<{ n: number }>('select count(*)::int as n from public.event_inputs where event_id = $1 and user_id = $2', [eventId, userId]);
  if (rows[0]!.n >= 5) throw badRequest('You can send up to 5 notes for one event');
  const { rows: created } = await q.query<{ id: string; created_at: Date }>(
    'insert into public.event_inputs (event_id, user_id, body) values ($1, $2, $3) returning id, created_at',
    [eventId, userId, input.body],
  );
  return { id: created[0]!.id, createdAt: created[0]!.created_at, crisis: safety.mentionsCrisis(input.body) };
}

/** The host and staff see every note, with names; anyone else sees only their own. */
export async function listInputs(q: Queryable, userId: string, eventId: string) {
  const { canSeeAll } = await eventFor(q, userId, eventId);
  const { rows } = await q.query<{ id: string; body: string; created_at: Date; user_id: string; name: string }>(
    `select i.id, i.body, i.created_at, i.user_id, coalesce(nullif(p.display_name, ''), 'Member') as name
       from public.event_inputs i join public.profiles p on p.id = i.user_id
      where i.event_id = $1 and ($3 or i.user_id = $2)
      order by i.created_at`,
    [eventId, userId, canSeeAll],
  );
  return {
    canSeeAll,
    inputs: rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, mine: r.user_id === userId, from: { id: r.user_id, name: r.name } })),
  };
}

/** The sender, the host or staff can remove a note. */
export async function removeInput(q: Queryable, userId: string, eventId: string, inputId: string) {
  const { canSeeAll } = await eventFor(q, userId, eventId);
  const { rowCount } = await q.query('delete from public.event_inputs where id = $1 and event_id = $2 and ($4 or user_id = $3)', [inputId, eventId, userId, canSeeAll]);
  if (!rowCount) throw notFound('Note');
}
