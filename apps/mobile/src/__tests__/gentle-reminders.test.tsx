// Gentle reminders: the member's daily reminder card on Me (time, days, off),
// and the admin switches. Nothing shows while the switch is off.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { ReminderSettingsSection } from '@/app/admin';
import { DailyReminderCard, parseTime } from '@/components/daily-reminder-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(),
    dailyReminder: jest.fn(),
    setDailyReminder: jest.fn(),
    admin: { reminderSettings: jest.fn(), updateReminderSettings: jest.fn() },
  },
}));

const on = (dailyReminder: boolean) =>
  jest.mocked(api.features).mockResolvedValue({ features: { dailyReminder } } as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => resetFeatures());

it('reads typed times', () => {
  expect(parseTime('7:30')).toEqual({ hour: 7, minute: 30 });
  expect(parseTime(' 19.05 ')).toEqual({ hour: 19, minute: 5 });
  expect(parseTime('25:00')).toBeNull();
  expect(parseTime('noon')).toBeNull();
});

it('shows nothing while the switch is off', async () => {
  on(false);
  await renderApp(<DailyReminderCard />);
  expect(screen.queryByTestId('daily-reminder-card')).toBeNull();
  expect(api.dailyReminder).not.toHaveBeenCalled();
});

it('sets a reminder on chosen days, changes it, and turns it off', async () => {
  on(true);
  jest.mocked(api.dailyReminder).mockResolvedValue({ enabled: true, reminder: null });
  const saved = { hour: 7, minute: 30, days: [1, 3, 5], timeZone: 'UTC', nextAt: '2026-10-30T07:30:00Z' };
  jest.mocked(api.setDailyReminder).mockResolvedValueOnce({ enabled: true, reminder: saved }).mockResolvedValueOnce({ enabled: true, reminder: null });
  await renderApp(<DailyReminderCard />);
  await fireEvent.press(await screen.findByText('Set a reminder'));
  await fireEvent.changeText(screen.getByLabelText('Time (for example 07:30)'), '7:30');
  for (const d of [0, 2, 4, 6]) await fireEvent.press(screen.getByText(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]!));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(api.setDailyReminder).toHaveBeenCalledWith({ hour: 7, minute: 30, days: [1, 3, 5], timeZone: expect.any(String) }),
  );
  expect(await screen.findByText('At 07:30, Mon, Wed, Fri.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Turn off'));
  await waitFor(() => expect(api.setDailyReminder).toHaveBeenLastCalledWith({ off: true }));
  expect(await screen.findByText('Reminder turned off.')).toBeTruthy();
});

it('asks for a real time and at least one day', async () => {
  on(true);
  jest.mocked(api.dailyReminder).mockResolvedValue({ enabled: true, reminder: null });
  await renderApp(<DailyReminderCard />);
  await fireEvent.press(await screen.findByText('Set a reminder'));
  await fireEvent.changeText(screen.getByLabelText('Time (for example 07:30)'), 'soon');
  await fireEvent.press(screen.getByText('Save'));
  expect(await screen.findByText('Type a time like 07:30 or 19:05.')).toBeTruthy();
  expect(api.setDailyReminder).not.toHaveBeenCalled();
});

it('lets an admin turn on the daily reminder and weeks of prayer', async () => {
  const settings = { daily_reminder_enabled: false, gentle_streak_enabled: false, quiet_after: 7 };
  jest.mocked(api.admin.reminderSettings).mockResolvedValue({ settings });
  jest.mocked(api.admin.updateReminderSettings).mockResolvedValue({ settings: { ...settings, daily_reminder_enabled: true } });
  await renderApp(<ReminderSettingsSection />);
  await fireEvent.changeText(await screen.findByLabelText('Unused reminders before it slows to weekly'), '10');
  await fireEvent.press(screen.getByRole('switch', { name: /^Daily reminder at a time the member picks/ }));
  await waitFor(() => expect(api.admin.updateReminderSettings).toHaveBeenCalledWith({ quietAfter: 10, dailyReminderEnabled: true }));
  expect(await screen.findByText('Saved.')).toBeTruthy();
  expect(screen.getByRole('switch', { name: /^Weeks of prayer instead of days in a row/ })).toBeTruthy();
});
