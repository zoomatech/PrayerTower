// Cool-down: the pause card shows when one is waiting, either button puts it away,
// and nothing shows while the switch is off.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CoolDownCard } from '@/components/cool-down-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), coolDown: jest.fn(), coolDownDone: jest.fn() } }));

const on = (coolDown: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { coolDown } } as unknown as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.coolDown).mockReset().mockResolvedValue({ coolDown: { id: 'c1', line: 1 } });
  jest.mocked(api.coolDownDone).mockReset().mockResolvedValue({ ok: true });
});

describe('Cool-down card', () => {
  it('stays hidden while switched off', async () => {
    on(false);
    await renderApp(<CoolDownCard />);
    expect(screen.queryByTestId('cool-down-card')).toBeNull();
    expect(api.coolDown).not.toHaveBeenCalled();
  });

  it('offers a breather with a gentle line', async () => {
    on(true);
    await renderApp(<CoolDownCard />);
    expect(await screen.findByText(/Be curious, not judgmental/)).toBeTruthy();
    const btn = screen.getByText('Take a breather');
    await act(async () => fireEvent.press(btn));
    expect(api.coolDownDone).toHaveBeenCalledWith('c1', 'breather');
    expect(screen.getByText(/Good call/)).toBeTruthy();
  });

  it('"I’m okay" just puts it away', async () => {
    on(true);
    await renderApp(<CoolDownCard />);
    const btn = await screen.findByText('I’m okay');
    await act(async () => fireEvent.press(btn));
    expect(api.coolDownDone).toHaveBeenCalledWith('c1', 'okay');
    expect(screen.queryByTestId('cool-down-card')).toBeNull();
  });
});
