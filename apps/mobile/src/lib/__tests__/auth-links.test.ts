import { authLinkError, parseAuthLink } from '@/lib/auth-links';

describe('parseAuthLink', () => {
  it('reads the session from a password reset link', () => {
    expect(parseAuthLink('prayertower://account-security#access_token=a1&refresh_token=r1&expires_in=3600&type=recovery')).toEqual({
      accessToken: 'a1',
      refreshToken: 'r1',
      type: 'recovery',
    });
  });

  it('reads it from the query too (web app links)', () => {
    expect(parseAuthLink('https://app.example.org/account-security?access_token=a2&refresh_token=r2&type=email_change')).toEqual({
      accessToken: 'a2',
      refreshToken: 'r2',
      type: 'email_change',
    });
  });

  it('ignores ordinary links', () => {
    expect(parseAuthLink('prayertower://post/123')).toBeNull();
    expect(parseAuthLink('prayertower://account-security#access_token=only')).toBeNull();
    expect(parseAuthLink(null)).toBeNull();
  });
});

describe('authLinkError', () => {
  it('explains an expired link', () => {
    expect(authLinkError('prayertower://account-security#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe(
      'Email link is invalid or has expired',
    );
    expect(authLinkError('prayertower://account-security#access_token=a&refresh_token=r')).toBeNull();
  });
});
