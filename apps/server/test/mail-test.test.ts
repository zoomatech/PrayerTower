import { describe, expect, it } from 'vitest';
import { checkMail, redact } from '../src/modules/digest/mail-test.js';

const ok = { verify: async () => true, sendMail: async () => ({ messageId: '<m1>' }) };

describe('mail-test', () => {
  it('never prints the SMTP password', () => {
    expect(redact('smtp://resend:re_secret_123@smtp.resend.com:587')).toBe('smtp://resend:****@smtp.resend.com:587');
    expect(redact('not a url')).toBe('(not a valid smtp:// address)');
  });

  it('signs in, and sends a test email when given an address', async () => {
    const out = await checkMail({ smtpUrl: 'smtp://u:p@smtp.example.org:587', from: 'Prayer Tower <hi@example.org>', to: 'steve@example.org' }, () => ok);
    expect(out.ok).toBe(true);
    expect(out.lines.join('\n')).toContain('Test email sent to steve@example.org (<m1>)');
    expect(out.lines.join('\n')).not.toContain(':p@');
  });

  it('explains a refused password and a refused sender in plain words', async () => {
    const badLogin = await checkMail({ smtpUrl: 'smtp://u:p@h:587', from: 'x' }, () => ({ ...ok, verify: async () => Promise.reject(Object.assign(new Error('Invalid login'), { code: 'EAUTH' })) }));
    expect(badLogin).toMatchObject({ ok: false });
    expect(badLogin.lines[1]).toMatch(/refused the user name or password/);
    const badFrom = await checkMail({ smtpUrl: 'smtp://u:p@h:587', from: 'x', to: 'a@b.c' }, () => ({ ...ok, sendMail: async () => Promise.reject(Object.assign(new Error('nope'), { responseCode: 553 })) }));
    expect(badFrom.lines.at(-1)).toMatch(/MAIL_FROM must be an address on a domain verified/);
  });
});
