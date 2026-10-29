// Private kindness milestones on Me: hidden while off, greet a new one once, never rank.
import { act, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { KindMilestones } from '@/components/kind-milestones';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), kindMilestones: jest.fn(), kindMilestonesSeen: jest.fn(async () => ({})) } }));

const on = (kindMilestones: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { kindMilestones } } as unknown as Awaited<ReturnType<typeof api.features>>);
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.kindMilestonesSeen).mockClear();
  jest.mocked(api.kindMilestones).mockResolvedValue({
    enabled: true,
    milestones: [
      { metric: 'people', level: 10, count: 12, new: true },
      { metric: 'encouragements', level: 1, count: 3, new: false },
    ],
  });
});
afterEach(() => act(() => setWording('faith')));

describe('Quiet milestones', () => {
  it('stays hidden while off', async () => {
    on(false);
    await renderApp(<KindMilestones />);
    await settle();
    expect(screen.queryByTestId('kind-milestones')).toBeNull();
    expect(api.kindMilestones).not.toHaveBeenCalled();
  });

  it('shows the levels reached, greets the new one, and marks it seen', async () => {
    on(true);
    await renderApp(<KindMilestones />);
    await settle();
    expect(screen.getByText('You’ve prayed for 10 people.')).toBeTruthy();
    expect(screen.getByText('You sent your first encouragement.')).toBeTruthy();
    expect(screen.getAllByText('New')).toHaveLength(1);
    expect(screen.getByLabelText('New: You’ve prayed for 10 people.')).toBeTruthy();
    expect(api.kindMilestonesSeen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/leaderboard|top \d|#\d/i)).toBeNull();
  });

  it('uses Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    on(true);
    await renderApp(<KindMilestones />);
    await settle();
    expect(screen.getByText('You’ve lifted up 10 people.')).toBeTruthy();
  });
});
