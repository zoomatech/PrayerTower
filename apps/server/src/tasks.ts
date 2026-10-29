import type { TaskList } from 'graphile-worker';
import type { Config } from './config.js';
import type { Queryable } from './db.js';
import { sendDueRemindersTask, weeklyReviewTask } from './modules/commitments/index.js';
import { scanTask as activityScanTask } from './modules/activity/index.js';
import { remindTask } from './modules/events/index.js';
import { scanTask, type Classifier } from './modules/moderation/index.js';
import { createClassifier } from './modules/moderation/providers.js';
import { sendPushTask } from './modules/notifications/index.js';
import { afterPrayingNowTask } from './modules/prayer-actions/index.js';
import { transmitTask, type Transmitter } from './modules/radio/index.js';
import { awardDueTask } from './modules/milestones/index.js';
import { runDueTask } from './modules/schedules/index.js';
import { weeklyDigestTask } from './modules/digest/index.js';
import { createMailer, type Mailer } from './modules/digest/mailer.js';
import { weeklySponsorReportTask } from './modules/admin/sponsor-report.js';
import { periodsFrom, purgeTask } from './modules/retention/index.js';
import { weeklyResupplyTask } from './modules/tiers/index.js';
import { ledgerCheckTask } from './modules/tokens/ledger-check.js';
import { publishDueTask as seedPrayersTask } from './modules/seed-prayers/index.js';
import { failureCheckTask } from './modules/jobs/index.js';
import { checkTask as opsCheckTask, heartbeatTask } from './modules/ops/index.js';
import { expireTask as legalHoldsExpireTask } from './modules/legal/index.js';
import * as growth from './modules/growth/index.js';
import * as practices from './modules/practices/index.js';
import { writeDueTask as autoPrayTask } from './modules/ai/auto-pray.js';
import { createConverser, type Converse } from './modules/ai/provider.js';

export function buildTaskList(db: Queryable, config: Config, overrides: { classify?: Classifier; fetch?: typeof fetch; transmit?: Transmitter; mailer?: Mailer | null; removeMedia?: ((paths: string[]) => Promise<void>) | null; converse?: Converse | null } = {}): TaskList {
  const mail: growth.MailContext = {
    mailer: overrides.mailer !== undefined ? overrides.mailer : createMailer(config),
    siteUrl: config.PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? null,
  };
  return {
    growth_guest_answered: growth.guestAnsweredTask(db, mail),
    growth_chain_confirm: growth.chainConfirmTask(db, mail),
    growth_chain_send: growth.chainSendTask(db, mail),
    growth_prayer_minute: growth.minuteDueTask(db),
    growth_purge: growth.purgeTask(db),
    practices_followup: practices.followupDueTask(db),
    practices_gratitude: practices.gratitudeDueTask(db),
    prayer_actions_after_praying_now: afterPrayingNowTask(db),
    notifications_send_push: sendPushTask(db, config, overrides.fetch),
    moderation_scan: scanTask(db, overrides.classify ?? createClassifier(config, overrides.fetch)),
    commitments_send_due_reminders: sendDueRemindersTask(),
    commitments_weekly_review: weeklyReviewTask(db),
    tiers_weekly_resupply: weeklyResupplyTask(db),
    radio_transmit: transmitTask(db, overrides.transmit),
    schedules_run_due: runDueTask(),
    milestones_award_due: awardDueTask(),
    events_send_reminders: remindTask(db),
    activity_scan: activityScanTask(db),
    digest_weekly: weeklyDigestTask(db, overrides.mailer !== undefined ? overrides.mailer : createMailer(config)),
    sponsor_report_weekly: weeklySponsorReportTask(
      db,
      overrides.mailer !== undefined ? overrides.mailer : createMailer(config),
      config.SPONSOR_REPORT_TO.split(',').map((s) => s.trim()).filter(Boolean),
      12,
      config.SPONSOR_REPORT_LANG,
    ),
    token_ledger_check: ledgerCheckTask(db),
    jobs_failure_check: failureCheckTask(db),
    ops_heartbeat: heartbeatTask(db),
    ops_check: opsCheckTask(db),
    seed_prayers_publish: seedPrayersTask(),
    auto_pray_write: autoPrayTask(db, overrides.converse !== undefined ? overrides.converse : createConverser(config, overrides.fetch)),
    legal_holds_expire: legalHoldsExpireTask(db),
    retention_purge: purgeTask(db, periodsFrom(config), overrides.removeMedia ?? null),
  };
}

// Times are UTC. ?fill backfills runs missed while no worker was up. ?max is the
// number of tries: frequent jobs give up after 3 (the next run comes soon anyway),
// daily and weekly ones after 10 (about 2 hours). Failures show in Admin → Background jobs.
export const crontab = [
  '* * * * * commitments_send_due_reminders ?max=3&fill=10m&jobKey=commitments_send_due_reminders',
  // Scheduled token gifts (Friday evening, game start).
  '* * * * * schedules_run_due ?max=3&fill=10m&jobKey=schedules_run_due',
  // Event reminders, shortly before each event starts.
  '*/5 * * * * events_send_reminders ?max=3&fill=10m&jobKey=events_send_reminders',
  // Prayer taps that look automated (flags only; a moderator decides).
  '*/15 * * * * activity_scan ?max=3&fill=1h&jobKey=activity_scan',
  // Milestone bonus tokens (only rules an admin has enabled).
  '*/5 * * * * milestones_award_due ?max=3&fill=1h&jobKey=milestones_award_due',
  // Monday 00:05: weekly token resupply by tier (idempotent per ISO week).
  '5 0 * * 1 tiers_weekly_resupply ?max=10&fill=2d',
  // Sunday 18:00: positively framed weekly commitment review.
  '0 18 * * 0 commitments_weekly_review ?max=10&fill=6h',
  // Sunday 19:00: weekly email digest for members who turned it on (once per ISO week).
  '0 19 * * 0 digest_weekly ?max=10&fill=6h',
  // Monday 08:00: pilot report to SPONSOR_REPORT_TO.
  '0 8 * * 1 sponsor_report_weekly ?max=10&fill=1d',
  // Daily 03:30: erase removed content, old notifications and finished queues (see RETENTION_* in config).
  '30 3 * * * retention_purge ?max=10&fill=1d&jobKey=retention_purge',
  // Daily 04:15: re-derive every token balance from the ledger; alerts admins on any mismatch.
  '15 4 * * * token_ledger_check ?max=10&fill=1d&jobKey=token_ledger_check',
  // Every 10 minutes: alert admins about jobs that ran out of tries or keep failing.
  '*/10 * * * * jobs_failure_check ?max=3&jobKey=jobs_failure_check',
  // Every minute: the worker checks in (Admin → Operations, /health/ready).
  '* * * * * ops_heartbeat ?max=1&jobKey=ops_heartbeat',
  // Every 5 minutes: alert admins about overdue jobs, server errors or a silent radio station.
  '*/5 * * * * ops_check ?max=3&jobKey=ops_check',
  // Every 15 minutes: post approved seed prayers that are due (only while the switch is on).
  '*/15 * * * * seed_prayers_publish ?max=3&fill=1h&jobKey=seed_prayers_publish',
  // Auto-Pray AI prayers (does nothing while switched off or with no AI key).
  '*/30 * * * * auto_pray_write ?max=3&fill=1h&jobKey=auto_pray_write',
  // Daily 03:10: release evidence holds past their end date, erasing the copies.
  '10 3 * * * legal_holds_expire ?max=10&fill=1d&jobKey=legal_holds_expire',
  // Every minute: the prayer minute notice for members whose chosen minute it is (only while switched on).
  '* * * * * growth_prayer_minute ?max=1&jobKey=growth_prayer_minute',
  // Daily 03:20: erase guest emails past their time and stale prayer-minute and prayer-chain rows.
  '20 3 * * * growth_purge ?max=10&fill=1d&jobKey=growth_purge',
  // Daily 17:00: one "share how it's going?" per request, some days after it was prayed for (only while switched on).
  '0 17 * * * practices_followup ?max=10&fill=1d&jobKey=practices_followup',
  // Hourly: the gratitude card invitation at 6 pm on each member's chosen day (only while switched on).
  '0 * * * * practices_gratitude ?max=3&jobKey=practices_gratitude',
].join('\n');
