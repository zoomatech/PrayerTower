import { describe, expect, it } from 'vitest';
import { renderDigest } from '../src/modules/digest/index.js';
import { secularFrom } from '../src/modules/digest/mailer.js';
import { renderInviteEmail } from '../src/modules/invites/email.js';

describe('Open Circle email sender', () => {
  it("keeps MAIL_FROM's address under Open Circle's name", () => {
    expect(secularFrom('Prayer Tower <hello@example.org>', { OPEN_CIRCLE_NAME: 'Kind Circle' })).toBe('Kind Circle <hello@example.org>');
    expect(secularFrom('hello@example.org', {})).toBe('Open Circle <hello@example.org>');
    expect(secularFrom('Prayer Tower <hello@example.org>', { OPEN_CIRCLE_MAIL_FROM: 'Open Circle <hi@opencircle.org>' })).toBe('Open Circle <hi@opencircle.org>');
  });

  it('marks Open Circle digests and invites, and nothing else', () => {
    const d = { name: 'Robin', prayedFor: 1, prayersReceived: 2, promisesKept: 0, promisesDue: 0, answered: [] };
    expect(renderDigest(d as never, 'en', 'r@example.org', true).secular).toBe(true);
    expect(renderDigest(d as never, 'en', 'r@example.org').secular).toBeUndefined();
    const invite = { to: 'a@example.org', code: 'ABCD1234', lang: 'en' as const, from: 'Robin', links: {} };
    expect(renderInviteEmail({ ...invite, community: { name: 'Open Circle', secular: true } } as never).secular).toBe(true);
    expect(renderInviteEmail(invite as never).secular).toBeUndefined();
  });
});
