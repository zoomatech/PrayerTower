// Open Circle (the non-religious community): its members see warm everyday wording
// with no religious words; everyone else keeps the Prayer Tower wording.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { PostCard } from '@/components/post-card';
import en from '@/locales/en';
import { keys, literals } from '@/locales/neutral';
import { setWording, wordingForTradition } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(async () => ({ features: {} })) } }));

const RELIGIOUS = /\b(pray|prayer|prayers|praying|prayed|god|lord|jesus|church|amen|blessed|scripture|priestly|pastor|testimony|praise\w*)\b/i;

afterEach(() => act(() => setWording('faith')));

describe('Open Circle wording', () => {
  it('uses neutral words on the feed card for secular communities only', async () => {
    const onAction = jest.fn();
    const card = sampleCard({ body: 'My mother has surgery on Friday.', preview: 'My mother has surgery' });
    await renderApp(<PostCard card={card} onAction={onAction} />);
    expect(await screen.findByRole('button', { name: 'Praying Now' })).toBeTruthy();

    await act(() => setWording(wordingForTradition('secular')));
    await fireEvent.press(await screen.findByRole('button', { name: 'Thinking of You' }));
    expect(screen.getByRole('button', { name: 'Promise to Check In' })).toBeTruthy();
    expect(screen.getByText(/first to lift this up/i)).toBeTruthy();
    expect(onAction).toHaveBeenCalledWith(card, 'praying_now');
    expect(screen.queryByText(RELIGIOUS)).toBeNull();
  });

  it('keeps Prayer Tower wording for every other tradition', () => {
    expect(wordingForTradition('ecumenical')).toBe('faith');
    expect(wordingForTradition(null)).toBe('faith');
  });

  it('overrides only keys that exist in English, and its text has no religious words', () => {
    const texts: string[] = [];
    const walk = (over: object, base: unknown, path: string) => {
      for (const [k, v] of Object.entries(over)) {
        const here = path ? `${path}.${k}` : k;
        if (here !== 'enums' && !here.startsWith('enums.')) expect([here, base && typeof base === 'object' && k in base]).toEqual([here, true]);
        if (typeof v === 'string') texts.push(v);
        else walk(v, base && typeof base === 'object' ? (base as Record<string, unknown>)[k] : undefined, here);
      }
    };
    walk(keys, en, '');
    texts.push(...Object.values(literals));
    expect(texts.filter((s) => RELIGIOUS.test(s))).toEqual([]);
  });
});
