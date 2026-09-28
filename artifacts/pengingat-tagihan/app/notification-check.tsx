import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useBills, ensureReminderPermission } from '@/contexts/BillsContext';
import { useNotes } from '@/contexts/NotesContext';
import { useColors } from '@/hooks/useColors';

function DeviceCheck() {
  const router = useRouter();
  const colors = useColors();
  const { bills } = useBills();
  const { debts, routines } = useNotes();
  const [status, setStatus] = useState('Ketuk salah satu rekaman untuk mengirim pengingat dalam 10 detik.');

  const entries = [
    ...bills.map((bill) => ({ label: `Tagihan: ${bill.title}`, data: { billId: bill.id } })),
    ...debts.map((debt) => ({ label: `${debt.direction === 'owe' ? 'Hutang' : 'Piutang'}: ${debt.person}`, data: { noteId: debt.id, kind: 'debt' } })),
    ...routines.map((routine) => ({ label: `Biaya rutin: ${routine.title}`, data: { noteId: routine.id, kind: 'routine' } })),
    { label: 'Tagihan yang sudah dihapus', data: { billId: '__notification_check_deleted__' } },
    { label: 'Catatan yang sudah dihapus', data: { noteId: '__notification_check_deleted__', kind: 'debt' } },
  ];

  const schedule = async (label: string, data: (typeof entries)[number]['data']) => {
    try {
      const permission = await ensureReminderPermission();
      if (!permission.granted) {
        setStatus('Izin notifikasi diperlukan. Aktifkan di pengaturan perangkat.');
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: { title: `Uji ketukan: ${label}`, body: 'Ketuk untuk membuka rekaman.', data },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10,
          ...(Platform.OS === 'android' ? { channelId: 'bill-reminders' } : {}),
        },
      });
      setStatus(`${label} dijadwalkan. Tunggu 10 detik, lalu ketuk notifikasinya.`);
    } catch (cause) {
      Alert.alert('Tidak bisa menjadwalkan notifikasi', String(cause));
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary }}>‹ Kembali</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Uji notifikasi perangkat</Text>
      <Text style={{ color: colors.foreground }}>{status}</Text>
      <Text style={{ color: colors.mutedForeground }}>
        Buat dulu satu tagihan, hutang, piutang, dan biaya rutin. Ulangi setiap pilihan saat aplikasi aktif,
        di latar belakang, dan setelah aplikasi ditutup dari pengalih aplikasi.
      </Text>
      {entries.map(({ label, data }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          onPress={() => { void schedule(label, data); }}
          style={[styles.button, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground }}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function NotificationCheckScreen() {
  if (!__DEV__ || Platform.OS === 'web') return <Redirect href="/" />;
  return <DeviceCheck />;
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700' },
  button: { padding: 16, borderWidth: 1, borderRadius: 12 },
});