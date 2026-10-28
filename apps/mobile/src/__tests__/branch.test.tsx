// Your branch (Vine 2.0): your own requests with tendrils for each promise to pray.
import { screen } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import Branch from '@/app/branch';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', display_name: 'Ruth' } }) }));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;

beforeEach(() => {
  mocked.scriptureLeaves.mockResolvedValue({ leaves: [] });
});

describe('Your branch', () => {
  it('shows your requests with a tendril for each promise to pray', async () => {
    const card = sampleCard();
    mocked.myBranch.mockResolvedValue({ posts: [{ ...card, counts: { ...card.counts, commitments: 3 } }] });
    await renderApp(<Branch />);
    expect(await screen.findByText(card.body)).toBeTruthy();
    expect(screen.getByLabelText('3 people promised to pray for this')).toBeTruthy();
  });

  it('says the branch is bare when you have shared nothing', async () => {
    mocked.myBranch.mockResolvedValue({ posts: [] });
    await renderApp(<Branch />);
    expect(await screen.findByText('Your branch is bare for now. Share a request and it will grow here.')).toBeTruthy();
  });
});
