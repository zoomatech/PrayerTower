// Kindness starter set: the admin sees which tools are on and turns the set on or off in one tap.
// Every switch in the server's list has a name in the app.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { KindnessStarterSection } from '@/app/admin';
import { api } from '@/lib/api';
import en from '@/locales/en';

jest.mock('@/lib/api', () => ({
  api: { features: jest.fn(async () => ({ features: {} })), admin: { kindnessStarter: jest.fn(), setKindnessStarter: jest.fn() } },
}));

const server = readFileSync(join(__dirname, '../../../server/src/modules/kindness-starter/index.ts'), 'utf8');
const keys = [...server.matchAll(/'([a-z_]+)_enabled'\]/g)].map((m) => m[1]!);

it('names every switch in the server list', () => {
  expect(keys.length).toBeGreaterThan(10);
  const named = en.starter.items as Record<string, string>;
  expect(keys.filter((k) => !named[k])).toEqual([]);
});

it('turns the set on, then shows how many are on', async () => {
  const items = keys.map((key) => ({ key, on: false }));
  jest.mocked(api.admin.kindnessStarter).mockResolvedValue({ items, allOn: false, anyOn: false });
  jest.mocked(api.admin.setKindnessStarter).mockResolvedValue({ items: items.map((i) => ({ ...i, on: true })), allOn: true, anyOn: true });
  await renderApp(<KindnessStarterSection />);
  expect(await screen.findByText(`0 of ${keys.length} are on.`)).toBeTruthy();
  expect(screen.queryByText('Turn the starter set off')).toBeNull();
  await fireEvent.press(screen.getByText('Turn the starter set on'));
  await waitFor(() => expect(api.admin.setKindnessStarter).toHaveBeenCalledWith(true));
  expect(await screen.findByText(`${keys.length} of ${keys.length} are on.`)).toBeTruthy();
  expect(screen.getByText(/Goldfish memory/)).toBeTruthy();
  expect(screen.queryByText('Turn the starter set on')).toBeNull();
});
