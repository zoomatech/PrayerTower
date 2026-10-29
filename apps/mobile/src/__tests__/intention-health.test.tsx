// Weekly intention on Me (dots only fill, a short week is never mentioned) and the admin's
// community health view (totals only, quiet weeks folded).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CommunityHealth } from '@/app/admin';
import { WeeklyIntention } from '@/components/weekly-intention';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    setWeeklyIntention: jest.fn(),
    admin: { communityHealth: jest.fn() },
  },
}));

const week = (prayed: boolean[]) => prayed.map((p, i) => ({ date: `2026-10-${26 + i}`, prayed: p }));

it('lets a member choose an aim and never says a week fell short', async () => {
  const onChange = jest.fn();
  const next = { enabled: true, intention: { days: 3, week: week([true, false, false, false, false, false, false]), shown: 1, met: false } };
  jest.mocked(api.setWeeklyIntention).mockResolvedValue({ stats: next } as never);
  await renderApp(<WeeklyIntention intention={{ days: null, week: week([true, false, false, false, false, false, false]), shown: 1, met: false }} onChange={onChange} />);
  expect(screen.queryByText(/Days you showed up/)).toBeNull();
  await fireEvent.press(screen.getByText('3 a week'));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(next));
  expect(api.setWeeklyIntention).toHaveBeenCalledWith(3, expect.any(String));
});

it('shows the days shown up, and a kind line once the aim is met', async () => {
  await renderApp(<WeeklyIntention intention={{ days: 3, week: week([true, true, false, false, false, false, false]), shown: 2, met: false }} onChange={jest.fn()} />);
  expect(screen.getByText('Days you showed up this week: 2')).toBeTruthy();
  expect(screen.queryByText(/missed|behind|only/i)).toBeNull();
});

it('says a kind line once the aim is met', async () => {
  await renderApp(<WeeklyIntention intention={{ days: 2, week: week([true, true, false, false, false, false, false]), shown: 2, met: true }} onChange={jest.fn()} />);
  expect(screen.getByText('You did what you meant to this week. Rest well.')).toBeTruthy();
});

it('shows community health totals and folds quiet weeks', async () => {
  jest.mocked(api.admin.communityHealth).mockResolvedValue({
    enabled: true,
    weeks: [
      { weekStart: '2026-10-26', requests: 12, held: 10, answered: 2, returning: 7 },
      { weekStart: '2026-10-19', requests: null, held: null, answered: null, returning: null },
    ],
  });
  await renderApp(<CommunityHealth />);
  expect(await screen.findByText(/12 requests · 10 felt held · 2 answered · 7 came back/)).toBeTruthy();
  expect(screen.getByText(/Too quiet to say/)).toBeTruthy();
});
