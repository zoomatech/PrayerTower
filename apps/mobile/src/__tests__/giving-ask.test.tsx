// The gentle giving ask: shown once (marked seen as it shows), with Give and Not now.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import { GivingAsk } from '@/components/notebook';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), givingAsk: jest.fn(), seenGivingAsk: jest.fn() } }));

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.features).mockResolvedValue({ features: {} } as Awaited<ReturnType<typeof api.features>>);
  jest.mocked(api.seenGivingAsk).mockResolvedValue({ ok: true });
});
afterEach(() => act(() => setWording('faith')));

describe('Gentle giving ask', () => {
  it('shows once, marks it seen, and opens Give', async () => {
    jest.mocked(api.givingAsk).mockResolvedValue({ show: true });
    await renderApp(<GivingAsk />);
    expect(await screen.findByText(/nobody's prayers are for sale/)).toBeTruthy();
    expect(api.seenGivingAsk).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Give' }));
    expect(router.push).toHaveBeenCalledWith('/give');
  });

  it('shows nothing when the server says no', async () => {
    jest.mocked(api.givingAsk).mockResolvedValue({ show: false });
    await renderApp(<GivingAsk />);
    await Promise.resolve();
    expect(screen.queryByText(/No ads, ever/)).toBeNull();
    expect(api.seenGivingAsk).not.toHaveBeenCalled();
  });

  it('uses Open Circle wording', async () => {
    jest.mocked(api.givingAsk).mockResolvedValue({ show: true });
    await act(() => setWording('neutral'));
    await renderApp(<GivingAsk />);
    expect(await screen.findByText(/nobody's attention is for sale/)).toBeTruthy();
  });
});
