import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = '@ingat-tagihan/bills/v1';
const ANDROID_CHANNEL_ID = 'bill-reminders';

export const BILL_CATEGORIES = [
  { id: 'electricity', label: 'Listrik', icon: 'zap' },
  { id: 'water', label: 'Air', icon: 'droplet' },
  { id: 'internet', label: 'Internet', icon: 'wifi' },
  { id: 'credit-card', label: 'Kartu kredit', icon: 'credit-card' },
  { id: 'housing', label: 'Rumah', icon: 'home' },
  { id: 'other', label: 'Lainnya', icon: 'more-horizontal' },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
}>;

export type BillCategory = (typeof BILL_CATEGORIES)[number]['id'];

export type Bill = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  category: BillCategory;
  note: string;
  isPaid: boolean;
  remind: boolean;
  notificationId?: string;
};

export type BillInput = Omit<Bill, 'id' | 'notificationId'> & { id?: string };

type BillsContextValue = {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveBill: (input: BillInput) => Promise<string>;
  deleteBill: (id: string) => Promise<void>;
  togglePaid: (id: string) => Promise<void>;
};

const BillsContext = createContext<BillsContextValue | null>(null);

type ScheduledReminder = {
  date: Date;
  isDueDay: boolean;
};

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getReminderDate(dueDate: string): ScheduledReminder | null {
  const due = parseLocalDate(dueDate);
  const now = new Date();
  let date = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1, 9, 0, 0, 0);
  let isDueDay = false;

  if (date.getTime() <= now.getTime()) {
    date = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0, 0, 0);
    isDueDay = true;
  }

  if (date.getTime() <= now.getTime()) return null;
  return { date, isDueDay };
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function scheduleBillReminder(bill: Bill): Promise<string | undefined> {
  if (!bill.remind || bill.isPaid || Platform.OS === 'web') return undefined;

  const permitted = await requestNotificationPermission();
  if (!permitted) {
    throw new Error('Izin notifikasi belum aktif. Aktifkan izin notifikasi lalu coba lagi.');
  }

  const reminder = getReminderDate(bill.dueDate);
  if (!reminder) return undefined;

  const amount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(bill.amount);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Pengingat: ${bill.title}`,
      body: reminder.isDueDay
        ? `Jatuh tempo hari ini · ${amount}`
        : `Jatuh tempo besok · ${amount}`,
      sound: true,
      data: { billId: bill.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.date,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });

  return notificationId;
}

async function cancelBillReminder(notificationId?: string): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export function BillsProvider({ children }: { children: ReactNode }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const billsRef = useRef<Bill[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const decoded: unknown = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(decoded)) throw new Error('Format data tagihan tidak dikenali.');
      billsRef.current = decoded as Bill[];
      setBills(billsRef.current);
    } catch {
      setError('Data tagihan belum bisa dibuka. Coba muat ulang aplikasi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Pengingat tagihan',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  }, [reload]);

  const persist = useCallback(async (next: Bill[]) => {
    const previous = billsRef.current;
    billsRef.current = next;
    setBills(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setError(null);
    } catch (cause) {
      billsRef.current = previous;
      setBills(previous);
      setError('Perubahan belum tersimpan. Pastikan ruang penyimpanan perangkat tersedia.');
      throw cause;
    }
  }, []);

  const saveBill = useCallback(async (input: BillInput) => {
    const previous = input.id ? billsRef.current.find((bill) => bill.id === input.id) : undefined;
    const id = input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const nextBill: Bill = { ...input, id, notificationId: undefined };
    let newNotificationId: string | undefined;

    try {
      newNotificationId = await scheduleBillReminder(nextBill);
      nextBill.notificationId = newNotificationId;
      const next = previous
        ? billsRef.current.map((bill) => (bill.id === id ? nextBill : bill))
        : [nextBill, ...billsRef.current];
      await persist(next);
    } catch (cause) {
      if (newNotificationId) await cancelBillReminder(newNotificationId).catch(() => undefined);
      throw cause;
    }

    if (previous?.notificationId) {
      await cancelBillReminder(previous.notificationId).catch(() => {
        setError('Tagihan tersimpan, tetapi pengingat sebelumnya belum berhasil dibatalkan.');
      });
    }

    return id;
  }, [persist]);

  const deleteBill = useCallback(async (id: string) => {
    const deleted = billsRef.current.find((bill) => bill.id === id);
    await persist(billsRef.current.filter((bill) => bill.id !== id));
    await cancelBillReminder(deleted?.notificationId);
  }, [persist]);

  const togglePaid = useCallback(async (id: string) => {
    const bill = billsRef.current.find((item) => item.id === id);
    if (!bill) return;

    const markAsPaid = !bill.isPaid;
    const updated: Bill = { ...bill, isPaid: markAsPaid, notificationId: undefined };
    if (!markAsPaid) {
      updated.notificationId = await scheduleBillReminder(updated);
    }

    try {
      await persist(billsRef.current.map((item) => (item.id === id ? updated : item)));
    } catch (cause) {
      if (updated.notificationId) await cancelBillReminder(updated.notificationId).catch(() => undefined);
      throw cause;
    }

    if (markAsPaid) await cancelBillReminder(bill.notificationId);
  }, [persist]);

  return (
    <BillsContext.Provider value={{ bills, loading, error, reload, saveBill, deleteBill, togglePaid }}>
      {children}
    </BillsContext.Provider>
  );
}

export function useBills() {
  const value = useContext(BillsContext);
  if (!value) throw new Error('useBills harus digunakan di dalam BillsProvider.');
  return value;
}