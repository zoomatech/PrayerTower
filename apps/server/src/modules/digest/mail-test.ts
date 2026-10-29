// Checks the email sender (SMTP_URL) before go-live: can it sign in, and does a
// test email go out? Used by `npm run mail-test` and `scripts/go-live.sh --check`.
import nodemailer from 'nodemailer';

interface Transport {
  verify(): Promise<unknown>;
  sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<{ messageId?: string }>;
}

/** The SMTP address without its password, safe to print. */
export function redact(smtpUrl: string) {
  try {
    const u = new URL(smtpUrl);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '(not a valid smtp:// address)';
  }
}

/** What to tell Steve about one failure, in plain words. */
export function hint(err: unknown) {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === 'EAUTH' || e.responseCode === 535) return 'The server refused the user name or password in SMTP_URL. For Brevo use an SMTP key (not an API key); for Resend the user is "resend" and the password is an API key.';
  if (e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET') return 'Could not reach the server in SMTP_URL. Check the host and port (587 is usual).';
  if (e.code === 'EENVELOPE' || e.responseCode === 550 || e.responseCode === 553) return 'The server refused the sender. MAIL_FROM must be an address on a domain verified with the email service.';
  return e.message ?? String(err);
}

export async function checkMail(
  opts: { smtpUrl: string; from: string; to?: string },
  make: (url: string) => Transport = (url) => nodemailer.createTransport(url),
): Promise<{ ok: boolean; lines: string[] }> {
  const lines = [`Email sender: ${redact(opts.smtpUrl)}`];
  let transport: Transport;
  try {
    transport = make(opts.smtpUrl);
    await transport.verify();
    lines.push('Signed in to the email server.');
  } catch (err) {
    lines.push(`Problem: ${hint(err)}`);
    return { ok: false, lines };
  }
  if (!opts.to) return { ok: true, lines };
  try {
    const sent = await transport.sendMail({ from: opts.from, to: opts.to, subject: 'Prayer Tower test email', text: 'If you can read this, sign-up, password and invite emails will reach people.' });
    lines.push(`Test email sent to ${opts.to}${sent.messageId ? ` (${sent.messageId})` : ''}. Check that inbox, and the spam folder.`);
    return { ok: true, lines };
  } catch (err) {
    lines.push(`Problem: ${hint(err)}`);
    return { ok: false, lines };
  }
}
