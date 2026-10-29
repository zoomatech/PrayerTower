// "Where it was heard": each transmission and the receivers that decoded it.
import { screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { RadioTrail } from '@/components/radio-trail';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { radioTrail: jest.fn() } }));

it('names the listener nodes, counts phones, and says when nobody has reported it', async () => {
  jest.mocked(api.radioTrail).mockResolvedValue({
    trail: [
      { sentAt: '2026-10-29T18:00:00Z', callSign: 'K0GIN', amplified: true, nodes: [{ name: 'Hilltop', snrDb: 17.9, at: '2026-10-29T18:00:05Z' }], phones: 2 },
      { sentAt: '2026-10-28T18:00:00Z', callSign: 'K0GIN', amplified: false, nodes: [], phones: 0 },
    ],
  });
  await renderApp(<RadioTrail postId="p1" />);
  expect(await screen.findByText('Where it was heard')).toBeTruthy();
  expect(screen.getByText('Hilltop (17.9 dB)')).toBeTruthy();
  expect(screen.getByText('2 phones or listening pages')).toBeTruthy();
  expect(screen.getByText(/^Went out amplified .* · K0GIN$/)).toBeTruthy();
  expect(screen.getByText('No receiver has reported it yet.')).toBeTruthy();
});

it('shows nothing while off or with no transmissions', async () => {
  jest.mocked(api.radioTrail).mockRejectedValue(new Error('not found'));
  await renderApp(<RadioTrail postId="p1" />);
  expect(screen.queryByText('Where it was heard')).toBeNull();
});
