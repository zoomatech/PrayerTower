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

export function buildTaskList(db: Queryable, config: Config, overrides: { classify?: Classifier; fetch?: typeof fetch; transmit?: Transmitter; mailer?: Mailer | null; removeMedia?: ((paths: string[]) => Promise<void>) | null } = {}): TaskList {
  return {
    prayer_actions_after_praying_now: afterPrayingNowTask(db),
    notifications_send_push: sendPushTask(db, config, overrides.fetch),
    moderation_scan: scanTask(db, overrides.classify ?? createClassifier(config, overrides.fetch)),
    commitments_send_due_reminders: sendDueRemindersTask(db),
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
    retention_purge: purgeTask(db, periodsFrom(config), overrides.removeMedia ?? null),
  };
}

// Times are UTC. ?fill backfills runs missed while no worker was up.
export const crontab = [
  '* * * * * commitments_send_due_reminders ?fill=10m&jobKey=commitments_send_due_reminders',
  // Scheduled token gifts (Friday evening, game start).
  '* * * * * schedules_run_due ?fill=10m&jobKey=schedules_run_due',
  // Event reminders, shortly before each event starts.
  '*/5 * * * * events_send_reminders ?fill=10m&jobKey=events_send_reminders',
  // Prayer taps that look automated (flags only; a moderator decides).
  '*/15 * * * * activity_scan ?fill=1h&jobKey=activity_scan',
  // Milestone bonus tokens (only rules an admin has enabled).
  '*/5 * * * * milestones_award_due ?fill=1h&jobKey=milestones_award_due',
  // Monday 00:05: weekly token resupply by tier (idempotent per ISO week).
  '5 0 * * 1 tiers_weekly_resupply ?fill=2d',
  // Sunday 18:00: positively framed weekly commitment review.
  '0 18 * * 0 commitments_weekly_review ?fill=6h',
  // Sunday 19:00: weekly email digest for members who turned it on (once per ISO week).
  '0 19 * * 0 digest_weekly ?fill=6h',
  // Monday 08:00: pilot report to SPONSOR_REPORT_TO.
  '0 8 * * 1 sponsor_report_weekly ?fill=1d',
  // Daily 03:30: erase removed content, old notifications and finished queues (see RETENTION_* in config).
  '30 3 * * * retention_purge ?fill=1d&jobKey=retention_purge',
  // Daily 04:15: re-derive every token balance from the ledger; alerts admins on any mismatch.
  '15 4 * * * token_ledger_check ?fill=1d&jobKey=token_ledger_check',
].join('\n');
