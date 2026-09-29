import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { PhotoDraft } from '@/lib/photo-attachments';

function showPhotoError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : 'Foto belum bisa dipilih.';
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Foto belum tersedia', message);
}

async function makeWebPhoto(uri: string): Promise<string> {
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Foto belum bisa dibuka.'));
    image.src = uri;
  });
  const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Foto belum bisa diproses di browser ini.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/jpeg', 0.7);
  if (result.length > 1_000_000) throw new Error('Foto terlalu besar. Pilih foto yang lebih kecil.');
  return result;
}

export function PhotoPickerField({ label, uri, onChange, disabled = false }: {
  label: string;
  uri?: string;
  onChange: (photo: PhotoDraft | null) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const [picking, setPicking] = useState(false);

  const pick = async (camera: boolean) => {
    if (picking || disabled) return;
    setPicking(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Izinkan akses kamera untuk mengambil foto bukti.');
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.65 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.65 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      onChange({
        uri: Platform.OS === 'web' ? await makeWebPhoto(asset.uri) : asset.uri,
        mimeType: Platform.OS === 'web' ? 'image/jpeg' : asset.mimeType,
        fileSize: asset.fileSize,
      });
    } catch (cause) {
      showPhotoError(cause);
    } finally {
      setPicking(false);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label} <Text style={{ color: colors.mutedForeground }}>(opsional)</Text></Text>
      {uri ? <Image source={{ uri }} style={[styles.preview, { backgroundColor: colors.secondary }]} resizeMode="contain" accessibilityLabel={label} /> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Pilih foto dari galeri" testID="pick-photo-gallery" disabled={picking || disabled} onPress={() => void pick(false)}
          style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="image" size={16} color={colors.action} />
          <Text style={[styles.buttonText, { color: colors.action }]}>{uri ? 'Ganti foto' : 'Pilih foto'}</Text>
        </Pressable>
        {Platform.OS !== 'web' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Ambil foto dengan kamera" disabled={picking || disabled} onPress={() => void pick(true)}
            style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="camera" size={16} color={colors.action} />
            <Text style={[styles.buttonText, { color: colors.action }]}>Kamera</Text>
          </Pressable>
        ) : null}
        {uri ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Hapus foto" testID="remove-photo" disabled={picking || disabled} onPress={() => onChange(null)} style={styles.remove}>
            <Feather name="trash-2" size={17} color={colors.destructive} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>Tanpa foto pun catatan tetap bisa disimpan.</Text>
    </View>
  );
}

export function PhotoProof({ uri, label }: { uri?: string; label: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (!uri) return null;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={styles.proofLink}>
        <Feather name="image" size={14} color={colors.action} />
        <Text style={[styles.proofText, { color: colors.action }]}>{label}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tutup foto" onPress={() => setOpen(false)} style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Feather name="x" size={25} color={colors.primaryForeground} />
          </Pressable>
          <Image source={{ uri }} resizeMode="contain" style={styles.fullImage} accessibilityLabel={label} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  preview: { width: '100%', height: 150, borderRadius: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  button: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, height: 42, flexDirection: 'row', alignItems: 'center', gap: 7 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  remove: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  proofLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start', minHeight: 30 },
  proofText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  viewer: { flex: 1, backgroundColor: 'rgba(10, 7, 25, 0.94)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  viewerClose: { position: 'absolute', right: 20, zIndex: 1, padding: 12 },
  fullImage: { width: '100%', height: '75%' },
});