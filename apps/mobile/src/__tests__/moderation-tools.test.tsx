// Moderation tools: search, select several waiting reports and decide them at
// once (someone who may be in danger can't be selected), and the admin switch.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { ModerationToolsSection } from '@/app/admin';
import { ModerationTools } from '@/components/moderation-tools';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(),
    moderationSearch: jest.fn(),
    bulkDecide: jest.fn(),
    admin: { moderationTools: jest.fn(), updateModerationTools: jest.fn() },
  },
}));

const on = (moderationTools: boolean) =>
  jest.mocked(api.features).mockResolvedValue({ features: { moderationTools } } as Awaited<ReturnType<typeof api.features>>);
const item = (id: string, content: string, source: 'report' | 'crisis' = 'report') => ({
  id,
  target_type: 'post' as const,
  target_id: `t-${id}`,
  source,
  reason: 'spam',
  status: 'pending',
  content,
  created_at: '2026-10-29T07:00:00Z',
  author_name: 'Sam',
  decided_by_name: null,
  decided_at: null,
  rule: null,
});

beforeEach(() => resetFeatures());

it('shows nothing while off', async () => {
  on(false);
  await renderApp(<ModerationTools ruleChoices={['other', 'ads']} onDecided={jest.fn()} />);
  expect(screen.queryByTestId('moderation-tools')).toBeNull();
  expect(api.moderationSearch).not.toHaveBeenCalled();
});

it('searches, selects all but someone in danger, and removes them together', async () => {
  on(true);
  const onDecided = jest.fn();
  jest.mocked(api.moderationSearch).mockResolvedValue({ items: [item('a', 'Buy shirts'), item('b', 'Buy candles'), item('c', 'I am not safe', 'crisis')] });
  jest.mocked(api.bulkDecide).mockResolvedValue({ decided: ['a', 'b'], skipped: [] });
  await renderApp(<ModerationTools ruleChoices={['other', 'ads']} onDecided={onDecided} />);
  expect(await screen.findByText('Buy shirts')).toBeTruthy();
  expect(screen.getByText('Someone may be in danger: decide this one on its own in the queue below.')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Search reports'), 'buy');
  await fireEvent.press(screen.getByText('Search'));
  await waitFor(() => expect(api.moderationSearch).toHaveBeenLastCalledWith({ q: 'buy', status: 'pending', source: undefined }));

  await fireEvent.press(screen.getByText('Select all 2'));
  expect(screen.getByText('2 selected')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'No ads' }));
  await fireEvent.press(screen.getByText('Remove 2'));
  await waitFor(() => expect(api.bulkDecide).toHaveBeenCalledWith({ ids: ['a', 'b'], action: 'remove', rule: 'ads' }));
  expect(await screen.findByText('Decided 2.')).toBeTruthy();
  expect(onDecided).toHaveBeenCalled();
});

it('shows past decisions with who decided', async () => {
  on(true);
  jest.mocked(api.moderationSearch).mockImplementation(async (s) => ({
    items: s.status === 'decided' ? [{ ...item('d', 'Old post'), status: 'dismissed', decided_by_name: 'Ruth', decided_at: '2026-10-28T10:00:00Z' }] : [],
  }));
  await renderApp(<ModerationTools ruleChoices={['other']} onDecided={jest.fn()} />);
  await fireEvent.press(await screen.findByRole('radio', { name: 'Decided' }));
  expect(await screen.findByText(/^Kept · by Ruth/)).toBeTruthy();
});

it('lets an admin turn the tools on and set the bulk limit', async () => {
  jest.mocked(api.admin.moderationTools).mockResolvedValue({ settings: { tools_enabled: false, bulk_max: 25 } });
  jest.mocked(api.admin.updateModerationTools).mockResolvedValue({ settings: { tools_enabled: true, bulk_max: 10 } });
  await renderApp(<ModerationToolsSection />);
  await fireEvent.changeText(await screen.findByLabelText('Most reports in one bulk decision'), '10');
  await fireEvent.press(screen.getByRole('switch', { name: /^Moderation tools/ }));
  await waitFor(() => expect(api.admin.updateModerationTools).toHaveBeenCalledWith({ bulkMax: 10, enabled: true }));
  expect(await screen.findByText('Saved.')).toBeTruthy();
});
