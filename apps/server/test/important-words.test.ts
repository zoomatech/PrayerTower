import { importantWords } from '@prayer-tower/shared';
import { describe, expect, it } from 'vitest';

describe('important words for the long-post preview', () => {
  it('picks repeated words and names, and skips common words', () => {
    const body =
      'Please pray for my father Robert. His surgery is on Tuesday and the doctors are worried about his heart. ' +
      'We are asking for healing and for wisdom for the surgeons. The surgery is long and the recovery will be longer. ' +
      'Robert has always trusted the Lord, and we want him home with us for Christmas.';
    const words = importantWords(body);
    expect(words).toHaveLength(4);
    expect(words.slice(0, 2).sort()).toEqual(['Robert', 'surgery']);
    for (const common of ['Please', 'pray', 'about', 'with', 'Lord']) expect(words).not.toContain(common);
  });
});
