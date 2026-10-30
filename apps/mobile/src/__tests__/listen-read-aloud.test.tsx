// The Listen screen's "Read prayers aloud": offered only while the admin's switch is on, off
// until the listener turns it on, and read with the device's own speech.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useAudioStream, type AudioStreamOptions } from 'expo-audio';
import * as Speech from 'expo-speech';

import { renderApp } from '@/__tests__/helpers';
import Listen from '@/app/listen';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
const mockSession = { user: { id: 'u1' } };
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: mockSession }) }));
const frame = { callSign: 'KD9XYZ', preset: 'fm-standard', snrDb: 18, corrected: false, prayers: ['Pray for someone’s surgery.'], codec: 3, start: 0, end: 48000 };
jest.mock('@/lib/burst-listen', () => ({
  BurstListener: jest.fn().mockImplementation(() => {
    let decoded = false;
    return { push: jest.fn(), meter: 0.4, decode: () => (decoded ? [] : ((decoded = true), [frame])) };
  }),
  toMono: () => new Float32Array(0),
  receiptHashes: (f: { prayers: string[] }) => f.prayers.map((p) => `hash:${p}`),
  prayerHash: (p: string) => `hash:${p}`,
}));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;

async function hearOne(options: () => AudioStreamOptions) {
  await act(async () => {
    options().onBuffer?.({ data: new ArrayBuffer(16), sampleRate: 48000, channels: 1, timestamp: 0 });
    jest.advanceTimersByTime(2000);
  });
}

it('is not offered while the switch is off', async () => {
  mocked.radioListen.mockResolvedValue({ enabled: true, receipts: false, readAloud: false });
  await renderApp(<Listen />);
  await screen.findByRole('button', { name: 'Start listening' });
  expect(screen.queryByText('Read prayers aloud')).toBeNull();
});

it('reads each decoded prayer aloud once the listener turns it on', async () => {
  jest.useFakeTimers();
  let options: AudioStreamOptions = {};
  const stream = { start: jest.fn(async () => undefined), stop: jest.fn(), isStreaming: false };
  jest.mocked(useAudioStream).mockImplementation((o) => ((options = o ?? {}), { stream, isStreaming: false }) as unknown as ReturnType<typeof useAudioStream>);
  mocked.radioListen.mockResolvedValue({ enabled: true, receipts: false, readAloud: true });
  await renderApp(<Listen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Start listening' }));
  await hearOne(() => options);
  // Off until the listener turns it on.
  expect(Speech.speak).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('switch', { name: /Read prayers aloud/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Start listening' }));
  await hearOne(() => options);
  expect(Speech.speak).toHaveBeenCalledWith('Pray for someone’s surgery.', { language: 'en-US' });

  await fireEvent.press(screen.getByRole('switch', { name: /Read prayers aloud/ }));
  expect(Speech.stop).toHaveBeenCalled();
  jest.useRealTimers();
});
