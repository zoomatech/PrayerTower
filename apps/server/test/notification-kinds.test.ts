// Every kind of notice the server sends either belongs to a category a member can switch off
// (Me → Notification settings) or is on the always-sent list below: safety, account and staff notices.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { notificationCategory } from '@prayer-tower/shared';
import { describe, expect, it } from 'vitest';

const ALWAYS_SENT = [
  // Safety and moderation, to the member concerned.
  'appeal_decision', 'held_for_review', 'support_resources', 'moderation_repeat',
  // The member's own account and requests they made.
  'account_security', 'church_verified', 'church_declined', 'crosspost_reconnect',
  // Staff only.
  'crisis_flag', 'feedback_summary', 'harm_weekly_report', 'job_alert', 'ledger_alert', 'legal_referral',
  'moderation_handoff', 'oncall_escalation', 'oncall_reminder', 'ops_alert', 'radio_alert', 'radio_alert_cleared', 'radio_request', 'radio_urgent_confirmed',
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('notice kinds', () => {
  it('each one a member gets can be switched off, unless it is a safety, account or staff notice', () => {
    const kinds = new Set<string>();
    for (const f of files(join(__dirname, '../src/modules'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/notify\w*\([^{]*\{\s*kind: ['`](\w+)['`]/g)) kinds.add(m[1]!);
    }
    expect(kinds.size).toBeGreaterThan(50);
    const uncategorized = [...kinds].filter((k) => !notificationCategory(k) && !ALWAYS_SENT.includes(k)).sort();
    expect(uncategorized).toEqual([]);
  });
});
