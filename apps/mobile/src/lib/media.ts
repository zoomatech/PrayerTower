// Upload picked photos and videos straight to Supabase Storage with a signed
// upload URL from the API (the Supabase Expo tutorial's ArrayBuffer approach).
import type { ImagePickerAsset } from 'expo-image-picker';

import { api } from './api';
import { supabase } from './supabase';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'] as const;
type Allowed = (typeof ALLOWED)[number];

export async function uploadAsset(asset: ImagePickerAsset): Promise<{ kind: 'image' | 'video'; storagePath: string; durationMs?: number }> {
  const kind = asset.type === 'video' ? 'video' : 'image';
  const contentType: Allowed = (ALLOWED as readonly string[]).includes(asset.mimeType ?? '')
    ? (asset.mimeType as Allowed)
    : kind === 'video'
      ? 'video/mp4'
      : 'image/jpeg';
  const { path, token } = await api.mediaUploadUrl(contentType);
  const body = await fetch(asset.uri).then((res) => res.arrayBuffer());
  const { error } = await supabase.storage.from('post-media').uploadToSignedUrl(path, token, body, { contentType });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  // The clip's length goes with it, so the server can apply the video cap.
  return kind === 'video' && asset.duration != null ? { kind, storagePath: path, durationMs: Math.round(asset.duration) } : { kind, storagePath: path };
}
