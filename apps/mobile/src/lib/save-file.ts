// Hands a file to the member: a download on the web, the share sheet on iOS
// and Android (Save to Files, email, Drive and so on).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export const saveJson = (filename: string, data: unknown) =>
  saveText(filename, JSON.stringify(data, null, 2), 'application/json', 'public.json');

export async function saveText(filename: string, text: string, mimeType: string, UTI: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: filename });
}
