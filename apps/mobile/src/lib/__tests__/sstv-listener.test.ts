// The listener apps' SSTV reader: a prayer panel sent as a Robot 36 picture (the station's own
// encoder), heard through the microphone in pieces, read once.
import { encodeRobot36, HEIGHT, WIDTH } from '../../../../station/src/panel/sstv';
import { drawPanel, SstvListener } from '@/lib/burst-listen';

/** The panel scaled into a 320 x 240 picture, as the station sends it. */
function picture(cells: Uint8Array, w: number, h: number): Uint8Array {
  const gray = new Uint8Array(WIDTH * HEIGHT).fill(255);
  const scale = Math.min(Math.floor(WIDTH / w), Math.floor(HEIGHT / h));
  const ox = Math.floor((WIDTH - w * scale) / 2);
  const oy = Math.floor((HEIGHT - h * scale) / 2);
  for (let y = 0; y < h * scale; y++) for (let x = 0; x < w * scale; x++) if (cells[Math.floor(y / scale) * w + Math.floor(x / scale)]) gray[(y + oy) * WIDTH + x + ox] = 0;
  return gray;
}

it('reads a panel from SSTV audio heard a piece at a time, once', () => {
  const prayers = ['Pray for Ana as she starts chemo on Monday.', 'Healing for my father after his fall.'];
  const panel = drawPanel(prayers, 'KD9XYZ');
  const rate = 48_000;
  const audio = encodeRobot36(picture(panel.cells, panel.width, panel.height), rate);
  const quiet = new Float32Array(rate);
  const listener = new SstvListener(rate);
  listener.push(quiet);
  expect(listener.read()).toBeNull();
  for (let i = 0; i < audio.length; i += 4800) listener.push(audio.subarray(i, i + 4800));
  listener.push(quiet);
  const heard = listener.read();
  expect(heard?.panel?.callSign).toBe('KD9XYZ');
  expect(heard?.panel?.prayers).toEqual(prayers);
  listener.push(quiet);
  expect(listener.read()).toBeNull();
}, 60_000);

it.each([8_000, 11_025, 16_000, 44_100])('reads it from a microphone at %i Hz too, and odd samples do no harm', (rate) => {
  const prayers = ['Pray for Ana as she starts chemo on Monday.'];
  const panel = drawPanel(prayers, 'KD9XYZ');
  const audio = encodeRobot36(picture(panel.cells, panel.width, panel.height), rate);
  const listener = new SstvListener(rate);
  listener.push(new Float32Array([Number.NaN, Number.POSITIVE_INFINITY, 0]));
  listener.push(new Float32Array(0));
  listener.push(new Float32Array(rate));
  for (let i = 0; i < audio.length; i += 1000) listener.push(audio.subarray(i, i + 1000));
  listener.push(new Float32Array(rate));
  expect(listener.read()?.panel?.prayers).toEqual(prayers);
}, 60_000);
