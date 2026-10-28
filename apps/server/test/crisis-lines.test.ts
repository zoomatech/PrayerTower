import { crisisLine } from '@prayer-tower/shared';
import { describe, expect, it } from 'vitest';

describe('crisis lines', () => {
  it('picks the line for the pilot country and falls back to the US', () => {
    expect(crisisLine('US').actions[0]).toEqual({ label: 'Call 988', url: 'tel:988' });
    expect(crisisLine('ca').name).toBe('9-8-8: Suicide Crisis Helpline');
    expect(crisisLine('IE').actions[0]!.url).toBe('tel:116123');
    expect(crisisLine('UK').name).toBe('Samaritans');
    expect(crisisLine('ZZ').name).toBe('the 988 Suicide & Crisis Lifeline');
    expect(crisisLine(undefined).title).toBe('You are not alone');
  });
});
