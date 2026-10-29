// Conversation helpers: the move a message makes, and the chips under a composer.
// Nothing shows unless the Admin switch and the member's own choice are both on.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderApp } from '@/__tests__/helpers';
import { ReplyHelpers, resetConversationPrefs } from '@/components/reply-helpers';
import { api, type ConversationPrefs } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { isDownbeat, moveOf, suggestionKey } from '@/lib/talk';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), conversationPrefs: jest.fn() } }));

const on = (f: Record<string, boolean>) => jest.mocked(api.features).mockResolvedValue({ features: f } as unknown as Awaited<ReturnType<typeof api.features>>);
const prefs = (p: Partial<ConversationPrefs>) =>
  jest.mocked(api.conversationPrefs).mockResolvedValue({ prefs: { replySuggestions: false, troubleNudge: false, kindClosings: false, greetingPack: null, ...p } });

// A composer whose box the chips fill, as the real ones do.
function Composer({ last, empty }: { last: string | null; empty: boolean }) {
  const [text, setText] = useState('');
  return <ReplyHelpers lastFromOther={last} empty={empty} text={text} onPick={setText} />;
}

beforeEach(() => {
  resetFeatures();
  resetConversationPrefs();
});

describe('moves', () => {
  it('names the move, answering a trouble or thanks before a goodbye', () => {
    expect(moveOf('Hello friend')).toBe('greeting');
    expect(moveOf('How are you doing?')).toBe('howAreYou');
    expect(moveOf('Thanks so much, bye!')).toBe('thanks');
    expect(moveOf('Please pray for my mom, she has surgery')).toBe('trouble');
    expect(moveOf('Good news, the prayer was answered!')).toBe('goodNews');
    expect(moveOf('Talk soon')).toBe('farewell');
    expect(moveOf('The meeting moved to Tuesday.')).toBeNull();
    expect(suggestionKey(null, true)).toBe('talk.suggestGreeting');
    expect(suggestionKey('The meeting moved.', false)).toBeNull();
  });

  it('spots a short, downbeat answer', () => {
    expect(isDownbeat("Oh, okay I guess")).toBe(true);
    expect(isDownbeat('Been better.')).toBe(true);
    expect(isDownbeat('Great, thanks!')).toBe(false);
  });
});

describe('ReplyHelpers', () => {
  it('shows nothing while the switches are off, even if the member chose it', async () => {
    on({});
    prefs({ replySuggestions: true, kindClosings: true });
    await renderApp(<ReplyHelpers lastFromOther="Thank you!" empty={false} text="" onPick={jest.fn()} />);
    await act(async () => undefined);
    expect(screen.queryByTestId('reply-helpers')).toBeNull();
  });

  it('fills the box with the fitting reply, then reminds to make it personal', async () => {
    on({ replySuggestions: true, ownWords: true });
    prefs({ replySuggestions: true });
    await renderApp(<Composer last="Thank you!" empty={false} />);
    await act(async () => undefined);
    expect(screen.queryByText(/Make them yours/)).toBeNull();
    const chip = await screen.findByText("You're so welcome.");
    await act(async () => fireEvent.press(chip));
    expect(screen.getByText(/Make them yours/)).toBeTruthy();
  });

  it('offers a greeting from the chosen tradition to open with', async () => {
    on({ troubleNudge: true, greetingPacks: true, kindClosings: true });
    prefs({ troubleNudge: true, greetingPack: 'hawaiian', kindClosings: true });
    await renderApp(<Composer last={null} empty />);
    await act(async () => undefined);
    expect(await screen.findByText(/Aloha/)).toBeTruthy();
    expect(screen.queryByText("I'll keep you in my prayers. Talk soon.")).toBeNull();
  });

  it('offers a care question after a downbeat answer, and closings once talk has begun', async () => {
    on({ troubleNudge: true, greetingPacks: true, kindClosings: true });
    prefs({ troubleNudge: true, greetingPack: 'hawaiian', kindClosings: true });
    await renderApp(<Composer last="Been better." empty={false} />);
    await act(async () => undefined);
    expect(await screen.findByText('Want me to pray about anything?')).toBeTruthy();
    expect(screen.getByText("I'll keep you in my prayers. Talk soon.")).toBeTruthy();
    expect(screen.queryByText(/Aloha/)).toBeNull();
  });
});
