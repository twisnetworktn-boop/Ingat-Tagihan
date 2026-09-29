import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export type Snapshot = {
  title: string;
  subtitle: string;
  rows: { label: string; value: string }[];
  note?: string;
  photoUri?: string;
};

export function TransactionSnapshot({ snapshot, onClose }: { snapshot: Snapshot | null; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" visible={snapshot !== null} onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={[styles.icon, { backgroundColor: colors.actionSoft }]}>
              <Feather name="check-circle" size={19} color={colors.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>SNAPSHOT TRANSAKSI</Text>
              <Text style={[styles.heading, { color: colors.foreground }]}>{snapshot?.subtitle ?? ''}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup snapshot" onPress={onClose} hitSlop={8} style={styles.close}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.foreground }]}>{snapshot?.title ?? ''}</Text>
            {snapshot?.rows.map(({ label, value }, index) => (
              <View key={`${label}-${index}`} style={[styles.row, { borderBottomColor: colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <Text style={[styles.rowValue, { color: colors.foreground }]}>{value}</Text>
              </View>
            ))}
            {snapshot?.note ? (
              <View style={styles.extra}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Catatan</Text>
                <Text style={[styles.note, { color: colors.foreground }]}>{snapshot.note}</Text>
              </View>
            ) : null}
            {snapshot?.photoUri ? (
              <View style={styles.extra}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Foto bukti / nota</Text>
                <Image source={{ uri: snapshot.photoUri }} resizeMode="contain" style={[styles.photo, { backgroundColor: colors.secondary }]} accessibilityLabel="Foto bukti transaksi" />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 8, 32, 0.66)', justifyContent: 'center', paddingHorizontal: 18 },
  sheet: { borderWidth: 1, borderRadius: 12, maxHeight: '100%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 3 },
  close: { padding: 5 },
  content: { padding: 20, gap: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 23, marginBottom: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, paddingVertical: 12 },
  rowLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  rowValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1, textAlign: 'right', lineHeight: 19 },
  extra: { gap: 8, marginTop: 16 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
  photo: { width: '100%', height: 210, borderRadius: 8 },
});