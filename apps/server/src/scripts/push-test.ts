// Sends a test push to a member's phones and reports what Expo, FCM and APNs said:
//   npm run push-test -- steve@example.com            every device of that member
//   npm run push-test -- steve@example.com android    only Android
//   npm run push-test -- 'ExponentPushToken[…]'       one device
// It also checks apps/mobile/google-services.json when the file is there.
// Needs DATABASE_URL (for an email) and, if push security is on, EXPO_ACCESS_TOKEN.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';
import { checkGoogleServices, hint, sendTestPush } from '../modules/notifications/push-test.js';

const [who, platform] = process.argv.slice(2);
if (!who || (platform && !['android', 'ios'].includes(platform))) {
  console.error('usage: npm run push-test -- <email | ExponentPushToken[…]> [android|ios]');
  process.exit(1);
}
loadDotEnv();

const gs = fileURLToPath(new URL('../../../mobile/google-services.json', import.meta.url));
if (existsSync(gs)) {
  const problems = checkGoogleServices(JSON.parse(readFileSync(gs, 'utf8')));
  console.log(problems.length ? `google-services.json:\n  ${problems.join('\n  ')}` : 'google-services.json: fits the app.');
} else if (platform !== 'ios') {
  console.log('google-services.json: not in apps/mobile yet, so Android builds have push off (docs/ANDROID_PUSH.md).');
}

let tokens: string[];
if (who.startsWith('ExponentPushToken[') || who.startsWith('ExpoPushToken[')) tokens = [who];
else {
  const config = loadConfig();
  const db = createPool(config.DATABASE_URL);
  const { rows } = await db.query<{ token: string }>(
    `select p.token from public.push_tokens p join auth.users u on u.id = p.user_id
      where lower(u.email) = lower($1) and p.disabled_at is null and ($2::text is null or p.platform = $2)`,
    [who, platform ?? null],
  );
  await db.end();
  tokens = rows.map((r) => r.token);
  if (!tokens.length) {
    console.error(`no ${platform ? `${platform} ` : ''}push tokens for ${who}. Sign in on the phone with a store or development build and allow notifications.`);
    process.exit(1);
  }
}

console.log(`Sending a test notice to ${tokens.length} device(s); waiting up to 30 seconds for receipts…`);
const results = await sendTestPush({
  tokens,
  title: 'Prayer Tower test',
  body: 'If you can read this, push notifications work.',
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});
for (const r of results) {
  const label = `${r.token.slice(0, 28)}…`;
  if (r.ok) console.log(`  ${label} ${r.pending ? 'accepted (no receipt yet; check the phone)' : 'delivered to FCM/APNs'}`);
  else console.log(`  ${label} FAILED: ${r.error}${hint(r.error) ? ` (${hint(r.error)})` : ''}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 2);
