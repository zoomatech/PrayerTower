// Pray and commit: the two core actions, from tapping the card to the thank-you.
import type { Card } from '@prayer-tower/shared';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { useCardActions } from '@/components/card-actions';
import { PostCard } from '@/components/post-card';
import { api, ApiError } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  api: {
    features: jest.fn(async () => ({ features: {} })),
    prayingNow: jest.fn(async () => ({ eventId: 'e1', integrityText: '' })),
    commit: jest.fn(async () => ({ commitment: {} })),
    wellWishes: jest.fn(async () => ({})),
    encourage: jest.fn(async () => ({})),
    precheck: jest.fn(async () => ({ warn: false })),
  },
}));

function Harness({ card, onChanged = jest.fn() }: { card: Card; onChanged?: () => void }) {
  const { onAction, sheets } = useCardActions(onChanged);
  return (
    <>
      <PostCard card={card} onAction={onAction} />
      {sheets}
    </>
  );
}

const mocked = api as jest.Mocked<typeof api>;

describe('Praying Now', () => {
  it('records the prayer and thanks the member', async () => {
    const onChanged = jest.fn();
    await renderApp(<Harness card={sampleCard()} onChanged={onChanged} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Praying Now' }));
    expect(screen.getByText(/bringing this request before the Lord/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "I'm praying now" }));
    expect(mocked.prayingNow).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    expect(await screen.findByText(/someone is praying for them right now/)).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });

  it('says the prayer will be sent later when offline', async () => {
    mocked.prayingNow.mockResolvedValueOnce({ queued: true } as never);
    await renderApp(<Harness card={sampleCard()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Praying Now' }));
    await fireEvent.press(screen.getByRole('button', { name: "I'm praying now" }));
    expect(await screen.findByText(/you're offline, so this will be sent/i)).toBeTruthy();
  });

  it('shows the server\'s reason when the prayer is refused', async () => {
    mocked.prayingNow.mockRejectedValueOnce(new ApiError(429, 'too_soon', 'Please wait a moment before praying again'));
    await renderApp(<Harness card={sampleCard()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Praying Now' }));
    await fireEvent.press(screen.getByRole('button', { name: "I'm praying now" }));
    expect(await screen.findByText('Please wait a moment before praying again')).toBeTruthy();
  });
});

describe('Commit to Pray', () => {
  it('fills in the promise with the requester\'s name and saves the chosen frequency', async () => {
    await renderApp(<Harness card={sampleCard()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Commit to Pray' }));
    expect(screen.getByDisplayValue('I will pray for Ruth.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Every week'));
    await fireEvent.press(screen.getByRole('button', { name: 'Make this commitment' }));
    expect(mocked.commit).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
      frequency: 'weekly',
      vowText: 'I will pray for Ruth.',
      durationDays: 30,
    });
    expect(await screen.findByText(/Your commitment is saved/)).toBeTruthy();
  });

  it('uses "you" for an anonymous request', async () => {
    await renderApp(<Harness card={sampleCard({ author: { id: null, displayName: 'Anonymous', handle: null, anonymous: true, tier: null, pastor: null } })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Commit to Pray' }));
    expect(screen.getByDisplayValue('I will pray for you.')).toBeTruthy();
  });

  it('does not ask again when the member already committed', async () => {
    await renderApp(<Harness card={sampleCard({ myCommitment: { id: 'c1', frequency: 'daily' } })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Commit to Pray' }));
    expect(screen.getByText('You are already praying every day for this request.')).toBeTruthy();
    expect(mocked.commit).not.toHaveBeenCalled();
  });
});
