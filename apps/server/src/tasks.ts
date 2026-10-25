import type { TaskList } from 'graphile-worker';
import type { Config } from './config.js';
import type { Queryable } from './db.js';
import { sendDueRemindersTask, weeklyReviewTask } from './modules/commitments/index.js';
import { openAiClassifier, scanTask, type Classifier } from './modules/moderation/index.js';
import { sendPushTask } from './modules/notifications/index.js';
import { afterPrayingNowTask } from './modules/prayer-actions/index.js';
import { weeklyResupplyTask } from './modules/tiers/index.js';

export function buildTaskList(db: Queryable, config: Config, overrides: { classify?: Classifier; fetch?: typeof fetch } = {}): TaskList {
  return {
    prayer_actions_after_praying_now: afterPrayingNowTask(db),
    notifications_send_push: sendPushTask(db, config, overrides.fetch),
    moderation_scan: scanTask(db, overrides.classify ?? openAiClassifier(config, overrides.fetch)),
    commitments_send_due_reminders: sendDueRemindersTask(db),
    commitments_weekly_review: weeklyReviewTask(db),
    tiers_weekly_resupply: weeklyResupplyTask(db),
  };
}

// Times are UTC. ?fill backfills runs missed while no worker was up.
export const crontab = [
  '* * * * * commitments_send_due_reminders ?fill=10m&jobKey=commitments_send_due_reminders',
  // Monday 00:05: weekly token resupply by tier (idempotent per ISO week).
  '5 0 * * 1 tiers_weekly_resupply ?fill=2d',
  // Sunday 18:00: positively framed weekly commitment review.
  '0 18 * * 0 commitments_weekly_review ?fill=6h',
].join('\n');
