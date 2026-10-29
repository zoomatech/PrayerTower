// Reply prompts by kind of post: the reply that pairs with the post being answered, in
// both editions. It needs the Admin switch and the member's reply suggestions, and a tap
// only fills the box.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { ReplyHelpers, resetConversationPrefs } from '@/components/reply-helpers';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';
import { pairKey } from '@/lib/talk';
import en from '@/locales/en';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), conversationPrefs: jest.fn() } }));

const on = (f: Record<string, boolean>) => jest.mocked(api.features).mockResolvedValue({ features: f } as unknown as Awaited<ReturnType<typeof api.features>>);
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
function Composer({ postType, lament }: { postType: string; lament?: boolean }) {
  const [text, setText] = useState('');
  return (
    <>
      <ReplyHelpers lastFromOther="Please pray for my mom, she has surgery" empty={false} text={text} onPick={setText} postType={postType} lament={lament} />
      <ReplyHelpers lastFromOther={null} empty={false} text="" onPick={() => {}} />
      {text ? <Text testID="box">{text}</Text> : null}
    </>
  );
}

beforeEach(() => {
  resetFeatures();
  resetConversationPrefs();
  jest.mocked(api.conversationPrefs).mockResolvedValue({ prefs: { replySuggestions: true, troubleNudge: false, kindClosings: false, greetingPack: null, shareCounts: false } });
});
afterEach(() => act(() => setWording('faith')));

describe('Reply prompts by kind of post', () => {
  it('has a pair for every kind of post, and presence for a lament', () => {
    const pairs = en.talk.pairs as Record<string, string>;
    for (const t of ['prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional', 'discussion', 'news', 'blog']) expect(pairs[t]).toBeTruthy();
    expect(pairKey('prayer_request', true)).toBe('talk.pairs.lament');
    expect(pairs.lament).not.toMatch(/try|should|at least/i);
  });

  it('falls back to the move while off', async () => {
    on({ replySuggestions: true, typePrompts: false });
    await renderApp(<Composer postType="testimony" />);
    await settle();
    expect(screen.getByText('Praying for you right now.')).toBeTruthy();
  });

  it('offers the reply that pairs with the post, one per move', async () => {
    on({ replySuggestions: true, typePrompts: true });
    await renderApp(<Composer postType="testimony" />);
    await settle();
    expect(screen.queryByText('Praying for you right now.')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText(en.talk.pairs.testimony)));
    expect(screen.getByTestId('box').props.children).toBe(en.talk.pairs.testimony);
  });

  it('a lament gets presence', async () => {
    on({ replySuggestions: true, typePrompts: true });
    await renderApp(<Composer postType="prayer_request" lament />);
    await settle();
    expect(screen.getByText('I’m here with you.')).toBeTruthy();
  });

  it('uses Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    on({ replySuggestions: true, typePrompts: true });
    await renderApp(<Composer postType="prayer_request" />);
    await settle();
    expect(screen.getByText('Thinking of you right now. You are not alone in this.')).toBeTruthy();
  });
});
