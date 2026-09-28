import type * as Notifications from 'expo-notifications';
import { resolveReminderTarget } from './reminder-target.ts';

type Response = Notifications.NotificationResponse;
type Records = { id: string }[];

type Snapshot = {
  ready: boolean;
  billsLoading: boolean;
  notesLoading: boolean;
  bills: Records;
  debts: Records;
  routines: Records;
  billsError: string | null;
  notesError: string | null;
  push: (route: { pathname: '/bill-form'; params: { id: string } } | { pathname: '/catatan-form'; params: { type: 'debt' | 'routine'; id: string } }) => void;
  replace: (route: '/' | '/catatan') => void;
  alert: (title: string, message: string) => void;
};

type NotificationSource = {
  DEFAULT_ACTION_IDENTIFIER: string;
  addNotificationResponseReceivedListener: (listener: (response: Response) => void) => { remove: () => void };
  getLastNotificationResponse: () => Response | null;
  clearLastNotificationResponse: () => void;
};

export function createNotificationTapController(source: NotificationSource) {
  let snapshot: Snapshot | null = null;
  let pending: Response | null = null;
  let subscription: { remove: () => void } | null = null;

  function flush() {
    if (!pending || !snapshot || !snapshot.ready || snapshot.billsLoading || snapshot.notesLoading) return;
    const response = pending;
    pending = null;
    try {
      if (response.actionIdentifier !== source.DEFAULT_ACTION_IDENTIFIER) return;
      const target = resolveReminderTarget(
        response.notification.request.content.data,
        snapshot.bills,
        snapshot.debts,
        snapshot.routines,
      );
      if (!target) return;
      if (target.kind === 'bill') {
        if (snapshot.billsError || !target.exists) {
          snapshot.replace('/');
          snapshot.alert('Tagihan belum bisa dibuka', snapshot.billsError ?? 'Tagihan ini sudah tidak ada di daftar.');
        } else {
          snapshot.push({ pathname: '/bill-form', params: { id: target.id } });
        }
      } else if (snapshot.notesError || !target.exists) {
        snapshot.replace('/catatan');
        snapshot.alert('Catatan belum bisa dibuka', snapshot.notesError ?? 'Catatan ini sudah tidak ada di daftar.');
      } else {
        snapshot.push({ pathname: '/catatan-form', params: { type: target.kind, id: target.id } });
      }
    } catch (cause) {
      console.warn('Belum bisa membuka pengingat:', cause);
      snapshot.alert('Belum berhasil', 'Pengingat belum bisa dibuka. Coba buka daftar tagihan atau Catatan.');
    } finally {
      try {
        source.clearLastNotificationResponse();
      } catch (cause) {
        console.warn('Respons notifikasi belum bisa dibersihkan:', cause);
      }
    }
  }

  return {
    update(next: Snapshot) {
      snapshot = next;
      flush();
    },
    start() {
      subscription = source.addNotificationResponseReceivedListener((response) => {
        pending = response;
        flush();
      });
      try {
        const last = source.getLastNotificationResponse();
        if (last && !pending) {
          pending = last;
          flush();
        }
      } catch (cause) {
        console.warn('Respons notifikasi belum bisa dibaca:', cause);
      }
    },
    stop() {
      subscription?.remove();
      subscription = null;
      snapshot = null;
      pending = null;
    },
  };
}