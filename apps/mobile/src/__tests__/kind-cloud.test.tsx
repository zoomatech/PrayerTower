// The kind cloud: with the switch on, a draft that looks aimed at someone raises a
// small cloud with a prayer and "Are you sure you want to put that out there?";
// a threat gets a firmer ask, never a refusal. Off, nothing is checked or shown.
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text, View } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { KindCloud } from '@/components/kind-cloud';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), precheck: jest.fn() } }));

const on = (kindCloud: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { kindCloud } } as Awaited<ReturnType<typeof api.features>>);
const Draft = ({ text }: { text: string }) => (
  <View>
    <Text>Draft</Text>
    <KindCloud text={text} />
  </View>
);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.precheck).mockReset();
});
afterEach(() => act(() => setWording('faith')));

describe('Kind cloud', () => {
  it('asks gently, with a prayer, when words look aimed at someone', async () => {
    on(true);
    jest.mocked(api.precheck).mockResolvedValue({ warn: false, cloud: { level: 'nudge', reason: 'aimed' } });
    await renderApp(<Draft text="You are an idiot." />);
    expect(await screen.findByText('Are you sure you want to put that out there?', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(/Set a guard over my mouth, Lord/)).toBeTruthy();
    expect(api.precheck).toHaveBeenCalledWith('You are an idiot.');
  });

  it('is read aloud once by VoiceOver, since iOS has no live regions', async () => {
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    on(true);
    jest.mocked(api.precheck).mockResolvedValue({ warn: false, cloud: { level: 'nudge', reason: 'aimed' } });
    await renderApp(<Draft text="You are a fool." />);
    await screen.findByText('Are you sure you want to put that out there?', {}, { timeout: 3000 });
    expect(spoken).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveBeenCalledWith('A gentle note about your words. Are you sure you want to put that out there?');
    spoken.mockRestore();
  });

  it('asks more firmly about a threat', async () => {
    on(true);
    jest.mocked(api.precheck).mockResolvedValue({ warn: false, cloud: { level: 'strong', reason: 'threat' } });
    await renderApp(<Draft text="I know where you live." />);
    expect(await screen.findByText(/Words like these can really hurt someone/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it('shows nothing for a kind draft', async () => {
    on(true);
    jest.mocked(api.precheck).mockResolvedValue({ warn: false, cloud: { level: 'ok' } });
    await renderApp(<Draft text="Praying for you." />);
    await act(() => new Promise((r) => setTimeout(r, 900)));
    expect(api.precheck).toHaveBeenCalled();
    expect(screen.queryByTestId('kind-cloud')).toBeNull();
  });

  it('never checks or shows anything while the switch is off', async () => {
    on(false);
    await renderApp(<Draft text="You are an idiot." />);
    await act(() => new Promise((r) => setTimeout(r, 900)));
    expect(api.precheck).not.toHaveBeenCalled();
    expect(screen.queryByTestId('kind-cloud')).toBeNull();
  });

  it("shows the harm filter's gentle redirect and helplines when the server sends one", async () => {
    on(true);
    jest.mocked(api.precheck).mockResolvedValue({
      warn: false,
      cloud: { level: 'ok' },
      harm: { category: 'revenge', message: 'Ask God for justice and protection, and leave the rest to Him.', resources: [{ name: 'Domestic violence hotline', phone: '800-799-7233' }] },
    });
    await renderApp(<Draft text="Make him pay for what he did." />);
    expect(await screen.findByText(/leave the rest to Him/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Domestic violence hotline · 800-799-7233')).toBeTruthy();
  });

  it('uses a neutral line in Open Circle', async () => {
    on(true);
    await act(() => setWording('neutral'));
    jest.mocked(api.precheck).mockResolvedValue({ warn: false, cloud: { level: 'nudge', reason: 'aimed' } });
    await renderApp(<Draft text="You are an idiot." />);
    expect(await screen.findByText('Take a breath. Kind words travel far.', {}, { timeout: 3000 })).toBeTruthy();
  });
});
