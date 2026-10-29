import { describe, expect, it } from 'vitest';
import { configProblems } from '../src/config.js';

describe('configProblems', () => {
  it('passes the defaults and empty values', () => {
    expect(configProblems({ STATION_API_KEY: '' })).toEqual([]);
  });

  it('names each bad setting without printing its value', () => {
    const secret = 'short-secret';
    const problems = configProblems({ STATION_API_KEY: secret, APPLE_TEAM_ID: 'abc', STRIPE_SECRET_KEY: 'pk_live_x' });
    expect(problems.map((p) => p.split(':')[0]).sort()).toEqual(['APPLE_TEAM_ID', 'STATION_API_KEY', 'STRIPE_SECRET_KEY']);
    expect(problems.join('\n')).not.toContain(secret);
    expect(problems.join('\n')).not.toContain('pk_live_x');
  });
});
