// The prayer panel (docs/RADIO_BURST.md, "Prayer panel"): a batch of prayers packed into one
// black-and-white picture to show, print or send as SSTV, and read back from a photo. Drawing
// and reading run on the device (the station's decoder, burst-decoder.generated.js). Off with
// the admin's switch.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { decode as decodeJpeg } from 'jpeg-js';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { readPanel, type PanelRead } from '@/lib/burst-listen';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

/** The panel's black cells as one SVG path, `size` pixels a cell. */
export function panelPath(cells: Uint8Array, width: number, size: number): string {
  let d = '';
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    const x = (i % width) * size;
    const y = Math.floor(i / width) * size;
    d += `M${x} ${y}h${size}v${size}h-${size}z`;
  }
  return d;
}

/** A panel drawn on screen: black on white, as a camera or an SSTV receiver sees it. */
export function PanelPicture({ panel, cell = 4, label }: { panel: { cells: Uint8Array; width: number; height: number }; cell?: number; label: string }) {
  const w = panel.width * cell;
  const h = panel.height * cell;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ alignSelf: 'center' }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <Rect x={0} y={0} width={w} height={h} fill="#FFFFFF" />
        <Path d={panelPath(panel.cells, panel.width, cell)} fill="#000000" />
      </Svg>
    </View>
  );
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** A photo (any size) to a grayscale picture about 1,000 pixels wide, read for a panel. */
export async function readPhoto(uri: string): Promise<PanelRead | null> {
  const ctx = ImageManipulator.manipulate(uri).resize({ width: 1000 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, base64: true, compress: 0.9 });
  if (!saved.base64) return null;
  const { width, height, data } = decodeJpeg(fromBase64(saved.base64), { useTArray: true, formatAsRGBA: true });
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!);
  return readPanel(gray, width, height);
}

/** "Read a panel with the camera" and "from a picture", with what was read. */
export function PanelReader({ onRead }: { onRead?: (r: PanelRead) => void }) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const [read, setRead] = useState<PanelRead | null>(null);
  const take = async (camera: boolean) => {
    setNote(null);
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setNote(t('panel.cameraNeeded'));
    }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setNote(t('panel.reading'));
    try {
      const r = await readPhoto(res.assets[0].uri);
      if (!r) return setNote(t('panel.notFound'));
      setNote(null);
      setRead(r);
      onRead?.(r);
    } catch {
      setNote(t('panel.notFound'));
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      <Button label={t('panel.camera')} onPress={() => void take(true)} />
      <Button variant="secondary" label={t('panel.picture')} onPress={() => void take(false)} />
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
      {read ? (
        <View style={{ gap: space.xs }} testID="panel-read">
          <Text style={type.heading}>{t('panel.readFrom', { callSign: read.callSign, count: read.prayers?.length ?? 0 })}</Text>
          {(read.prayers ?? []).map((p, i) => (
            <Text key={i} style={type.body}>
              • {p}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Admin → Radio: the prayer panel's switch. */
export function RadioPanelToggle() {
  const t = useT();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api.admin.radioPanel().then((r) => setOn(r.enabled), () => undefined);
  }, []);
  if (on === null) return null;
  return <Toggle label={t('panel.adminOn')} hint={t('panel.adminHint')} value={on} onChange={(v) => api.admin.setRadioPanel(v).then((r) => setOn(r.enabled), () => undefined)} />;
}
