import { useNavigationContainerRef, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useBills } from '@/contexts/BillsContext';
import { useNotes } from '@/contexts/NotesContext';
import { resolveReminderTarget } from '@/lib/reminder-target';

export function NotificationTapHandler() {
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const { bills, loading: billsLoading, error: billsError } = useBills();
  const { debts, routines, loading: notesLoading, error: notesError } = useNotes();
  const [ready, setReady] = useState(() => navigationRef.isReady());
  const [response, setResponse] = useState<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('ready', () => setReady(true));
    if (navigationRef.isReady()) setReady(true);
    return unsubscribe;
  }, [navigationRef]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener(setResponse);
    try {
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) setResponse((current) => current ?? lastResponse);
    } catch (cause) {
      console.warn('Respons notifikasi belum bisa dibaca:', cause);
    }
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!response || !ready || billsLoading || notesLoading) return;
    setResponse(null);
    try {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const target = resolveReminderTarget(
        response.notification.request.content.data,
        bills,
        debts,
        routines,
      );
      if (!target) return;

      if (target.kind === 'bill') {
        if (billsError || !target.exists) {
          router.replace('/');
          Alert.alert('Tagihan belum bisa dibuka', billsError ?? 'Tagihan ini sudah tidak ada di daftar.');
        } else {
          router.push({ pathname: '/bill-form', params: { id: target.id } });
        }
      } else if (notesError || !target.exists) {
        router.replace('/catatan');
        Alert.alert('Catatan belum bisa dibuka', notesError ?? 'Catatan ini sudah tidak ada di daftar.');
      } else {
        router.push({ pathname: '/catatan-form', params: { type: target.kind, id: target.id } });
      }
    } catch (cause) {
      console.warn('Belum bisa membuka pengingat:', cause);
      Alert.alert('Belum berhasil', 'Pengingat belum bisa dibuka. Coba buka daftar tagihan atau Catatan.');
    } finally {
      try {
        Notifications.clearLastNotificationResponse();
      } catch (cause) {
        console.warn('Respons notifikasi belum bisa dibersihkan:', cause);
      }
    }
  }, [response, ready, billsLoading, notesLoading, bills, debts, routines, billsError, notesError, router]);

  return null;
}