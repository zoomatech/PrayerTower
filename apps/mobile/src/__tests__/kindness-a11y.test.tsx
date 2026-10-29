// Screen reader pass on the kindness and growth tools: with their switches on, in both
// editions, every button and link has a spoken name, headings are marked as headings,
// and no text is locked against the member's larger text setting.
import { act, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Text } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { CheckBack } from '@/components/check-back';
import { KindMilestones } from '@/components/kind-milestones';
import { KindnessIntro } from '@/components/kindness-intro';
import { LamentControls } from '@/components/lament-controls';
import { ReplyHelpers, resetConversationPrefs } from '@/components/reply-helpers';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' }, roles: [] }) }));

const mocked = api as unknown as Record<string, jest.Mock>;
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const ALL = { kindnessIntro: true, kindCloud: true, meaningReactions: true, lament: true, checkBack: true, kindMilestones: true, replySuggestions: true, typePrompts: true, kindClosings: true };

// Every text inside an element, as a screen reader would read it without a label.
function spoken(node: { props: Record<string, unknown>; children: unknown[] }): string {
  if (typeof node.props.accessibilityLabel === 'string') return node.props.accessibilityLabel;
  if (typeof node.props['aria-label'] === 'string') return node.props['aria-label'];
  return node.children.map((c) => (typeof c === 'string' ? c : spoken(c as typeof node))).join('');
}

beforeEach(() => {
  resetFeatures();
  resetConversationPrefs();
  mocked.features!.mockResolvedValue({ features: ALL });
  mocked.checkBack!.mockResolvedValue({ enabled: true, dueAt: null });
  mocked.kindMilestones!.mockResolvedValue({ enabled: true, milestones: [{ metric: 'people', level: 10, count: 10, new: true }] });
  mocked.conversationPrefs!.mockResolvedValue({ prefs: { replySuggestions: true, troubleNudge: false, kindClosings: true, greetingPack: null, shareCounts: false } });
});
afterEach(() => act(() => setWording('faith')));

describe.each(['faith', 'neutral'] as const)('Kindness tools for screen readers (%s)', (wording) => {
  it('names every button and link, and marks the headings', async () => {
    await act(() => setWording(wording));
    await renderApp(
      <>
        <KindnessIntro />
        <CheckBack postId="p1" />
        <KindMilestones />
        <LamentControls postId="p1" lament radio={false} onChange={() => {}} />
        <ReplyHelpers lastFromOther="Please pray for my mom" empty={false} text="" onPick={() => {}} postType="prayer_request" />
        <Text>end</Text>
      </>,
    );
    await settle();
    const controls = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')];
    expect(controls.length).toBeGreaterThan(5);
    for (const c of controls) expect(spoken(c as never).trim()).not.toBe('');
    expect(screen.getAllByRole('header').length).toBeGreaterThanOrEqual(3);
  });
});

it('never turns off larger text in the kindness tools', () => {
  const files = ['kindness-intro', 'check-back', 'kind-milestones', 'lament-controls', 'reply-helpers', 'meaning-chooser', 'cool-down-card', 'meaning-proposals', 'kind-cloud', 'gentle-repair'];
  for (const f of files) expect(readFileSync(join(__dirname, '..', 'components', `${f}.tsx`), 'utf8')).not.toMatch(/allowFontScaling=\{false\}/);
});
