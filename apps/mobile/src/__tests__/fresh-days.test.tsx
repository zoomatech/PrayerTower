// Fresh starts on days that matter: off shows nothing; on, a member saves up to three days,
// and on the day Me invites one small intention.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { FreshDayLine, FreshDaysCard } from '@/components/fresh-days';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: { features: jest.fn(), freshDays: jest.fn(), addFreshDay: jest.fn(), removeFreshDay: jest.fn() },
}));

const on = (freshDays: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { freshDays } } as never);
const bday = { id: 'd1', month: 5, day: 12, label: 'My birthday' };

beforeEach(() => resetFeatures());

it('shows nothing while off', async () => {
  on(false);
  await renderApp(<FreshDaysCard />);
  expect(screen.queryByTestId('fresh-days-card')).toBeNull();
  expect(api.freshDays).not.toHaveBeenCalled();
});

it('saves a day, removes one, and stops offering more at three', async () => {
  on(true);
  jest.mocked(api.freshDays).mockResolvedValue({ days: [] });
  jest.mocked(api.addFreshDay).mockResolvedValue({ days: [bday] });
  await renderApp(<FreshDaysCard />);
  await fireEvent.changeText(await screen.findByLabelText('What the day is'), 'My birthday');
  await fireEvent.changeText(screen.getByLabelText('Month (1 to 12)'), '5');
  await fireEvent.changeText(screen.getByLabelText('Day'), '12');
  await fireEvent.press(screen.getByText('Save this day'));
  await waitFor(() => expect(api.addFreshDay).toHaveBeenCalledWith({ month: 5, day: 12, label: 'My birthday' }));
  expect(await screen.findByText(/My birthday ·/)).toBeTruthy();
  jest.mocked(api.removeFreshDay).mockResolvedValue({
    days: [bday, { ...bday, id: 'd2', label: 'Two' }, { ...bday, id: 'd3', label: 'Three' }],
  });
  await fireEvent.press(screen.getByText('Remove'));
  expect(await screen.findByText(/Three ·/)).toBeTruthy();
  expect(screen.queryByText('Save this day')).toBeNull();
});

it('invites a fresh start on the day', async () => {
  on(true);
  await renderApp(<FreshDayLine day={{ label: 'my birthday' }} />);
  expect(screen.getByTestId('fresh-day')).toHaveTextContent('Today is my birthday. A fresh start: want to pick one small intention?');
});
