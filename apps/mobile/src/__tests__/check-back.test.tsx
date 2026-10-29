// Gentle "check back": the asker picks a reminder day, sees when it's due, and can clear it.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CheckBack } from '@/components/check-back';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), checkBack: jest.fn(), setCheckBack: jest.fn() } }));

const on = (checkBack: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { checkBack } } as unknown as Awaited<ReturnType<typeof api.features>>);
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.checkBack).mockResolvedValue({ enabled: true, dueAt: null });
});
afterEach(() => act(() => setWording('faith')));

describe('Check back', () => {
  it('stays hidden while off', async () => {
    on(false);
    await renderApp(<CheckBack postId="p1" />);
    await settle();
    expect(screen.queryByTestId('check-back')).toBeNull();
  });

  it('sets a reminder, shows the day, and clears it', async () => {
    on(true);
    jest.mocked(api.setCheckBack).mockResolvedValueOnce({ enabled: true, dueAt: '2026-11-05T12:00:00Z' }).mockResolvedValueOnce({ enabled: true, dueAt: null });
    await renderApp(<CheckBack postId="p1" />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('In a week')));
    expect(api.setCheckBack).toHaveBeenCalledWith('p1', 7);
    expect(screen.getByText(/We’ll check back with you on/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('No reminder')));
    expect(api.setCheckBack).toHaveBeenLastCalledWith('p1', null);
    expect(screen.getByText('In 3 days')).toBeTruthy();
  });

  it('uses Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    on(true);
    await renderApp(<CheckBack postId="p1" />);
    await settle();
    expect(screen.getByText(/everyone who supported you/)).toBeTruthy();
  });
});
