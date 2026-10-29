// Admin routes: roles, tier settings, token settings, and pilot metrics. Admin-only; each
// area's data comes from that module's public functions.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as activity from '../activity/index.js';
import * as adFines from '../ad-fines/index.js';
import * as amplifier from '../amplifier/index.js';
import * as care from '../care/index.js';
import { churchAdminRoutes } from '../churches/routes.js';
import * as commitments from '../commitments/index.js';
import * as commonFund from '../common-fund/index.js';
import * as materialMatch from '../material-match/index.js';
import * as deletion from '../deletion-page/index.js';
import * as events from '../events/index.js';
import * as feedback from '../feedback/index.js';
import * as future from '../future/index.js';
import * as notebook from '../notebook/index.js';
import * as pushDelivery from '../notifications/delivery.js';
import * as reminders from '../reminders/index.js';
import * as givingSplit from '../giving-split/index.js';
import * as growth from '../growth/index.js';
import * as practices from '../practices/index.js';
import * as talkCounts from '../conversation-helpers/counts.js';
import * as kindnessWeather from '../kindness-weather/index.js';
import * as meaningProposals from '../meaning-reactions/proposals.js';
import * as kindnessHighlights from '../kindness-highlights/index.js';
import * as conversationHelpers from '../conversation-helpers/index.js';
import * as milestones from '../milestones/index.js';
import * as moderation from '../moderation/index.js';
import * as posts from '../posts/index.js';
import { MEDIA_BUCKET } from '../posts/media.js';
import * as prayerActions from '../prayer-actions/index.js';
import * as prompts from '../prompts/index.js';
import * as radio from '../radio/index.js';
import * as radioHealth from '../radio/health.js';
import * as radioNodes from '../radio/nodes.js';
import * as radioAcks from '../radio/acks.js';
import * as radioSchedule from '../radio/schedule.js';
import * as operatorConsole from '../radio/console.js';
import * as operatorAlerts from '../radio/operator-alerts.js';
import * as beacon from '../radio/beacon.js';
import * as sky from '../radio/sky.js';
import * as ceaseless from '../radio/ceaseless.js';
import * as trail from '../radio/trail.js';
import * as signalQueue from '../radio/signal-queue.js';
import * as fairAir from '../radio/fair-air.js';
import * as operatorLog from '../radio/oplog.js';
import { listenerMode, setListenerMode } from '../listen/routes.js';
import * as radioThanks from '../radio/thanksgiving.js';
import * as prayingToo from '../radio/praying-too.js';
import * as radioSetup from '../radio/setup.js';
import * as coverage from '../radio/coverage.js';
import * as radioDigest from '../radio/digest.js';
import * as radioPacket from '../radio/packet.js';
import * as reach from '../reach/index.js';
import * as schedules from '../schedules/index.js';
import * as messages from '../messages/index.js';
import * as safety from '../safety/index.js';
import * as seedPrayers from '../seed-prayers/index.js';
import * as tiers from '../tiers/index.js';
import * as tokens from '../tokens/index.js';
import * as audit from '../audit/index.js';
import * as moderationTools from '../moderation/tools.js';
import * as goldfish from '../goldfish/index.js';
import * as kindnessStarter from '../kindness-starter/index.js';
import * as report from './report.js';
import * as sponsorReport from './sponsor-report.js';
import * as warriors from './warriors.js';
import * as ledgerCheck from '../tokens/ledger-check.js';
import * as jobs from '../jobs/index.js';
import * as ops from '../ops/index.js';

const ROLES = ['admin', 'moderator', 'pastor', 'pastor_counselor', 'prayer_partner', 'witness', 'radio_operator'] as const;

export function adminRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null = null) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  app.get('/admin/people', async (req) => {
    await requireAdmin(req);
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    return { people: await accounts.search(db, q) };
  });

  app.get<{ Params: { id: string } }>('/admin/people/:id/roles', async (req) => {
    await requireAdmin(req);
    return { roles: await accounts.roles(db, req.params.id) };
  });

  app.put<{ Params: { id: string; role: string } }>('/admin/people/:id/roles/:role', async (req) => {
    const adminId = await requireAdmin(req);
    const role = z.enum(ROLES).parse(req.params.role);
    const person = await accounts.getProfile(db, req.params.id);
    if (!person || person.deleted_at) throw notFound('Person');
    await accounts.grantRole(db, req.params.id, role, adminId);
    return { roles: await accounts.roles(db, req.params.id) };
  });

  app.delete<{ Params: { id: string; role: string } }>('/admin/people/:id/roles/:role', async (req) => {
    await requireAdmin(req);
    const role = z.enum(ROLES).parse(req.params.role);
    await withTx(db, (tx) => accounts.revokeRole(tx, req.params.id, role));
    return { roles: await accounts.roles(db, req.params.id) };
  });

  // Church partner applications: verify, decline, revoke.
  churchAdminRoutes(app, db, requireAdmin);

  app.get('/admin/tiers', async (req) => {
    await requireAdmin(req);
    return { tiers: await tiers.settings(db) };
  });

  app.patch<{ Params: { tier: string } }>('/admin/tiers/:tier', async (req) => {
    await requireAdmin(req);
    const input = tiers.SettingUpdate.parse(req.body);
    return { tier: await withTx(db, (tx) => tiers.updateSetting(tx, req.params.tier, input)) };
  });

  // Priestly token rate and the minimum gap that makes a prayer count as verified.
  // Token ledger integrity: recent runs (nightly, or by hand) and run one now.
  app.get('/admin/ledger-checks', async (req) => {
    await requireAdmin(req);
    return { checks: await ledgerCheck.recent(db) };
  });

  app.post('/admin/ledger-checks', async (req) => {
    const userId = await requireAdmin(req);
    return { check: await ledgerCheck.runCheck(db, userId) };
  });

  // Background jobs: the ones that ran out of tries (retry or discard) and the ones still retrying.
  app.get('/admin/jobs', async (req) => {
    await requireAdmin(req);
    return { failed: await jobs.failed(db), retrying: await jobs.retrying(db) };
  });

  // Operations: worker, job queue, server errors and the radio station at a glance.
  app.get('/admin/ops', async (req) => {
    await requireAdmin(req);
    return { status: await ops.status(db) };
  });

  app.post<{ Params: { id: string } }>('/admin/jobs/:id/retry', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.string().regex(/^\d{1,18}$/) }).parse(req.params);
    if (!(await jobs.retry(db, id))) throw notFound('Failed job');
    return { retried: true };
  });

  app.post<{ Params: { id: string } }>('/admin/jobs/:id/discard', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.string().regex(/^\d{1,18}$/) }).parse(req.params);
    if (!(await jobs.discard(db, id))) throw notFound('Failed job');
    return { discarded: true };
  });

  app.get('/admin/token-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await tokens.settings(db) };
  });

  app.patch('/admin/token-settings', async (req) => {
    await requireAdmin(req);
    const input = z
      .object({
        priestlyPrayersPerToken: z.number().int().min(1).max(10_000).optional(),
        verifiedPrayerMinGapSeconds: z.number().int().min(0).max(86_400).optional(),
        radioPrayerCost: z.number().int().min(1).max(10_000).optional(),
        radioFunding: z.enum(['tokens', 'free']).optional(),
        verifiedPrayersPerDay: z.number().int().min(0).max(10_000).optional(),
        /** Priestly tokens for one Amplify while radio prayers cost tokens; null turns paid Amplify off. */
        amplifyPaidCost: z.number().int().min(1).max(1000).nullable().optional(),
      })
      .parse(req.body);
    return {
      settings: await tokens.updateSettings(db, {
        priestly_prayers_per_token: input.priestlyPrayersPerToken,
        verified_prayer_min_gap_seconds: input.verifiedPrayerMinGapSeconds,
        radio_prayer_cost: input.radioPrayerCost,
        radio_funding: input.radioFunding,
        verified_prayers_per_day: input.verifiedPrayersPerDay,
        amplify_paid_cost: input.amplifyPaidCost,
      }),
    };
  });

  // Radio transmitter: 'log' (placeholder) or 'station' (Pi/laptop + fldigi + transceiver).
  app.get('/admin/radio-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await radio.stationSettings(db) };
  });

  // Station health alerts (radio/health.ts); empty while the switch is off.
  app.get('/admin/radio-alerts', async (req) => {
    await requireAdmin(req);
    return radioHealth.alerts(db);
  });

  app.patch('/admin/radio-alerts', async (req) => {
    await requireAdmin(req);
    const input = z.object({ enabled: z.boolean().optional(), overdueMinutes: z.number().int().min(1).max(1440).optional() }).parse(req.body);
    await radioHealth.updateSettings(db, input);
    return radioHealth.alerts(db);
  });

  // Listener nodes (radio/nodes.ts): their keys, switch and latest reports.
  app.get('/admin/radio-nodes', async (req) => {
    await requireAdmin(req);
    return {
      enabled: await radioNodes.enabled(db),
      multiStation: await radioNodes.multiStation(db),
      signaturesRequired: await radioNodes.signaturesRequired(db),
      nodes: await radioNodes.list(db),
      reports: await radioNodes.latestReports(db),
      stations: await radioNodes.stationCounts(db),
    };
  });

  app.patch('/admin/radio-nodes', async (req) => {
    await requireAdmin(req);
    const { enabled, multiStation, signaturesRequired } = z
      .object({ enabled: z.boolean().optional(), multiStation: z.boolean().optional(), signaturesRequired: z.boolean().optional() })
      .parse(req.body);
    if (enabled !== undefined) await radioNodes.setEnabled(db, enabled);
    if (multiStation !== undefined) await radioNodes.setMultiStation(db, multiStation);
    if (signaturesRequired !== undefined) await radioNodes.setSignaturesRequired(db, signaturesRequired);
    return { enabled: await radioNodes.enabled(db), multiStation: await radioNodes.multiStation(db), signaturesRequired: await radioNodes.signaturesRequired(db) };
  });

  // The key is in this answer only; the server keeps its hash.
  app.post('/admin/radio-nodes', async (req, reply) => {
    await requireAdmin(req);
    const { name, role } = z.object({ name: z.string().trim().min(1).max(60), role: z.enum(['listener', 'station']).default('listener') }).parse(req.body);
    return reply.code(201).send(await radioNodes.create(db, name, role));
  });

  app.patch<{ Params: { id: string } }>('/admin/radio-nodes/:id', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return { node: await radioNodes.update(db, id, z.object({ enabled: z.boolean().optional() }).parse(req.body)) };
  });

  app.delete<{ Params: { id: string } }>('/admin/radio-nodes/:id', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await radioNodes.remove(db, id);
    return { ok: true };
  });

  // Station health page (radio/health.ts) and listener acknowledgements (radio/acks.ts); health is null while its switch is off.
  app.get('/admin/radio-health', async (req) => {
    await requireAdmin(req);
    return { enabled: await radioHealth.pageEnabled(db), health: await radioHealth.overview(db), acks: { ...(await radioAcks.settings(db)), ...(await radioAcks.stats(db)) } };
  });

  app.patch('/admin/radio-health', async (req) => {
    await requireAdmin(req);
    const input = z
      .object({
        enabled: z.boolean().optional(),
        acks: z.object({ enabled: z.boolean().optional(), timeoutMinutes: z.number().int().min(1).max(1440).optional(), maxRetries: z.number().int().min(0).max(10).optional() }).optional(),
      })
      .parse(req.body);
    if (input.enabled !== undefined) await radioHealth.setPageEnabled(db, input.enabled);
    if (input.acks) await radioAcks.updateSettings(db, input.acks);
    return { enabled: await radioHealth.pageEnabled(db), health: await radioHealth.overview(db), acks: { ...(await radioAcks.settings(db)), ...(await radioAcks.stats(db)) } };
  });

  // Transmission windows and quiet hours (radio/schedule.ts).
  // Operator console (radio/console.ts): admins turn it on; admins and radio operators use it.
  const requireOperator = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin', 'radio_operator'))) throw forbidden('Radio operators only');
    return userId;
  };
  app.get('/admin/radio-console', async (req) => {
    await requireAdmin(req);
    return { enabled: (await operatorConsole.settings(db)).enabled };
  });
  app.patch('/admin/radio-console', async (req) => {
    await requireAdmin(req);
    await operatorConsole.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return { enabled: (await operatorConsole.settings(db)).enabled };
  });
  app.get('/admin/radio-operator-alerts', async (req) => {
    await requireAdmin(req);
    return { enabled: await operatorAlerts.enabled(db) };
  });
  app.patch('/admin/radio-operator-alerts', async (req) => {
    await requireAdmin(req);
    await operatorAlerts.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return { enabled: await operatorAlerts.enabled(db) };
  });
  app.get('/admin/radio-beacon', async (req) => {
    await requireAdmin(req);
    return beacon.settings(db);
  });
  app.patch('/admin/radio-beacon', async (req) => {
    await requireAdmin(req);
    return beacon.update(db, beacon.BeaconSettings.parse(req.body));
  });
  app.get('/admin/radio-fair-air', async (req) => {
    await requireAdmin(req);
    return fairAir.settings(db);
  });
  app.patch('/admin/radio-fair-air', async (req) => {
    await requireAdmin(req);
    return fairAir.update(db, fairAir.FairAirSettings.parse(req.body));
  });
  app.get('/admin/signal-queue', async (req) => {
    await requireAdmin(req);
    return { enabled: await signalQueue.enabled(db) };
  });
  app.patch('/admin/signal-queue', async (req) => {
    await requireAdmin(req);
    await signalQueue.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return { enabled: await signalQueue.enabled(db) };
  });
  app.get('/admin/heard-trail', async (req) => {
    await requireAdmin(req);
    return { enabled: await trail.enabled(db) };
  });
  app.patch('/admin/heard-trail', async (req) => {
    await requireAdmin(req);
    await trail.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return { enabled: await trail.enabled(db) };
  });
  app.get('/admin/scheduled-radio', async (req) => {
    await requireAdmin(req);
    return { enabled: await schedules.radioEnabled(db) };
  });
  app.patch('/admin/scheduled-radio', async (req) => {
    await requireAdmin(req);
    await schedules.setRadioEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return { enabled: await schedules.radioEnabled(db) };
  });
  app.get('/admin/radio-ceaseless', async (req) => {
    await requireAdmin(req);
    return ceaseless.settings(db);
  });
  app.patch('/admin/radio-ceaseless', async (req) => {
    await requireAdmin(req);
    return ceaseless.update(db, ceaseless.CeaselessSettings.parse(req.body));
  });
  app.get('/admin/radio-sky', async (req) => {
    await requireAdmin(req);
    return { settings: await sky.settings(db), now: await sky.now(db) };
  });
  app.patch('/admin/radio-sky', async (req) => {
    await requireAdmin(req);
    await sky.update(db, sky.SkyPatch.parse(req.body));
    return { settings: await sky.settings(db), now: await sky.now(db) };
  });
  app.get('/radio/console', async (req) => {
    await requireOperator(req);
    const view = await operatorConsole.view(db);
    if (!view) throw notFound('Operator console');
    return view;
  });
  app.patch('/radio/console', async (req) => {
    await requireOperator(req);
    const input = operatorConsole.Override.parse(req.body);
    if (!(await operatorConsole.settings(db)).enabled) throw notFound('Operator console');
    await operatorConsole.override(db, input);
    return (await operatorConsole.view(db))!;
  });

  app.get('/admin/radio-schedule', async (req) => {
    await requireAdmin(req);
    const schedule = await radioSchedule.get(db);
    return { schedule, onAirNow: radioSchedule.onAir(schedule) };
  });

  app.patch('/admin/radio-schedule', async (req) => {
    await requireAdmin(req);
    const schedule = await radioSchedule.update(db, radioSchedule.SchedulePatch.parse(req.body));
    return { schedule, onAirNow: radioSchedule.onAir(schedule) };
  });

  // Operator log (radio/oplog.ts): ?format=csv&from=&to= downloads it (the last 30 days by default) while it is on.
  app.get('/admin/operator-log', async (req, reply) => {
    await requireAdmin(req);
    const { format, from, to } = z
      .object({ format: z.enum(['json', 'csv']).default('json'), from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(req.query);
    const on = await operatorLog.enabled(db);
    if (format === 'json') return { enabled: on };
    if (!on) throw notFound('Operator log');
    const end = to ?? new Date();
    const rows = await operatorLog.rows(db, from ?? new Date(end.getTime() - 30 * 86_400_000), end);
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="prayer-tower-operator-log.csv"');
    return operatorLog.toCsv(rows);
  });

  app.patch('/admin/operator-log', async (req) => {
    await requireAdmin(req);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await operatorLog.setEnabled(db, enabled);
    return { enabled };
  });

  // Listener mode: the Listen screen from the sign-in screen, with no account.
  app.get('/admin/listener-mode', async (req) => {
    await requireAdmin(req);
    const { rows } = await db.query<{ on: boolean }>('select listener_mode_enabled as on from public.token_settings');
    return { enabled: rows[0]!.on, active: (await listenerMode(db)).enabled };
  });

  app.patch('/admin/listener-mode', async (req) => {
    await requireAdmin(req);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await setListenerMode(db, enabled);
    return { enabled, active: (await listenerMode(db)).enabled };
  });

  // Thanksgiving bursts for answered requests (radio/thanksgiving.ts) and listeners' "I'm praying too" (radio/praying-too.ts).
  app.get('/admin/radio-followups', async (req) => {
    await requireAdmin(req);
    return { thanksgiving: await radioThanks.enabled(db), prayingToo: await prayingToo.enabled(db) };
  });

  app.patch('/admin/radio-followups', async (req) => {
    await requireAdmin(req);
    const input = z.object({ thanksgiving: z.boolean().optional(), prayingToo: z.boolean().optional() }).parse(req.body);
    if (input.thanksgiving !== undefined) await radioThanks.setEnabled(db, input.thanksgiving);
    if (input.prayingToo !== undefined) await prayingToo.setEnabled(db, input.prayingToo);
    return { thanksgiving: await radioThanks.enabled(db), prayingToo: await prayingToo.enabled(db) };
  });

  // Station setup wizard (radio/setup.ts): the rig choice and its settings lines, the station's checks, test tones and bursts.
  app.get('/admin/radio-setup', async (req) => {
    await requireAdmin(req);
    return radioSetup.overview(db);
  });

  app.patch('/admin/radio-setup', async (req) => {
    await requireAdmin(req);
    const input = z.object({ enabled: z.boolean().optional(), choice: radioSetup.SetupChoice.optional() }).parse(req.body);
    if (input.enabled !== undefined) await radioSetup.setEnabled(db, input.enabled);
    if (input.choice) await radioSetup.setChoice(db, input.choice);
    return radioSetup.overview(db);
  });

  app.post('/admin/radio-setup/tests', async (req, reply) => {
    const userId = await requireAdmin(req);
    if (!(await radioSetup.enabled(db))) throw notFound('Setup wizard');
    const { kind, seconds } = z.object({ kind: z.enum(['tone', 'burst']), seconds: z.number().int().min(3).max(30).default(10) }).parse(req.body);
    return reply.code(201).send({ test: await radioSetup.request(db, kind, userId, seconds) });
  });

  app.post<{ Params: { id: string } }>('/admin/radio-setup/tests/:id/confirm', async (req) => {
    await requireAdmin(req);
    if (!(await radioSetup.enabled(db))) throw notFound('Setup wizard');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return { test: await radioSetup.confirm(db, id) };
  });

  // Coverage map (radio/coverage.ts): placed listener nodes with the signal each hears.
  app.get('/admin/radio-coverage', async (req) => {
    await requireAdmin(req);
    return coverage.map(db);
  });

  app.patch('/admin/radio-coverage', async (req) => {
    await requireAdmin(req);
    await coverage.updateSettings(db, coverage.SettingsPatch.parse(req.body));
    return coverage.map(db);
  });

  app.put<{ Params: { id: string } }>('/admin/radio-nodes/:id/location', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { location } = z.object({ location: coverage.Location.nullable() }).parse(req.body);
    await coverage.place(db, id, location);
    return coverage.map(db);
  });

  // Packet fallback (radio/packet.ts): short IDs and counts over 1200-baud APRS packets.
  app.get('/admin/radio-packet', async (req) => {
    await requireAdmin(req);
    return { enabled: await radioPacket.enabled(db) };
  });

  app.patch('/admin/radio-packet', async (req) => {
    await requireAdmin(req);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await radioPacket.setEnabled(db, enabled);
    return { enabled };
  });

  // Weekly radio prayer digest (radio/digest.ts).
  app.get('/admin/radio-digest', async (req) => {
    await requireAdmin(req);
    const s = await radioDigest.settings(db);
    return { ...s, weeks: s.enabled ? await radioDigest.weeks(db) : [] };
  });

  app.patch('/admin/radio-digest', async (req) => {
    await requireAdmin(req);
    const s = await radioDigest.updateSettings(db, z.object({ enabled: z.boolean().optional(), email: z.boolean().optional() }).parse(req.body));
    return { ...s, weeks: s.enabled ? await radioDigest.weeks(db) : [] };
  });

  app.get('/admin/radio-bursts', async (req) => {
    await requireAdmin(req);
    return { bursts: await radio.recentBursts(db) };
  });

  app.patch('/admin/radio-settings', async (req) => {
    await requireAdmin(req);
    const input = z
      .object({
        transmitter: z.enum(['log', 'station']).optional(),
        stationRequiresFree: z.boolean().optional(),
        maxChars: z.number().int().min(50).max(2800).optional(),
        amplifyRepeats: z.number().int().min(2).max(1000).optional(),
        order: z.enum(['oldest', 'need']).optional(),
        urgentFirst: z.boolean().optional(),
        batchMax: z.number().int().min(1).max(500).optional(),
        listenPage: z.boolean().optional(),
        receipts: z.boolean().optional(),
        onAirPage: z.boolean().optional(),
      })
      .parse(req.body);
    return {
      settings: await radio.updateStationSettings(db, {
        radio_order: input.order,
        radio_urgent_first: input.urgentFirst,
        radio_batch_max: input.batchMax,
        listen_page_enabled: input.listenPage,
        radio_receipts_enabled: input.receipts,
        on_air_page_enabled: input.onAirPage,
        radio_transmitter: input.transmitter,
        radio_station_requires_free: input.stationRequiresFree,
        radio_amplify_repeats: input.amplifyRepeats,
        radio_max_chars: input.maxChars,
      }),
    };
  });

  // Power Prayer reach, free allowance, cost and per-recipient cap (placeholders until set).
  app.get('/admin/reach-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await reach.settings(db) };
  });

  app.patch('/admin/reach-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await reach.updateSettings(db, reach.SettingsPatch.parse(req.body)) };
  });

  // New-member limits (troll prevention).
  app.get('/admin/safety-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await safety.settings(db) };
  });

  app.patch('/admin/safety-settings', async (req) => {
    await requireAdmin(req);
    const input = z
      .object({
        newMemberLimitsEnabled: z.boolean().optional(),
        newMemberHours: z.number().int().min(0).max(8760).optional(),
        newMemberMinPrayers: z.number().int().min(0).max(10_000).optional(),
        newMemberPostsPerDay: z.number().int().min(0).max(1000).optional(),
        newMemberCommentsPerDay: z.number().int().min(0).max(1000).optional(),
        newMemberLinksAllowed: z.boolean().optional(),
        postsPerHour: z.number().int().min(0).max(1000).optional(),
        commentsPerHour: z.number().int().min(0).max(10_000).optional(),
        messagesPerMinute: z.number().int().min(0).max(1000).optional(),
      })
      .parse(req.body);
    return {
      settings: await safety.updateSettings(db, {
        new_member_limits_enabled: input.newMemberLimitsEnabled,
        new_member_hours: input.newMemberHours,
        new_member_min_prayers: input.newMemberMinPrayers,
        new_member_posts_per_day: input.newMemberPostsPerDay,
        new_member_comments_per_day: input.newMemberCommentsPerDay,
        new_member_links_allowed: input.newMemberLinksAllowed,
        posts_per_hour: input.postsPerHour,
        comments_per_hour: input.commentsPerHour,
        messages_per_minute: input.messagesPerMinute,
      }),
    };
  });

  // Blocked features' switches (all off): token purchase, Common Prayer Fund page, AI conversation.
  app.get('/admin/future-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await future.settings(db) };
  });

  app.patch('/admin/future-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await future.updateSettings(db, future.SettingsPatch.parse(req.body)) };
  });

  // Notebook ideas' switches (Batch 7): worldwide count, thanksgiving card, sermon inputs, support label.
  app.get('/admin/notebook-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await notebook.settings(db) };
  });

  app.patch('/admin/notebook-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await notebook.updateSettings(db, notebook.SettingsPatch.parse(req.body)) };
  });

  // Conversation helpers (docs/CONVERSATION_HELPERS.md): each off until switched on here.
  app.get('/admin/conversation-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await conversationHelpers.settings(db) };
  });
  app.get('/admin/reminder-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await reminders.settings(db) };
  });
  app.patch('/admin/reminder-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await reminders.updateSettings(db, reminders.SettingsPatch.parse(req.body)) };
  });
  app.get('/admin/push-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await pushDelivery.settings(db), health: await pushDelivery.health(db) };
  });
  app.patch('/admin/push-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await pushDelivery.updateSettings(db, pushDelivery.SettingsPatch.parse(req.body)), health: await pushDelivery.health(db) };
  });
  app.get('/admin/giving-split-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await givingSplit.settings(db) };
  });
  app.patch('/admin/giving-split-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await givingSplit.updateSettings(db, givingSplit.SettingsPatch.parse(req.body)) };
  });
  app.patch('/admin/conversation-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await conversationHelpers.updateSettings(db, conversationHelpers.SettingsPatch.parse(req.body)) };
  });
  app.get('/admin/kindness-highlights', async (req) => {
    await requireAdmin(req);
    return { items: await kindnessHighlights.queue(db) };
  });
  app.post<{ Params: { id: string } }>('/admin/kindness-highlights/:id', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return { items: await kindnessHighlights.pick(db, id, kindnessHighlights.Pick.parse(req.body)) };
  });
  app.post('/admin/kindness-highlights/send', async (req) => {
    await requireAdmin(req);
    return kindnessHighlights.send(db);
  });
  app.get('/admin/meaning-proposals', async (req) => {
    await requireAdmin(req);
    return { proposals: await meaningProposals.queue(db) };
  });
  app.post<{ Params: { id: string } }>('/admin/meaning-proposals/:id', async (req) => {
    const adminId = await requireAdmin(req);
    const id = z.uuid().parse(req.params.id);
    return withTx(db, (tx) => meaningProposals.decide(tx, adminId, id, meaningProposals.Decision.parse(req.body)));
  });
  app.get('/admin/talk-counts', async (req) => {
    await requireAdmin(req);
    return { counts: await talkCounts.summary(db) };
  });

  // Growth practices (docs/GROWTH_PRACTICES.md): each off until switched on here.
  app.get('/admin/practice-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await practices.settings(db) };
  });
  app.patch('/admin/practice-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await practices.updateSettings(db, practices.SettingsPatch.parse(req.body)) };
  });

  // Encourager check-ins: totals by answer only, never who said what.
  app.get('/admin/encourager-checkins', async (req) => {
    await requireAdmin(req);
    return { totals: await practices.checkInTotals(db) };
  });

  // Kindness weather report: weekly totals only, quiet weeks folded (modules/kindness-weather).
  app.get('/admin/kindness-weather', async (req) => {
    await requireAdmin(req);
    const { weeks } = z.object({ weeks: z.coerce.number().int().min(4).max(52).default(12) }).parse(req.query);
    return kindnessWeather.report(db, weeks);
  });

  // Community health: requests that felt held, answers, members who came back; folded when quiet.
  app.get('/admin/community-health', async (req) => {
    await requireAdmin(req);
    const { weeks } = z.object({ weeks: z.coerce.number().int().min(4).max(52).default(12) }).parse(req.query);
    return kindnessWeather.health(db, weeks);
  });

  // Growth ideas (docs/GROWTH.md): each off until switched on here.
  app.get('/admin/growth-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await growth.settings(db) };
  });
  app.patch('/admin/growth-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await growth.updateSettings(db, growth.SettingsPatch.parse(req.body)) };
  });

  // Fines for using prayer requests as ads (off by default). Collecting money is not built:
  // an admin records a fine as paid (outside the app) or waives it.
  app.get('/admin/ad-fine-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await adFines.settings(db) };
  });

  app.patch('/admin/ad-fine-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await adFines.updateSettings(db, adFines.SettingsPatch.parse(req.body)) };
  });

  app.get('/admin/ad-fines', async (req) => {
    await requireAdmin(req);
    return { fines: await adFines.list(db, adFines.ListFilter.parse(req.query)) };
  });

  app.post<{ Params: { id: string } }>('/admin/ad-fines/:id/resolve', async (req) => {
    const adminId = await requireAdmin(req);
    const id = z.uuid().parse(req.params.id);
    return { fine: await withTx(db, (tx) => adFines.resolve(tx, id, adminId, adFines.Resolve.parse(req.body))) };
  });

  // Common Prayer Fund bookkeeping: money in and help sent, shown on the public report once it's switched on.
  // Equal material help for paid radio prayers (off by default).
  app.get('/admin/material-match', async (req) => {
    await requireAdmin(req);
    return materialMatch.summary(db);
  });
  app.patch('/admin/material-match', async (req) => {
    await requireAdmin(req);
    return { settings: await materialMatch.updateSettings(db, materialMatch.SettingsPatch.parse(req.body)) };
  });
  app.post('/admin/material-match/fulfill', async (req) => {
    const adminId = await requireAdmin(req);
    const input = materialMatch.Fulfill.parse(req.body);
    return withTx(db, (tx) => materialMatch.fulfill(tx, adminId, input));
  });

  app.get('/admin/common-fund/entries', async (req) => {
    await requireAdmin(req);
    return { entries: await commonFund.list(db, commonFund.ListFilter.parse(req.query)) };
  });

  app.post('/admin/common-fund/entries', async (req, reply) => {
    const adminId = await requireAdmin(req);
    return reply.code(201).send({ entry: await commonFund.record(db, adminId, commonFund.NewEntry.parse(req.body)) });
  });

  app.post<{ Params: { id: string } }>('/admin/common-fund/entries/:id/void', async (req) => {
    const adminId = await requireAdmin(req);
    return { entry: await withTx(db, (tx) => commonFund.voidEntry(tx, adminId, z.uuid().parse(req.params.id))) };
  });

  // LIVE AMPLIFIER (off by default): add licensed operators by call sign, and see what was read on the air.
  app.get('/admin/amplifier-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await amplifier.settings(db) };
  });

  app.patch('/admin/amplifier-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await amplifier.updateSettings(db, amplifier.SettingsPatch.parse(req.body)) };
  });

  app.get('/admin/amplifier/operators', async (req) => {
    await requireAdmin(req);
    return { operators: await amplifier.operators(db), readings: await amplifier.recentReadings(db) };
  });

  app.put<{ Params: { id: string } }>('/admin/amplifier/operators/:id', async (req) => {
    const adminId = await requireAdmin(req);
    const userId = z.uuid().parse(req.params.id);
    return { operator: await amplifier.setOperator(db, adminId, userId, amplifier.OperatorInput.parse(req.body)) };
  });

  app.delete<{ Params: { id: string } }>('/admin/amplifier/operators/:id', async (req) => {
    await requireAdmin(req);
    await withTx(db, (tx) => amplifier.deactivate(tx, z.uuid().parse(req.params.id)));
    return { ok: true };
  });

  // Seed prayers (off by default): a library of prayers an admin approves before they're posted from a staff account.
  app.get('/admin/seed-prayer-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await seedPrayers.settings(db) };
  });

  app.patch('/admin/seed-prayer-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await seedPrayers.updateSettings(db, seedPrayers.SettingsPatch.parse(req.body)) };
  });

  app.get('/admin/seed-prayers', async (req) => {
    await requireAdmin(req);
    return { prayers: await seedPrayers.list(db, seedPrayers.ListFilter.parse(req.query)) };
  });

  app.post('/admin/seed-prayers', async (req, reply) => {
    const adminId = await requireAdmin(req);
    return reply.code(201).send({ prayer: await seedPrayers.create(db, adminId, seedPrayers.NewSeed.parse(req.body)) });
  });

  app.patch<{ Params: { id: string } }>('/admin/seed-prayers/:id', async (req) => {
    await requireAdmin(req);
    const id = z.uuid().parse(req.params.id);
    return { prayer: await withTx(db, (tx) => seedPrayers.update(tx, id, seedPrayers.SeedPatch.parse(req.body))) };
  });

  for (const action of ['approve', 'retire', 'publish'] as const) {
    app.post<{ Params: { id: string } }>(`/admin/seed-prayers/:id/${action}`, async (req) => {
      const adminId = await requireAdmin(req);
      const id = z.uuid().parse(req.params.id);
      return {
        prayer: await withTx(db, (tx) =>
          action === 'approve' ? seedPrayers.approve(tx, adminId, id) : action === 'retire' ? seedPrayers.retire(tx, id) : seedPrayers.publish(tx, id),
        ),
      };
    });
  }

  // Pilot feedback from members.
  // ?status=open|closed|all&tag=bug filters; /admin/feedback/export downloads the same as CSV.
  app.get('/admin/feedback', async (req) => {
    await requireAdmin(req);
    return { feedback: await feedback.list(db, feedback.Filter.parse(req.query)) };
  });

  app.get('/admin/feedback/export', async (req, reply) => {
    await requireAdmin(req);
    const items = await feedback.list(db, { ...feedback.ExportFilter.parse(req.query), limit: 5000 });
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="prayer-tower-feedback.csv"');
    return feedback.toCsv(items);
  });

  app.patch<{ Params: { id: string } }>('/admin/feedback/:id', async (req) => {
    const adminId = await requireAdmin(req);
    await feedback.triage(db, adminId, z.uuid().parse(req.params.id), feedback.Triage.parse(req.body));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/admin/feedback/:id/close', async (req) => {
    const adminId = await requireAdmin(req);
    await feedback.close(db, adminId, req.params.id);
    return { ok: true };
  });

  // Account deletion requests from the public web page.
  app.get('/admin/deletion-requests', async (req) => {
    await requireAdmin(req);
    return { requests: await deletion.pending(db) };
  });

  app.post<{ Params: { id: string } }>('/admin/deletion-requests/:id', async (req) => {
    const adminId = await requireAdmin(req);
    const paths = await withTx(db, (tx) => deletion.decide(tx, adminId, req.params.id, deletion.Decision.parse(req.body)));
    if (storage && paths.length) await storage.storage.from(MEDIA_BUCKET).remove(paths);
    return { ok: true };
  });

  // Scripture leaves on the Vine feed.
  app.get('/admin/scripture-leaves', async (req) => {
    await requireAdmin(req);
    const { rows } = await db.query('select id, reference, text, translation, active from public.scripture_leaves order by id');
    return { leaves: rows };
  });

  app.post('/admin/scripture-leaves', async (req, reply) => {
    await requireAdmin(req);
    const input = z
      .object({ reference: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(1000), translation: z.string().trim().max(40).optional() })
      .parse(req.body);
    const { rows } = await db.query(
      `insert into public.scripture_leaves (community_id, reference, text, translation) values (public.default_community_id(), $1, $2, $3) returning id`,
      [input.reference, input.text, input.translation ?? null],
    );
    reply.code(201);
    return rows[0];
  });

  app.patch<{ Params: { id: string } }>('/admin/scripture-leaves/:id', async (req) => {
    await requireAdmin(req);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const { rowCount } = await db.query('update public.scripture_leaves set active = $2 where id = $1', [req.params.id, active]);
    if (!rowCount) throw notFound('Leaf');
    return { ok: true };
  });

  // Bot signals on prayer taps.
  app.get('/admin/activity-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await activity.settings(db) };
  });

  app.patch('/admin/activity-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await activity.updateSettings(db, activity.SettingsPatch.parse(req.body)) };
  });

  // Reminder popups: gentle (default) or firm tone, and how each is doing.
  app.get('/admin/prompt-settings', async (req) => {
    await requireAdmin(req);
    const since = new Date(Date.now() - 30 * 86_400_000);
    return { defaultTone: await prompts.defaultTone(db), results: await prompts.toneResults(db, since) };
  });

  app.patch('/admin/prompt-settings', async (req) => {
    await requireAdmin(req);
    const { defaultTone } = z.object({ defaultTone: z.enum(['gentle', 'firm']) }).parse(req.body);
    return { defaultTone: await prompts.setDefaultTone(db, defaultTone) };
  });

  // Prayer partners and pastors on call; confession stays off until a lawyer reviews it.
  app.get('/admin/care-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await care.settings(db) };
  });

  app.patch('/admin/care-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await care.updateSettings(db, care.SettingsPatch.parse(req.body)) };
  });

  // Events: on/off, who can host, allowed video meeting sites, reminder lead time.
  app.get('/admin/event-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await events.settings(db) };
  });

  app.patch('/admin/event-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await events.updateSettings(db, events.SettingsPatch.parse(req.body)) };
  });

  // Messages (Features Set 2): switches and limits, placeholders until Steve decides.
  app.get('/admin/messaging-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await messages.settings(db) };
  });

  app.patch('/admin/messaging-settings', async (req) => {
    await requireAdmin(req);
    const input = z
      .object({
        prayerMessagesEnabled: z.boolean().optional(),
        prayerMessagesAnyPrayer: z.boolean().optional(),
        directMessagesEnabled: z.boolean().optional(),
        directRequiresMutualFollow: z.boolean().optional(),
        groupsEnabled: z.boolean().optional(),
        requestMessageLimit: z.number().int().min(1).max(20).optional(),
        newMembersCanStart: z.boolean().optional(),
        newMemberMessagesPerDay: z.number().int().min(0).max(10_000).optional(),
        groupMaxMembers: z.number().int().min(2).max(100_000).optional(),
      })
      .parse(req.body);
    return {
      settings: await messages.updateSettings(db, {
        prayer_messages_enabled: input.prayerMessagesEnabled,
        prayer_messages_any_prayer: input.prayerMessagesAnyPrayer,
        direct_messages_enabled: input.directMessagesEnabled,
        direct_requires_mutual_follow: input.directRequiresMutualFollow,
        groups_enabled: input.groupsEnabled,
        request_message_limit: input.requestMessageLimit,
        new_members_can_start: input.newMembersCanStart,
        new_member_messages_per_day: input.newMemberMessagesPerDay,
        group_max_members: input.groupMaxMembers,
      }),
    };
  });

  // Moderation tools: search, bulk decisions and audit log filters (docs/MODERATION_TOOLS.md).
  app.get('/admin/moderation-tools', async (req) => {
    await requireAdmin(req);
    return { settings: await moderationTools.settings(db) };
  });

  app.patch('/admin/moderation-tools', async (req) => {
    await requireAdmin(req);
    return { settings: await moderationTools.updateSettings(db, moderationTools.SettingsPatch.parse(req.body)) };
  });

  // Kindness starter set: one tap turns a short list of no-cost kindness tools on or off together.
  app.get('/admin/kindness-starter', async (req) => {
    await requireAdmin(req);
    return kindnessStarter.status(db);
  });

  app.post('/admin/kindness-starter', async (req) => {
    await requireAdmin(req);
    const { on } = kindnessStarter.Apply.parse(req.body);
    return withTx(db, (tx) => kindnessStarter.apply(tx, on));
  });

  // Goldfish memory: recent removals in the queue fade after a set time (docs/GENTLE_REPAIR.md).
  app.get('/admin/goldfish', async (req) => {
    await requireAdmin(req);
    return { settings: await goldfish.settings(db) };
  });

  app.patch('/admin/goldfish', async (req) => {
    await requireAdmin(req);
    return { settings: await goldfish.updateSettings(db, goldfish.SettingsPatch.parse(req.body)) };
  });

  // Staff audit log, newest first; ?before=&beforeId= (the last entry's time and id) pages back, ?actorId= / ?targetId= filter.
  app.get('/admin/audit-log', async (req) => {
    await requireAdmin(req);
    const query = z
      .object({
        actorId: z.uuid().optional(),
        targetId: z.uuid().optional(),
        before: z.iso.datetime({ offset: true }).optional(),
        beforeId: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        // Moderation tools (off): filter by action, words, and a start time.
        action: z.string().trim().min(1).max(100).optional(),
        q: z.string().trim().min(1).max(200).optional(),
        since: z.iso.datetime({ offset: true }).optional(),
      })
      .parse(req.query);
    if (query.action || query.q || query.since) await moderationTools.requireOn(db);
    return { entries: await audit.list(db, query) };
  });

  // Week-by-week pilot results; ?format=csv downloads a spreadsheet, ?format=html the sponsor report.
  app.get('/admin/pilot-report', async (req, reply) => {
    await requireAdmin(req);
    const { weeks, format, lang } = z
      .object({
        weeks: z.coerce.number().int().min(1).max(104).default(12),
        format: z.enum(['json', 'csv', 'html']).default('json'),
        lang: z.enum(['en', 'es']).default('en'),
      })
      .parse(req.query);
    const rows = await report.weekly(db, weeks);
    if (format === 'json') return { weeks: rows };
    // For sponsors: a printable page (print to PDF from the browser).
    if (format === 'html') {
      reply.header('content-type', 'text/html; charset=utf-8').header('content-disposition', 'attachment; filename="prayer-tower-pilot-report.html"');
      return sponsorReport.toHtml(rows, lang);
    }
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="prayer-tower-pilot.csv"');
    return report.toCsv(rows);
  });

  // Private Prayer Warrior standings (no award is given yet).
  app.get('/admin/prayer-warriors', async (req) => {
    await requireAdmin(req);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(366).default(365) }).parse(req.query);
    return { days, standings: await warriors.standings(db, days) };
  });

  // Milestone bonus tokens: rules are placeholders (all off) until Steve sets them.
  app.get('/admin/milestones', async (req) => {
    await requireAdmin(req);
    return { rules: await milestones.rules(db), metrics: milestones.METRICS };
  });
  app.post('/admin/milestones', async (req, reply) => {
    await requireAdmin(req);
    const rule = await milestones.createRule(db, milestones.RuleInput.parse(req.body));
    reply.code(201);
    return { rule };
  });
  app.patch<{ Params: { id: string } }>('/admin/milestones/:id', async (req) => {
    await requireAdmin(req);
    const patch = milestones.RuleInput.pick({ label: true, threshold: true, amount: true, enabled: true }).partial().parse(req.body);
    return { rule: await milestones.updateRule(db, req.params.id, patch) };
  });

  // Pilot metrics: requests posted, Praying Now taps, commitments made vs kept,
  // moderation volume, tokens earned and spent.
  app.get('/admin/metrics', async (req) => {
    await requireAdmin(req);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(3650).default(7) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    const [members, content, prayer, promises, ledger, mod, radioPrayers, powerPrayers, scheduled] = await Promise.all([
      accounts.metrics(db, since),
      posts.metrics(db, since),
      prayerActions.metrics(db, since),
      commitments.metrics(db, since),
      tokens.metrics(db, since),
      moderation.metrics(db, since),
      radio.metrics(db, since),
      reach.metrics(db, since),
      schedules.metrics(db, since),
    ]);
    return { since, members, posts: content, prayer, commitments: promises, tokens: ledger, moderation: mod, radio: radioPrayers, power_prayer: powerPrayers, schedules: scheduled };
  });
}
