// Did the installed station claim both prayers, "send" them as one burst in simulate mode and
// decode them back, and report each as sent? Reads mock-api.mjs's log. Exit 0 yes, 1 not yet.
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
const calls = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const burst = calls.find((c) => c.path === '/station/bursts' && c.body?.ok === true && c.body?.mode === 'simulate' && c.body?.decoded === 2);
const sent = ['ci-1', 'ci-2'].every((id) => calls.some((c) => c.path === `/station/radio-prayers/${id}/result` && c.body?.ok === true));
const status = calls.some((c) => c.path === '/station/status');
if (process.argv[3] === '--print') console.log(JSON.stringify({ burst: burst?.body ?? null, sent, status, calls: calls.length }, null, 1));
process.exit(burst && sent && status ? 0 : 1);
