// Community pieces: the community choice on Me, and circle requests for moderators.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import { CircleRequests } from '@/components/circle-requests';
import { CommunityPicker } from '@/components/community-picker';
import { api, type CircleRequest, type Community } from '@/lib/api';

const mockRefresh = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ refreshProfile: mockRefresh }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('@/lib/api', () => ({
  api: { communities: jest.fn(), chooseCommunity: jest.fn(), circleRequests: jest.fn(), closeCircleRequest: jest.fn(async () => ({})) },
}));

const community = (slug: string, name: string): Community =>
  ({ slug, name, tradition: slug === 'open-circle' ? 'none' : 'christian', status: 'active', isDefault: slug === 'prayer-tower', enabledPostTypes: [] }) as unknown as Community;
const tower = community('prayer-tower', 'Prayer Tower');
const circle = community('open-circle', 'Open Circle');

describe('CommunityPicker', () => {
  it('switches community, refreshes the profile and says so', async () => {
    jest.mocked(api.communities).mockResolvedValue({ mine: tower, choices: [tower, circle] });
    jest.mocked(api.chooseCommunity).mockResolvedValue({ community: circle });
    await renderApp(<CommunityPicker />);
    expect(await screen.findByRole('checkbox', { name: 'Prayer Tower', checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Open Circle' }));
    expect(api.chooseCommunity).toHaveBeenCalledWith('open-circle');
    expect(await screen.findByText('You are now in Open Circle.')).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Open Circle', checked: true })).toBeTruthy();
  });

  it('is hidden when only one community is open', async () => {
    jest.mocked(api.communities).mockResolvedValue({ mine: tower, choices: [tower] });
    await renderApp(<CommunityPicker />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.toJSON()).toBeNull();
  });
});

describe('CircleRequests', () => {
  const request: CircleRequest = { id: 'c1', userId: 'u1', displayName: 'Ruth', role: 'harmed', summary: 'A hard word at small group.', status: 'open', createdAt: '2026-10-28T12:00:00Z' };

  it('lists a request, sends the moderator to Events and marks it done', async () => {
    jest.mocked(api.circleRequests).mockResolvedValue({ requests: [request] } as Awaited<ReturnType<typeof api.circleRequests>>);
    await renderApp(<CircleRequests />);
    expect(await screen.findByText('Ruth · Was hurt')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Schedule in Events' }));
    expect(router.push).toHaveBeenCalledWith('/events');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(api.closeCircleRequest).toHaveBeenCalledWith('c1');
    expect(screen.queryByText('A hard word at small group.')).toBeNull();
  });
});
