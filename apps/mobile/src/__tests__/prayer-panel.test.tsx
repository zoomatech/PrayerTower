// The prayer panel: the latest prayers drawn as one picture, and read back from a photo of it
// (the photo goes through the image manipulator and jpeg-js, as on a phone).
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { encode as encodeJpeg } from 'jpeg-js';

import { renderApp } from '@/__tests__/helpers';
import PrayerPanelScreen, { foldAscii } from '@/app/prayer-panel';
import { panelPath } from '@/components/prayer-panel';
import { api } from '@/lib/api';
import { drawPanel } from '@/lib/burst-listen';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
const mockSession = { user: { id: 'u1' } };
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));
const mockPhoto = { base64: '' };
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({ resize: () => ({ renderAsync: async () => ({ saveAsync: async () => mockPhoto }) }) }),
  },
}));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const prayers = ['Pray for Ana as she starts chemo on Monday.', 'Healing for my father after his fall.', 'Peace for a family that lost their home.'];

/** The panel as a camera would see it: a JPEG with a white margin around it. */
function photoOf(cells: Uint8Array, w: number, h: number, scale = 6, margin = 40): string {
  const W = w * scale + 2 * margin;
  const H = h * scale + 2 * margin;
  const data = Buffer.alloc(W * H * 4, 255);
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++) {
      if (!cells[Math.floor(y / scale) * w + Math.floor(x / scale)]) continue;
      const i = ((y + margin) * W + x + margin) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
    }
  return Buffer.from(encodeJpeg({ data, width: W, height: H }, 90).data).toString('base64');
}

it('folds prayers as the station does', () => {
  expect(foldAscii('Pray for José’s “recovery” — today')).toBe('Pray for Jose\'s "recovery" - today');
});

it('draws one square per black cell', () => {
  expect(panelPath(Uint8Array.from([1, 0, 0, 1]), 2, 4)).toBe('M0 0h4v4h-4zM4 4h4v4h-4z');
});

it('shows the latest prayers as a panel and reads a photo of one', async () => {
  mocked.radioPanel.mockResolvedValue({ callSign: 'KD9XYZ', prayers, at: '2026-10-30T01:00:00Z' });
  const panel = drawPanel(prayers, 'KD9XYZ');
  mockPhoto.base64 = photoOf(panel.cells, panel.width, panel.height);
  await renderApp(<PrayerPanelScreen />);
  expect(await screen.findByLabelText('Prayer panel holding 3 prayers')).toBeTruthy();
  expect(screen.getByText('This panel holds 3 prayers.')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Read a panel with the camera'));
  });
  expect(await screen.findByText('From KD9XYZ: 3 prayers')).toBeTruthy();
  expect(screen.getByText(`• ${prayers[0]}`)).toBeTruthy();
});

it('says so when a photo has no panel in it', async () => {
  mocked.radioPanel.mockRejectedValue(new Error('off'));
  mockPhoto.base64 = Buffer.from(encodeJpeg({ data: Buffer.alloc(200 * 150 * 4, 200), width: 200, height: 150 }, 90).data).toString('base64');
  await renderApp(<PrayerPanelScreen />);
  expect(screen.queryByLabelText(/Prayer panel holding/)).toBeNull();
  await act(async () => {
    fireEvent.press(screen.getByText('Read a panel with the camera'));
  });
  expect(await screen.findByText(/No panel could be read/)).toBeTruthy();
});

it('asks for the camera when it is refused', async () => {
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
  mocked.radioPanel.mockRejectedValue(new Error('off'));
  await renderApp(<PrayerPanelScreen />);
  await act(async () => {
    fireEvent.press(screen.getByText('Read a panel with the camera'));
  });
  expect(await screen.findByText('The camera is needed to read a panel.')).toBeTruthy();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});
