// The Listen screen's SSTV reader: offered only while the prayer panel switch is on, off until
// the listener turns it on, and a panel read from an SSTV picture shows like any other frame.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useAudioStream, type AudioStreamOptions } from 'expo-audio';

import { renderApp } from '@/__tests__/helpers';
import Listen from '@/app/listen';
import { api } from '@/lib/api';
import { SstvListener } from '@/lib/burst-listen';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
const mockSession = { user: { id: 'u1' } };
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: mockSession }) }));
const mockPicture = { panel: { callSign: 'KD9XYZ', corrected: false, prayers: ['Healing for my father after his fall.'] }, end: 480000 };
jest.mock('@/lib/burst-listen', () => ({
  BurstListener: jest.fn().mockImplementation(() => ({ push: jest.fn(), meter: 0.4, decode: () => [] })),
  SstvListener: jest.fn().mockImplementation(() => {
    let read = false;
    return { push: jest.fn(), read: () => (read ? null : ((read = true), mockPicture)) };
  }),
  SSTV_PRESET: 'sstv-robot36',
  toMono: () => new Float32Array(0),
  receiptHashes: (f: { prayers: string[] }) => f.prayers.map((p) => `hash:${p}`),
  prayerHash: (p: string) => `hash:${p}`,
}));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;

it('is not offered while the switch is off', async () => {
  mocked.radioListen.mockResolvedValue({ enabled: true, receipts: false, panel: false });
  await renderApp(<Listen />);
  await screen.findByRole('button', { name: 'Start listening' });
  expect(screen.queryByText('Also read SSTV pictures')).toBeNull();
});

it('reads a prayer panel from an SSTV picture once the listener turns it on', async () => {
  jest.useFakeTimers();
  let options: AudioStreamOptions = {};
  const stream = { start: jest.fn(async () => undefined), stop: jest.fn(), isStreaming: false };
  jest.mocked(useAudioStream).mockImplementation((o) => ((options = o ?? {}), { stream, isStreaming: false }) as unknown as ReturnType<typeof useAudioStream>);
  mocked.radioListen.mockResolvedValue({ enabled: true, receipts: false, panel: true });
  await renderApp(<Listen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Start listening' }));
  const hear = () =>
    act(async () => {
      options.onBuffer?.({ data: new ArrayBuffer(16), sampleRate: 48000, channels: 1, timestamp: 0 });
      jest.advanceTimersByTime(7000);
    });
  await hear();
  // Off until the listener turns it on.
  expect(SstvListener).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('switch', { name: /Also read SSTV pictures/ }));
  await hear();
  expect(SstvListener).toHaveBeenCalledWith(48000);
  expect(await screen.findByText('• Healing for my father after his fall.')).toBeTruthy();
  expect(screen.getByText('Prayer panel, SSTV picture')).toBeTruthy();
  jest.useRealTimers();
});
