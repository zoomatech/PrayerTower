// Notebook ideas built in Batch 7, each behind a switch in notebook_settings
// (see the migration 20261029000600_notebook_ideas.sql):
//   * the worldwide count and "people have prayed for you" (real counts only);
//   * the thanksgiving card in the feed (Notes Page 14);
//   * sermon and meeting inputs on events (Notes Page 12);
//   * the "Prayer and positive thoughts welcome" label (note of 2026-09-19);
//   * Witness stories, off by default (the switch lives here; the code is in witness/);
//   * the "don't pressure people" rule and the public ad-free promise page (20261029004700);
//   * the "no misleading claims" and "no automated accounts" rules (20261029006000);
//   * the post anatomy lines from Mockups 1 and 2 (20261029009200);
//   * tier upkeep, Notes Page 3 (20261029009300; the rule itself is in tiers/);
//   * the kind cloud (20261029015600; the rules are in kindness/);
//   * emoji meanings (20261029015700; meaning-reactions/);
//   * podcasts (20261029004900) and cross-posting from Facebook and Threads (20261029007000).
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as events from '../events/index.js';
import * as givingSplit from '../giving-split/index.js';
import * as growth from '../growth/index.js';
import * as practices from '../practices/index.js';
import * as conversationHelpers from '../conversation-helpers/index.js';
import * as security from '../security/index.js';
import * as safety from '../safety/index.js';
import * as safetyCenter from '../safety-center/index.js';
import * as skins from '../skins/index.js';

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
  cross_community_enabled: boolean;
  post_lines_enabled: boolean;
  tier_upkeep_enabled: boolean;
  tier_upkeep_days: number;
  checkin_affirmation_enabled: boolean;
  why_gifts_enabled: boolean;
  pool_matching_enabled: boolean;
  kind_cloud_enabled: boolean;
  meaning_reactions_enabled: boolean;
  lamps_enabled: boolean;
  lamps_per_week: number;
  pool_ledger_enabled: boolean;
  circle_goals_enabled: boolean;
  giving_ask_enabled: boolean;
  giving_ask_after_days: number;
  support_links_enabled: boolean;
  squire_board_enabled: boolean;
  squire_board_days: number;
  group_gifts_enabled: boolean;
  prayer_list_enabled: boolean;
  reading_plan_enabled: boolean;
  crosspost_enabled: boolean;
}

export async function settings(q: Queryable): Promise<NotebookSettings> {
  const { rows } = await q.query<NotebookSettings>(
    `select worldwide_count_enabled, thanks_card_enabled, thanks_card_days, sermon_inputs_enabled, support_label_enabled, witness_stories_enabled,
            pressure_rule_enabled, promise_page_enabled, podcasts_enabled, misleading_rule_enabled, automation_rule_enabled,
            urgency_glow_enabled, reaction_tray_enabled, member_town_enabled, prize_choice_enabled, waitlist_enabled, cross_community_enabled,
            post_lines_enabled, tier_upkeep_enabled, tier_upkeep_days, checkin_affirmation_enabled, why_gifts_enabled, pool_matching_enabled, kind_cloud_enabled, meaning_reactions_enabled, lamps_enabled, lamps_per_week, pool_ledger_enabled, circle_goals_enabled, giving_ask_enabled, giving_ask_after_days, support_links_enabled, squire_board_enabled, squire_board_days, group_gifts_enabled, prayer_list_enabled, reading_plan_enabled, crosspost_enabled from public.notebook_settings`,
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
  crossCommunityEnabled: z.boolean().optional(),
  postLinesEnabled: z.boolean().optional(),
  tierUpkeepEnabled: z.boolean().optional(),
  tierUpkeepDays: z.number().int().min(1).max(365).optional(),
  checkinAffirmationEnabled: z.boolean().optional(),
  whyGiftsEnabled: z.boolean().optional(),
  poolMatchingEnabled: z.boolean().optional(),
  kindCloudEnabled: z.boolean().optional(),
  meaningReactionsEnabled: z.boolean().optional(),
  lampsEnabled: z.boolean().optional(),
  lampsPerWeek: z.number().int().min(1).max(20).optional(),
  poolLedgerEnabled: z.boolean().optional(),
  circleGoalsEnabled: z.boolean().optional(),
  givingAskEnabled: z.boolean().optional(),
  givingAskAfterDays: z.number().int().min(1).max(365).optional(),
  supportLinksEnabled: z.boolean().optional(),
  squireBoardEnabled: z.boolean().optional(),
  squireBoardDays: z.number().int().min(1).max(365).optional(),
  groupGiftsEnabled: z.boolean().optional(),
  prayerListEnabled: z.boolean().optional(),
  readingPlanEnabled: z.boolean().optional(),
  crosspostEnabled: z.boolean().optional(),
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
       waitlist_enabled = coalesce($16, waitlist_enabled),
       cross_community_enabled = coalesce($17, cross_community_enabled),
       post_lines_enabled = coalesce($18, post_lines_enabled),
       tier_upkeep_enabled = coalesce($19, tier_upkeep_enabled), tier_upkeep_days = coalesce($20, tier_upkeep_days),
       checkin_affirmation_enabled = coalesce($21, checkin_affirmation_enabled),
       why_gifts_enabled = coalesce($22, why_gifts_enabled),
       pool_matching_enabled = coalesce($23, pool_matching_enabled),
       kind_cloud_enabled = coalesce($24, kind_cloud_enabled),
       meaning_reactions_enabled = coalesce($25, meaning_reactions_enabled),
       lamps_enabled = coalesce($26, lamps_enabled), lamps_per_week = coalesce($27, lamps_per_week),
       pool_ledger_enabled = coalesce($28, pool_ledger_enabled),
       circle_goals_enabled = coalesce($29, circle_goals_enabled),
       giving_ask_enabled = coalesce($30, giving_ask_enabled), giving_ask_after_days = coalesce($31, giving_ask_after_days),
       support_links_enabled = coalesce($32, support_links_enabled),
       squire_board_enabled = coalesce($33, squire_board_enabled), squire_board_days = coalesce($34, squire_board_days),
       group_gifts_enabled = coalesce($35, group_gifts_enabled),
       prayer_list_enabled = coalesce($36, prayer_list_enabled),
       reading_plan_enabled = coalesce($37, reading_plan_enabled),
       crosspost_enabled = coalesce($38, crosspost_enabled)`,
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
      p.crossCommunityEnabled ?? null,
      p.postLinesEnabled ?? null,
      p.tierUpkeepEnabled ?? null,
      p.tierUpkeepDays ?? null,
      p.checkinAffirmationEnabled ?? null,
      p.whyGiftsEnabled ?? null,
      p.poolMatchingEnabled ?? null,
      p.kindCloudEnabled ?? null,
      p.meaningReactionsEnabled ?? null,
      p.lampsEnabled ?? null,
      p.lampsPerWeek ?? null,
      p.poolLedgerEnabled ?? null,
      p.circleGoalsEnabled ?? null,
      p.givingAskEnabled ?? null,
      p.givingAskAfterDays ?? null,
      p.supportLinksEnabled ?? null,
      p.squireBoardEnabled ?? null,
      p.squireBoardDays ?? null,
      p.groupGiftsEnabled ?? null,
      p.prayerListEnabled ?? null,
      p.readingPlanEnabled ?? null,
      p.crosspostEnabled ?? null,
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
    crossCommunity: s.cross_community_enabled,
    postLines: s.post_lines_enabled,
    checkinAffirmation: s.checkin_affirmation_enabled,
    whyGifts: s.why_gifts_enabled,
    poolMatching: s.pool_matching_enabled,
    /** The kind cloud on the composer (modules/kindness). */
    kindCloud: s.kind_cloud_enabled,
    /** Emoji reactions that open to positive meanings (modules/meaning-reactions). */
    meaningReactions: s.meaning_reactions_enabled,
    lamps: s.lamps_enabled,
    poolLedger: s.pool_ledger_enabled,
    circleGoals: s.circle_goals_enabled,
    supportLinks: s.support_links_enabled,
    squireBoard: s.squire_board_enabled,
    groupGifts: s.group_gifts_enabled,
    prayerList: s.prayer_list_enabled,
    readingPlan: s.reading_plan_enabled,
    /** Moderators can escalate a report for a law-enforcement review (modules/legal). */
    legalReview: legal[0]?.enabled === true,
    podcasts: s.podcasts_enabled,
    /** Members can copy their Facebook and Threads posts here (modules/crosspost). */
    crosspost: s.crosspost_enabled,
    /** Paid radio prayers are matched with equal material help (modules/material-match). */
    materialMatch: match[0]?.enabled === true,
    /** Growth ideas (modules/growth, Admin → Growth). */
    ...(await growth.features(q)),
    /** Giving split (modules/giving-split, Admin → Giving split). */
    ...(await givingSplit.features(q)),
    /** Growth practices: follow-ups, gratitude card, gentle rhythm (modules/practices, Admin → Growth practices). */
    ...(await practices.features(q)),
    /** Conversation helpers: reply suggestions, meaning words, care after "how are you", greeting packs, own words, kind closings. */
    ...(await conversationHelpers.features(q)),
    /** Feed skins, comment trees, skin ideas and the video cap (modules/skins, Admin → Feed skins). */
    ...(await skins.features(q)),
    /** Two-step sign-in (modules/security, Admin → Sign-in security). */
    ...(await security.features(q)),
    /** Member safety center: report, block, mute and hide in one place (modules/safety-center). */
    ...(await safetyCenter.features(q)),
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

// Gentle giving ask (research/Contributing_Without_Ad_Money.md, suggestion 11) ---------

/** Shown once: giving is set up, the member has been here long enough, never saw it, never gave. */
export async function givingAsk(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.giving_ask_enabled) return { show: false };
  const { rows } = await q.query<{ show: boolean }>(
    `select (select enabled from public.donation_settings)
            and pr.giving_ask_seen_at is null
            and pr.created_at <= now() - make_interval(days => $2)
            and not exists (select 1 from public.donations d where d.donor_id = $1 and d.status = 'paid') as show
       from public.profiles pr where pr.id = $1`,
    [userId, s.giving_ask_after_days],
  );
  return { show: rows[0]?.show === true };
}

export async function seenGivingAsk(q: Queryable, userId: string) {
  await q.query('update public.profiles set giving_ask_seen_at = coalesce(giving_ask_seen_at, now()) where id = $1', [userId]);
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
