// Kind words practice: off shows nothing; on, one made-up moment a week, and tapping a reply
// shows how it might land. Nothing is sent to the server.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { KindWordsCard, momentFor } from '@/components/kind-words-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<string, jest.Mock>;
const features = (f: Record<string, boolean>) => mocked.features!.mockResolvedValue({ features: f });

beforeEach(() => resetFeatures());

describe('Kind words practice', () => {
  it('shows nothing while off', async () => {
    features({});
    await renderApp(<KindWordsCard />);
    expect(screen.queryByTestId('kind-words-card')).toBeNull();
  });

  it('keeps one moment all week and moves on each Monday', () => {
    const mon = momentFor(new Date('2026-10-26T00:00:00Z'));
    expect(momentFor(new Date('2026-11-01T23:59:00Z'))).toBe(mon);
    expect(momentFor(new Date('2026-11-02T00:00:00Z'))).toBe((mon + 1) % 6);
  });

  it('shows how a reply might land, with no score and nothing saved', async () => {
    features({ empathyPractice: true });
    await renderApp(<KindWordsCard now={new Date('2026-10-26T12:00:00Z')} />);
    await screen.findByTestId('kind-words-card');
    expect(screen.queryByTestId('kind-words-note')).toBeNull();
    const replies = screen.getAllByRole('radio');
    expect(replies).toHaveLength(3);
    fireEvent.press(screen.getByText('At least he’s in good hands.'));
    expect(await screen.findByText(/“At least” can quietly shrink/)).toBeTruthy();
    expect(screen.queryByText(/points|correct|wrong answer/i)).toBeNull();
    const calls = Object.keys(mocked).filter((k) => k !== 'features' && mocked[k]!.mock.calls.length);
    expect(calls).toEqual([]);
  });
});
