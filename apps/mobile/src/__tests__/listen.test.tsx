// The Listen screen: decodes radio bursts from the microphone and, with
// receipts on, sends back fingerprints of the prayers it heard. It keeps the
// prayers it heard on the phone, and in listener mode works signed out.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useAudioStream, type AudioStreamOptions } from 'expo-audio';

import { renderApp } from '@/__tests__/helpers';
import Listen from '@/app/listen';
import { api } from '@/lib/api';
import { loadHeard } from '@/lib/heard-log';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
let mockSession: object | null = { user: { id: 'u1' } };
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: mockSession }) }));
const frame = { callSign: 'KD9XYZ', preset: 'fm-robust-fec', snrDb: 21.34, corrected: true, prayers: ['Pray for Ana.', 'Pray for Ana.', 'Pray for rain.'], codec: 3, start: 0, end: 48000 };
const searches: number[] = [];
jest.mock('@/lib/burst-listen', () => {
  let decoded = false;
  return {
    BurstListener: jest.fn().mockImplementation(() => ({ push: jest.fn(), meter: 0.4, decode: (searchHz: number) => (searches.push(searchHz), decoded ? [] : ((decoded = true), [frame])) })),
    toMono: () => new Float32Array(0),
    receiptHashes: (f: { prayers: string[] }) => [...new Set(f.prayers)].map((p) => `hash:${p}`),
  };
});

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;

describe('Listen', () => {
  it('says so while listening is off', async () => {
    mocked.radioListen.mockResolvedValue({ enabled: false, receipts: false });
    await renderApp(<Listen />);
    expect(await screen.findByText("Listening isn't turned on yet.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start listening' })).toBeNull();
  });

  it('shows each burst it decodes and tells the senders, by fingerprint only', async () => {
    jest.useFakeTimers();
    let options: AudioStreamOptions = {};
    const stream = { start: jest.fn(async () => undefined), stop: jest.fn(), isStreaming: false };
    jest.mocked(useAudioStream).mockImplementation((o) => ((options = o ?? {}), { stream, isStreaming: false }) as unknown as ReturnType<typeof useAudioStream>);
    mocked.radioListen.mockResolvedValue({ enabled: true, receipts: true });
    mocked.listenHeard.mockResolvedValue({ matched: 2 });
    await renderApp(<Listen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Start listening' }));
    expect(stream.start).toHaveBeenCalled();
    expect(screen.getByText('Listening. Waiting for a burst...')).toBeTruthy();
    await act(async () => {
      options.onBuffer?.({ data: new ArrayBuffer(16), sampleRate: 48000, channels: 1, timestamp: 0 });
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/^From KD9XYZ at/)).toBeTruthy();
    expect(screen.getByText('fm-robust-fec, signal 21.3 dB, errors corrected')).toBeTruthy();
    expect(screen.getByText('• Pray for rain.')).toBeTruthy();
    expect(mocked.listenHeard).toHaveBeenCalledWith({ callSign: 'KD9XYZ', preset: 'fm-robust-fec', snrDb: 21.3, hashes: ['hash:Pray for Ana.', 'hash:Pray for rain.'] });
    expect(await screen.findByText('Its sender was told it was heard.')).toBeTruthy();
    // Kept on the phone as "Prayers heard on air".
    expect(screen.getByText('Prayers heard on air')).toBeTruthy();
    expect(screen.getByText('3 kept on this phone only. Nothing here is sent anywhere.')).toBeTruthy();
    expect((await loadHeard()).map((p) => p.text)).toEqual(['Pray for Ana.', 'Pray for Ana.', 'Pray for rain.']);
    // A shortwave radio may be tuned off: the decoder then searches 50 Hz either way.
    expect(searches).toEqual([0]);
    await fireEvent.press(screen.getByRole('switch', { name: /Shortwave \(SSB\) radio/ }));
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(searches.at(-1)).toBe(50);
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    expect(stream.stop).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('signed out (listener mode), reads the public setting, shows the kept prayers and can clear them', async () => {
    mockSession = null;
    mocked.listenConfig.mockResolvedValue({ enabled: true, receipts: false });
    await renderApp(<Listen />);
    expect(await screen.findByRole('button', { name: 'Start listening' })).toBeTruthy();
    expect(mocked.listenConfig).toHaveBeenCalled();
    expect(await screen.findByText('Pray for rain.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear this list' }));
    expect(await screen.findByText('Prayers this phone decodes are kept here.')).toBeTruthy();
    expect(await loadHeard()).toEqual([]);
    mockSession = { user: { id: 'u1' } };
  });
});
