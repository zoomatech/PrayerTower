// Calm threads: a calm note on a warm or slowed thread, and the moderators' queue, where a
// person decides. Nothing shows while off.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CalmBanner, CalmThreadsQueue } from '@/components/calm-thread';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<string, jest.Mock>;
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(() => {
  resetFeatures();
  mocked.features!.mockResolvedValue({ features: { calmThreads: true } });
});
afterEach(() => act(() => setWording('faith')));

describe('Calm threads', () => {
  it('shows nothing while off', async () => {
    mocked.features!.mockResolvedValue({ features: {} });
    mocked.calmThread!.mockResolvedValue({ enabled: true, calm: { kind: 'warm' } });
    await renderApp(<CalmBanner postId="p1" refresh={0} />);
    await settle();
    expect(screen.queryByTestId('calm-banner')).toBeNull();
  });

  it('shows a calm note on a warm thread', async () => {
    mocked.calmThread!.mockResolvedValue({ enabled: true, calm: { kind: 'warm' } });
    await renderApp(<CalmBanner postId="p1" refresh={0} />);
    await settle();
    expect(screen.getByText(/Be curious, not judgmental/)).toBeTruthy();
  });

  it('explains slow mode once a moderator chose it', async () => {
    mocked.calmThread!.mockResolvedValue({ enabled: true, calm: { kind: 'slow', until: '2026-10-29T12:00:00Z', minutes: 10 } });
    await renderApp(<CalmBanner postId="p1" refresh={0} />);
    await settle();
    expect(screen.getByText(/one comment every 10 minutes each/)).toBeTruthy();
  });

  it('lets a moderator decide, showing counts but no heated words', async () => {
    mocked.calmThreads!.mockResolvedValue({ threads: [{ postId: 'p1', startedAt: '2026-10-29T07:00:00Z', heated: 3, people: 2, preview: 'Please pray for my dad' }] });
    mocked.decideCalmThread!.mockResolvedValue({ enabled: true, calm: null });
    await renderApp(<CalmThreadsQueue />);
    await settle();
    expect(screen.getByText('3 heated comments from 2 people')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Slow it down (6 hours)')));
    expect(api.decideCalmThread).toHaveBeenCalledWith('p1', 'slow');
  });

  it('uses Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    mocked.calmThread!.mockResolvedValue({ enabled: true, calm: { kind: 'warm' } });
    await renderApp(<CalmBanner postId="p1" refresh={0} />);
    await settle();
    expect(screen.getByText('🌤️ Let’s take a breath together')).toBeTruthy();
  });
});
