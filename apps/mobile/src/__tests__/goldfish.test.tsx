// Goldfish memory: the queue line for a first slip, recent removals, serious ones and a repeat,
// and the admin switch with its two numbers.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { GoldfishSection } from '@/app/admin';
import { GoldfishLine } from '@/app/moderation';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    admin: { goldfish: jest.fn(), updateGoldfish: jest.fn() },
  },
}));

const settings = { goldfish_enabled: false, goldfish_days: 90, goldfish_repeat: 3 };

it('says a first slip is a first slip', async () => {
  await renderApp(<GoldfishLine h={{ recent: 0, serious: 0, days: 90, repeat: false }} />);
  expect(screen.getByTestId('goldfish-line')).toHaveTextContent('No removals for this person in the last 90 days.');
});

it('shows recent and serious removals, and a repeat', async () => {
  await renderApp(<GoldfishLine h={{ recent: 3, serious: 1, days: 60, repeat: true }} />);
  expect(screen.getByTestId('goldfish-line')).toHaveTextContent(
    '3 removed in the last 60 days. 1 for serious harm (these never fade). This keeps happening: an admin has been told.',
  );
});

it('lets an admin switch it on and change the numbers', async () => {
  jest.mocked(api.admin.goldfish).mockResolvedValue({ settings });
  jest.mocked(api.admin.updateGoldfish).mockResolvedValue({ settings: { ...settings, goldfish_enabled: true, goldfish_days: 30 } });
  await renderApp(<GoldfishSection />);
  await fireEvent.changeText(await screen.findByLabelText('Days before a removal fades (14 to 365)'), '30');
  await fireEvent.press(screen.getByRole('switch', { name: /Show recent removals/ }));
  await waitFor(() => expect(api.admin.updateGoldfish).toHaveBeenCalledWith({ days: 30, repeat: 3, enabled: true }));
  expect(await screen.findByText('Saved.')).toBeTruthy();
});
