// Lament posts: the author marks a post as a lament and says yes or no to radio, and a
// reply to a lament that offers advice gets a gentle no-advice ask from the cloud.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { KindCloud } from '@/components/kind-cloud';
import { LamentControls } from '@/components/lament-controls';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), precheck: jest.fn(), setLament: jest.fn() } }));

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.features).mockResolvedValue({ features: { kindCloud: true, lament: true } } as unknown as Awaited<ReturnType<typeof api.features>>);
});

describe('Lament posts', () => {
  it('lets the author mark a lament, then allow radio', async () => {
    jest.mocked(api.setLament).mockResolvedValue({ lament: true, lamentRadio: false });
    function Harness() {
      const [s, setS] = useState({ lament: false, radio: false });
      return <LamentControls postId="p1" lament={s.lament} radio={s.radio} onChange={(lament, radio) => setS({ lament, radio })} />;
    }
    await renderApp(<Harness />);
    expect(screen.queryByText('Okay to send by radio')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('This is a lament')));
    expect(api.setLament).toHaveBeenCalledWith('p1', { lament: true });
    expect(screen.getByText('Okay to send by radio')).toBeTruthy();
  });

  it('asks a replier to hold back advice', async () => {
    jest.mocked(api.precheck).mockResolvedValue({ warn: false, cloud: { level: 'nudge', reason: 'advice' } });
    await renderApp(
      <View>
        <Text>Draft</Text>
        <KindCloud text="At least she is at peace." context="lamentReply" />
      </View>,
    );
    expect(await screen.findByText(/just be with them, without advice/, {}, { timeout: 3000 })).toBeTruthy();
    expect(api.precheck).toHaveBeenCalledWith('At least she is at peace.', 'lamentReply');
  });
});
