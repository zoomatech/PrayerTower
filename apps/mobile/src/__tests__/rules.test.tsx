// Community rules: the "don't pressure people" rule shows only when switched on.
import { screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import Rules from '@/app/rules';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn() } }));
const features = api.features as jest.Mock;
beforeEach(() => resetFeatures());

it('leaves the rule out while it is off', async () => {
  features.mockResolvedValue({ features: { pressureRule: false } });
  await renderApp(<Rules />);
  expect(await screen.findByText('No ads')).toBeTruthy();
  expect(screen.queryByText("Share your beliefs freely. Don't pressure people.")).toBeNull();
});

it('shows the rule once an admin turns it on', async () => {
  features.mockResolvedValue({ features: { pressureRule: true } });
  await renderApp(<Rules />);
  expect(await screen.findByText("Share your beliefs freely. Don't pressure people.")).toBeTruthy();
});
