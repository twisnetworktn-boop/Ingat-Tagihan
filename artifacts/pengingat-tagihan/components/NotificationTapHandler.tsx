import { useNavigationContainerRef, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useBills } from '@/contexts/BillsContext';
import { useNotes } from '@/contexts/NotesContext';
import { createNotificationTapController } from '@/lib/notification-tap';

export function NotificationTapHandler() {
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const { bills, loading: billsLoading, error: billsError } = useBills();
  const { debts, routines, loading: notesLoading, error: notesError } = useNotes();
  const [ready, setReady] = useState(() => navigationRef.isReady());
  const controller = useRef<ReturnType<typeof createNotificationTapController> | null>(null);
  if (!controller.current) controller.current = createNotificationTapController(Notifications);

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('ready', () => setReady(true));
    if (navigationRef.isReady()) setReady(true);
    return unsubscribe;
  }, [navigationRef]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const current = controller.current!;
    current.start();
    return () => current.stop();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    controller.current!.update({
      ready, billsLoading, notesLoading, bills, debts, routines, billsError, notesError,
      push: (route) => router.push(route),
      replace: (route) => router.replace(route),
      alert: (title, message) => Alert.alert(title, message),
    });
  }, [ready, billsLoading, notesLoading, bills, debts, routines, billsError, notesError, router]);

  return null;
}