// "Show on my Lock Screen": only the author's own open request, only while switched on.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { LiveFollow } from '@/components/live-follow';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { endLive, liveFor, startLive } from '@/lib/prayed-for-live';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn() } }));
jest.mock('@/lib/prayed-for-live', () => ({
  liveSupported: () => true,
  liveFor: jest.fn(async () => null),
  startLive: jest.fn(async () => true),
  endLive: jest.fn(async () => undefined),
}));

const on = (prayedForLive: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { prayedForLive } } as Awaited<ReturnType<typeof api.features>>);
beforeEach(() => resetFeatures());

describe('LiveFollow', () => {
  it('shows nothing while off or on someone else’s request', async () => {
    on(false);
    await renderApp(<LiveFollow card={sampleCard({ id: 'p1', isMine: true })} />);
    expect(screen.queryByText('Show on my Lock Screen')).toBeNull();
    resetFeatures();
    on(true);
    await renderApp(<LiveFollow card={sampleCard({ id: 'p2', isMine: false })} />);
    expect(screen.queryByText('Show on my Lock Screen')).toBeNull();
  });

  it('starts with the waiting line, then can be taken off', async () => {
    on(true);
    await renderApp(<LiveFollow card={sampleCard({ id: 'p1', isMine: true, postType: 'prayer_request', state: 'open' })} />);
    await fireEvent.press(await screen.findByText('Show on my Lock Screen'));
    expect(startLive).toHaveBeenCalledWith('p1', { heading: 'Praying for you', line: 'Waiting for the first prayer', count: 0 });
    await fireEvent.press(await screen.findByText('Take off my Lock Screen'));
    expect(endLive).toHaveBeenCalledWith('p1');
    expect(liveFor).toHaveBeenCalledWith('p1');
  });
});
