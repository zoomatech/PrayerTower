// Kindness highlights: "This lifted me up" asks the writer, and stays hidden while off.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { LiftedMeUp } from '@/components/kindness-highlights';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), liftedMeUp: jest.fn() } }));

const on = (v: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { kindnessHighlights: v } } as unknown as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => resetFeatures());

it('"This lifted me up" stays hidden while off', async () => {
  on(false);
  await renderApp(<LiftedMeUp commentId="c1" />);
  await act(async () => undefined);
  expect(screen.queryByTestId('lifted-c1')).toBeNull();
});

it('asks the writer when on', async () => {
  on(true);
  jest.mocked(api.liftedMeUp).mockResolvedValue({ asked: true });
  await renderApp(<LiftedMeUp commentId="c2" />);
  await act(async () => undefined);
  const link = await screen.findByTestId('lifted-c2');
  await act(async () => fireEvent.press(link));
  expect(api.liftedMeUp).toHaveBeenCalledWith('c2');
  expect(screen.getByText(/We asked the writer/)).toBeTruthy();
});
