import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export type PhotoDraft = {
  uri: string;
  mimeType?: string;
  fileSize?: number;
};

const WEB_MAX_LENGTH = 1_000_000;
const NATIVE_MAX_BYTES = 10_000_000;

function photoDirectory(): Directory {
  return new Directory(Paths.document, 'catatan-foto');
}

export async function storePhoto(photo: PhotoDraft): Promise<string> {
  if (Platform.OS === 'web') {
    if (!photo.uri.startsWith('data:image/') || photo.uri.length > WEB_MAX_LENGTH) {
      throw new Error('Foto terlalu besar untuk pratinjau web. Pilih foto yang lebih kecil.');
    }
    return photo.uri;
  }
  const source = new File(photo.uri);
  if (!source.exists) throw new Error('Foto tidak ditemukan. Pilih foto lagi.');
  if (source.size > NATIVE_MAX_BYTES) throw new Error('Foto terlalu besar. Pilih foto di bawah 10 MB.');
  const folder = photoDirectory();
  folder.create({ idempotent: true, intermediates: true });
  const extension = photo.mimeType === 'image/png' ? 'png'
    : photo.mimeType === 'image/webp' ? 'webp'
    : photo.mimeType === 'image/heic' ? 'heic'
    : photo.mimeType === 'image/heif' ? 'heif'
    : 'jpg';
  const destination = new File(folder, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`);
  try {
    await source.copy(destination);
    return destination.uri;
  } catch {
    if (destination.exists) destination.delete();
    throw new Error('Foto belum bisa disimpan. Periksa ruang penyimpanan.');
  }
}

export function removeStoredPhoto(uri?: string): void {
  if (!uri || Platform.OS === 'web') return;
  const folder = photoDirectory();
  if (!uri.startsWith(`${folder.uri.replace(/\/$/, '')}/`)) return;
  const photo = new File(uri);
  if (photo.exists) photo.delete();
}