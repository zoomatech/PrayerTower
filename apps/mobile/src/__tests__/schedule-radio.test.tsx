// Scheduled radio sends: pick a time, optionally amplified, and it is scheduled.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { ScheduleRadio } from '@/components/schedule-radio';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { scheduleSpend: jest.fn() } }));

it('schedules an amplified radio send for Friday evening', async () => {
  jest.mocked(api.scheduleSpend).mockResolvedValue({ schedule: {} } as Awaited<ReturnType<typeof api.scheduleSpend>>);
  await renderApp(<ScheduleRadio postId="p1" canAmplify />);
  await act(async () => fireEvent.press(screen.getByText('Schedule a radio send')));
  await act(async () => fireEvent.press(screen.getByText('Amplify')));
  await act(async () => fireEvent.press(screen.getByText('Schedule')));
  expect(api.scheduleSpend).toHaveBeenCalledWith('p1', expect.objectContaining({ amount: 1, repeatWeeks: 1, action: 'amplify' }));
  const at = new Date(jest.mocked(api.scheduleSpend).mock.calls[0]![1].runAt);
  expect(at.getDay()).toBe(5);
  expect(screen.getByText(/^Scheduled for /)).toBeTruthy();
});

it('shows the refusal, and offers no Amplify when it is not available', async () => {
  jest.mocked(api.scheduleSpend).mockRejectedValue(new Error('Scheduled radio sends are switched off'));
  await renderApp(<ScheduleRadio postId="p1" canAmplify={false} />);
  await act(async () => fireEvent.press(screen.getByText('Schedule a radio send')));
  expect(screen.queryByText('Amplify')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Schedule')));
  expect(api.scheduleSpend).toHaveBeenCalledWith('p1', expect.objectContaining({ action: 'radio' }));
  expect(screen.getByText('Scheduled radio sends are switched off')).toBeTruthy();
});
