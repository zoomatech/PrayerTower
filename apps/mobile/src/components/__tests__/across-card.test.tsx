// Pray across lines on the feed: the daily request shows only for a member who opted in, with the switch on.
import { act, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { AcrossCard } from '@/components/across-card';
import { api } from '@/lib/api';

let mockOptedIn = true;
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', display_name: 'Ruth', open_to_other_communities: mockOptedIn } }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: { crossCommunity: true } })),
    across: jest.fn(async () => ({ card: require('@/__tests__/helpers').sampleCard({ body: 'Pray for our town after the flood.' }) })),
  },
}));

describe('AcrossCard', () => {
  it("shows today's request from another community to a member who opted in", async () => {
    mockOptedIn = true;
    await renderApp(<AcrossCard onAction={jest.fn()} />);
    expect(await screen.findByText('Pray for our town after the flood.')).toBeTruthy();
    expect(screen.getByText(/Someone from another faith community asked for prayer/)).toBeTruthy();
  });

  it('asks for nothing and shows nothing when the member has not opted in', async () => {
    mockOptedIn = false;
    await renderApp(<AcrossCard onAction={jest.fn()} />);
    // Let the switches load and the focus effect run.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(api.across).not.toHaveBeenCalled();
    expect(screen.queryByText('Pray for our town after the flood.')).toBeNull();
  });
});
