// Conversation helpers: the move a message makes, and the chips under a composer.
// Nothing shows unless the Admin switch and the member's own choice are both on.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderApp } from '@/__tests__/helpers';
import { AccessibilityInfo, Pressable, Text } from 'react-native';

import { ReplyHelpers, resetConversationPrefs, useTalkCount } from '@/components/reply-helpers';
import { api, type ConversationPrefs } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { chainOf, isDownbeat, moveOf, suggestionKey } from '@/lib/talk';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), conversationPrefs: jest.fn(), talkCount: jest.fn() } }));

const on = (f: Record<string, boolean>) => jest.mocked(api.features).mockResolvedValue({ features: f } as unknown as Awaited<ReturnType<typeof api.features>>);
const prefs = (p: Partial<ConversationPrefs>) =>
  jest.mocked(api.conversationPrefs).mockResolvedValue({ prefs: { replySuggestions: false, troubleNudge: false, kindClosings: false, greetingPack: null, shareCounts: false, ...p } });

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
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    // A suggestion is a button with a hint, not a checkbox.
    const chip = await screen.findByRole('button', { name: "You're so welcome." });
    expect(chip.props.accessibilityHint).toMatch(/edit them before sending/);
    await act(async () => fireEvent.press(chip));
    expect(screen.getByText(/Make them yours/)).toBeTruthy();
    expect(spoken).toHaveBeenCalledWith(expect.stringContaining('Added to your message box'));
    spoken.mockRestore();
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

describe('Counting patterns', () => {
  function Sender() {
    const count = useTalkCount();
    return (
      <Pressable onPress={() => count({ kind: 'chain', moves: chainOf('Hi there', 'Hello!', 'How are you?')! })}>
        <Text>send</Text>
      </Pressable>
    );
  }

  it('turns three messages into move labels only', () => {
    expect(chainOf('Hi there', 'Hello!', 'How are you?')).toEqual(['greeting', 'greeting', 'howAreYou']);
    expect(chainOf('Hi', 'The meeting moved.', 'ok')).toEqual(['greeting', 'other', 'other']);
    expect(chainOf('The meeting moved.', 'Hi', 'ok')).toBeNull();
    expect(chainOf('Hi', undefined, 'ok')).toBeNull();
  });

  it('sends a count only when the switch is on and the member shares', async () => {
    jest.mocked(api.talkCount).mockResolvedValue({ counted: true });
    on({ talkCounts: true });
    prefs({ shareCounts: false });
    await renderApp(<Sender />);
    await act(async () => undefined);
    await act(async () => fireEvent.press(screen.getByText('send')));
    expect(api.talkCount).not.toHaveBeenCalled();
  });

  it('sends the labels once the member chooses to share', async () => {
    jest.mocked(api.talkCount).mockResolvedValue({ counted: true });
    on({ talkCounts: true });
    prefs({ shareCounts: true });
    await renderApp(<Sender />);
    await act(async () => undefined);
    await act(async () => fireEvent.press(screen.getByText('send')));
    expect(api.talkCount).toHaveBeenCalledWith({ kind: 'chain', moves: ['greeting', 'greeting', 'howAreYou'] });
  });
});
