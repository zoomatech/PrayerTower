// The Listen screen: decodes radio bursts from the microphone and, with
// receipts on, sends back fingerprints of the prayers it heard.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useAudioStream, type AudioStreamOptions } from 'expo-audio';

import { renderApp } from '@/__tests__/helpers';
import Listen from '@/app/listen';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
const frame = { callSign: 'KD9XYZ', preset: 'fm-robust-fec', snrDb: 21.34, corrected: true, prayers: ['Pray for Ana.', 'Pray for Ana.', 'Pray for rain.'], codec: 3, start: 0, end: 48000 };
jest.mock('@/lib/burst-listen', () => {
  let decoded = false;
  return {
    BurstListener: jest.fn().mockImplementation(() => ({ push: jest.fn(), meter: 0.4, decode: () => (decoded ? [] : ((decoded = true), [frame])) })),
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
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    expect(stream.stop).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
