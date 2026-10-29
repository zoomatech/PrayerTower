// Lamp awards on a profile: the notes show, a member can give one with a note,
// and nothing shows while the switch is off.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { Lamps } from '@/components/lamps';
import { api, type Lamps as Status } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { lamps: jest.fn(), giveLamp: jest.fn() } }));

const status = (over: Partial<Status> = {}): Status => ({
  enabled: true,
  count: 1,
  lamps: [{ id: 'l1', note: 'You prayed with me every day.', createdAt: '2026-10-29T00:00:00Z', giverId: 'g', giverName: 'Ruth' }],
  canGive: true,
  leftThisWeek: 3,
  ...over,
});

describe('Lamps', () => {
  it('shows the notes and gives a lamp with a note', async () => {
    jest.mocked(api.lamps).mockResolvedValue(status());
    jest.mocked(api.giveLamp).mockResolvedValue({ id: 'l2' });
    await renderApp(<Lamps personId="p1" name="Naomi" />);
    expect(await screen.findByText('Lamps (1)')).toBeTruthy();
    expect(screen.getByText(/You prayed with me every day/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Give Naomi a lamp' }));
    await fireEvent.changeText(screen.getByLabelText('A short note of thanks'), 'Thank you for the meal.');
    await fireEvent.press(screen.getByRole('button', { name: 'Give lamp' }));
    expect(api.giveLamp).toHaveBeenCalledWith('p1', 'Thank you for the meal.');
    expect(await screen.findByText('Your lamp is on its way to Naomi.')).toBeTruthy();
  });

  it('hides the give button once the weekly lamps are used', async () => {
    jest.mocked(api.lamps).mockResolvedValue(status({ leftThisWeek: 0 }));
    await renderApp(<Lamps personId="p1" name="Naomi" />);
    expect(await screen.findByText('You can give 0 more this week.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Give Naomi a lamp' })).toBeNull();
  });

  it('shows nothing while switched off', async () => {
    jest.mocked(api.lamps).mockResolvedValue(status({ enabled: false }));
    await renderApp(<Lamps personId="p1" name="Naomi" />);
    await Promise.resolve();
    expect(screen.queryByText(/Lamps/)).toBeNull();
  });
});
