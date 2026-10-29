// Auto-Pray: AI prayers show labeled and counted apart; only the person who asked
// sees the switch; nothing shows while the feature is off.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { AiPrayers } from '@/components/ai-prayers';
import { api, type AiPrayers as Status } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { aiPrayers: jest.fn(), setAutoPray: jest.fn() } }));

const status = (over: Partial<Status> = {}): Status => ({
  enabled: true,
  optedIn: true,
  until: null,
  count: 2,
  prayers: [{ id: 'a1', body: 'Lord, give her calm on Friday. Amen.', createdAt: '2026-10-29T00:00:00Z' }],
  isMine: false,
  ...over,
});

describe('AI prayers', () => {
  it('shows AI prayers labeled as AI to others, with no switch', async () => {
    jest.mocked(api.aiPrayers).mockResolvedValue(status());
    await renderApp(<AiPrayers postId="p1" />);
    expect(await screen.findByText('AI prayers (2)')).toBeTruthy();
    expect(screen.getByText(/Written by an AI, not by a person/)).toBeTruthy();
    expect(screen.getByText('Lord, give her calm on Friday. Amen.')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('lets the person who asked turn it on', async () => {
    jest.mocked(api.aiPrayers).mockResolvedValue(status({ isMine: true, optedIn: false, count: 0, prayers: [] }));
    jest.mocked(api.setAutoPray).mockResolvedValue(status({ isMine: true, optedIn: true, count: 0, prayers: [] }));
    await renderApp(<AiPrayers postId="p1" />);
    await fireEvent.press(await screen.findByRole('switch', { name: /Have an AI pray for this request/ }));
    expect(api.setAutoPray).toHaveBeenCalledWith('p1', true);
  });

  it('shows nothing while switched off', async () => {
    jest.mocked(api.aiPrayers).mockResolvedValue(status({ enabled: false }));
    await renderApp(<AiPrayers postId="p1" />);
    await Promise.resolve();
    expect(screen.queryByText(/AI prayers/)).toBeNull();
  });
});
