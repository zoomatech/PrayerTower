// Encouragement partners: join after agreeing, check in with a mood, leave quietly.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { PartnerCard } from '@/components/partner-card';
import { api, type PartnerState } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), partner: jest.fn(), joinPartners: jest.fn(), leavePartners: jest.fn(), partnerCheckIn: jest.fn() } }));

const on = (partners: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { partners } } as unknown as Awaited<ReturnType<typeof api.features>>);
const none: PartnerState = { enabled: true, days: 30, status: 'none', partner: null, endsAt: null, canCheckIn: false, checkins: [] };
const paired: PartnerState = { ...none, status: 'paired', partner: { id: 'u2', displayName: 'Sam' }, endsAt: '2026-11-28T00:00:00Z', canCheckIn: true };

beforeEach(() => resetFeatures());

describe('Encouragement partner', () => {
  it('shows nothing while off', async () => {
    on(false);
    await renderApp(<PartnerCard />);
    await act(async () => undefined);
    expect(screen.queryByTestId('partner-card')).toBeNull();
  });

  it('joins only after agreeing to be kind', async () => {
    on(true);
    jest.mocked(api.partner).mockResolvedValue(none);
    jest.mocked(api.joinPartners).mockResolvedValue({ ...none, status: 'waiting' });
    await renderApp(<PartnerCard />);
    await act(async () => undefined);
    expect(await screen.findByText(/for 30 days to check in on each other/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Find me a partner')));
    expect(api.joinPartners).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText(/I will be kind/)));
    await act(async () => fireEvent.press(screen.getByText('Find me a partner')));
    expect(api.joinPartners).toHaveBeenCalled();
    expect(screen.getByText(/You're on the list/)).toBeTruthy();
  });

  it('checks in with a mood and a note, and leaves quietly', async () => {
    on(true);
    jest.mocked(api.partner).mockResolvedValue(paired);
    jest.mocked(api.partnerCheckIn).mockResolvedValue({ ...paired, canCheckIn: false, checkins: [{ id: 'c1', mine: true, mood: 'hard', note: 'Long week', at: '2026-10-29T00:00:00Z' }] });
    jest.mocked(api.leavePartners).mockResolvedValue(none);
    await renderApp(<PartnerCard />);
    await act(async () => undefined);
    expect(await screen.findByText('Your partner: Sam')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Hard day')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('A few words (optional)'), 'Long week'));
    await act(async () => fireEvent.press(screen.getByText('Check in')));
    expect(api.partnerCheckIn).toHaveBeenCalledWith('hard', 'Long week');
    expect(screen.getByText("You've checked in today.")).toBeTruthy();
    expect(screen.getByText('You: a hard day · Long week')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Leave')));
    expect(screen.getByText('Thank you for being a partner.')).toBeTruthy();
  });
});
