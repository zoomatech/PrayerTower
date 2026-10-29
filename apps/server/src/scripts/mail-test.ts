// Checks the email sender before go-live:
//   npm run mail-test                         signs in to SMTP_URL only
//   npm run mail-test -- steve@example.com    also sends a test email there
// Reads SMTP_URL and MAIL_FROM from the environment or .env. Never prints the password.
import { loadConfig, loadDotEnv } from '../config.js';
import { checkMail } from '../modules/digest/mail-test.js';

loadDotEnv();
const config = loadConfig();
if (!config.SMTP_URL) {
  console.error('SMTP_URL is not set (STEVE_TODO.md step A4).');
  process.exit(1);
}
const out = await checkMail({ smtpUrl: config.SMTP_URL, from: config.MAIL_FROM ?? 'Prayer Tower <no-reply@prayertower.app>', to: process.argv[2] });
console.log(out.lines.join('\n'));
process.exit(out.ok ? 0 : 1);
