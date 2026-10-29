// Ted Lasso nudges: the private weekly "Who did you lift up?", weeks of gratitude,
// and the Believe card. Nothing shows while off.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { BelieveCard } from '@/components/believe-card';
import { GratitudeCard } from '@/components/gratitude-card';
import { LiftUpCard } from '@/components/lift-up-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), liftUp: jest.fn(), saveLiftUp: jest.fn(), gratitude: jest.fn(), saveGratitude: jest.fn(), setGratitudeDay: jest.fn() } }));

const on = (f: Record<string, boolean>) => jest.mocked(api.features).mockResolvedValue({ features: f } as unknown as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => resetFeatures());

describe('Who did you lift up?', () => {
  it('shows nothing while off', async () => {
    on({});
    await renderApp(<LiftUpCard />);
    await act(async () => undefined);
    expect(screen.queryByTestId('lift-up-card')).toBeNull();
  });

  it('saves this week’s private answer', async () => {
    on({ liftUp: true });
    jest.mocked(api.liftUp).mockResolvedValue({ enabled: true, weekStart: '2026-10-26', body: '' });
    jest.mocked(api.saveLiftUp).mockResolvedValue({ enabled: true, weekStart: '2026-10-26', body: 'My neighbour' });
    await renderApp(<LiftUpCard />);
    await act(async () => undefined);
    expect(await screen.findByText('Who did you lift up this week?')).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Who, and how'), 'My neighbour'));
    await act(async () => fireEvent.press(screen.getByText('Save')));
    expect(api.saveLiftUp).toHaveBeenCalledWith('My neighbour', expect.any(String));
    expect(screen.getByText('Saved. Thank you for lifting someone up.')).toBeTruthy();
  });
});

describe('Weeks of gratitude', () => {
  it('shows how many weeks, ever, with no mention of missed weeks', async () => {
    on({ gratitudeCard: true, gratitudeCount: true });
    jest.mocked(api.gratitude).mockResolvedValue({ enabled: true, weekday: null, weekStart: '2026-10-26', items: [], weeks: 7 });
    await renderApp(<GratitudeCard />);
    await act(async () => undefined);
    expect(await screen.findByText('Weeks you have counted good things: 7')).toBeTruthy();
    expect(screen.queryByText(/miss|streak/i)).toBeNull();
  });
});

describe('Believe', () => {
  it('invites the asker to share, and thanks the people who prayed', async () => {
    const onShare = jest.fn();
    const onClose = jest.fn();
    await renderApp(<BelieveCard mine onShare={onShare} onClose={onClose} />);
    expect(screen.getByLabelText(/^BELIEVE\. Your prayer was answered/)).toBeTruthy();
    fireEvent.press(screen.getByText('Share what happened'));
    expect(onShare).toHaveBeenCalled();
  });

  it('reads as one message for the people who prayed', async () => {
    await renderApp(<BelieveCard mine={false} onClose={jest.fn()} />);
    expect(screen.getByLabelText('BELIEVE. A prayer you carried was answered. Your prayers mattered.')).toBeTruthy();
    expect(screen.queryByText('Share what happened')).toBeNull();
  });
});
