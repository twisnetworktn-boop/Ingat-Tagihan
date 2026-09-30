import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { formatRupiah, getNextMonthlyDueDate } from '@/lib/bill-format';

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
  repeat?: 'monthly' | 'once';
  notificationId?: string;
  seriesId?: string;
  recurrenceDay?: number;
  paidAt?: string;
};

export type BillInput = Pick<Bill, 'title' | 'amount' | 'dueDate' | 'category' | 'note' | 'remind'> & {
  id?: string;
  repeat?: Bill['repeat'];
};

type BillsContextValue = {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveBill: (input: BillInput) => Promise<string>;
  deleteBill: (id: string) => Promise<void>;
  markPaid: (id: string) => Promise<void>;
  undoPaid: (id: string) => Promise<void>;
};

const BillsContext = createContext<BillsContextValue | null>(null);

function createBillId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

export async function ensureReminderPermission(): Promise<Notifications.NotificationPermissionsStatus> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Pengingat tagihan',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return current;

  return Notifications.requestPermissionsAsync();
}

async function scheduleBillReminder(bill: Bill): Promise<string | undefined> {
  if (!bill.remind || bill.isPaid || Platform.OS === 'web') return undefined;

  const permission = await ensureReminderPermission();
  if (!permission.granted) {
    throw new Error('Izin notifikasi belum aktif. Aktifkan izin notifikasi lalu coba lagi.');
  }

  const reminder = getReminderDate(bill.dueDate);
  if (!reminder) return undefined;

  const amount = formatRupiah(bill.amount);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Pengingat: ${bill.title}`,
      body: reminder.isDueDay
        ? `${bill.note} · jatuh tempo hari ini · ${amount}`
        : `${bill.note} · jatuh tempo besok · ${amount}`,
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
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.current.then(operation);
    mutationQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

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

  const saveBill = useCallback((input: BillInput) => enqueue(async () => {
    if (!input.title.trim() || !input.note.trim() || !Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new Error('Isi nama orang, pasal tagihan, dan nominal yang valid.');
    }
    const previous = input.id ? billsRef.current.find((bill) => bill.id === input.id) : undefined;
    if (input.id && !previous) throw new Error('Tagihan tidak ditemukan. Buka ulang daftar tagihan.');
    if (previous?.isPaid) throw new Error('Tagihan lunas tersimpan sebagai riwayat dan tidak dapat diubah.');
    const id = input.id ?? createBillId();
    const nextBill: Bill = {
      ...input,
      title: input.title.trim(),
      note: input.note.trim(),
      id,
      repeat: input.repeat ?? previous?.repeat ?? 'monthly',
      isPaid: previous?.isPaid ?? false,
      paidAt: previous?.paidAt,
      seriesId: previous?.seriesId ?? id,
      recurrenceDay: previous?.dueDate === input.dueDate
        ? previous?.recurrenceDay ?? Number(input.dueDate.slice(-2))
        : Number(input.dueDate.slice(-2)),
      notificationId: undefined,
    };
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
  }), [enqueue, persist]);

  const deleteBill = useCallback((id: string) => enqueue(async () => {
    const deleted = billsRef.current.find((bill) => bill.id === id);
    if (!deleted) return;
    await persist(billsRef.current.filter((bill) => bill.id !== id));
    await cancelBillReminder(deleted.notificationId).catch(() => {
      setError('Tagihan dihapus, tetapi pengingatnya belum berhasil dibatalkan.');
    });
  }), [enqueue, persist]);

  const markPaid = useCallback((id: string) => enqueue(async () => {
    const bill = billsRef.current.find((item) => item.id === id);
    if (!bill) return;
    if (bill.isPaid) return;

    const recurrenceDay = bill.recurrenceDay ?? Number(bill.dueDate.slice(-2));
    const paid: Bill = {
      ...bill,
      isPaid: true,
      paidAt: new Date().toISOString(),
      notificationId: undefined,
      seriesId: bill.seriesId ?? bill.id,
      recurrenceDay,
    };
    const nextBill: Bill | undefined = bill.repeat === 'once' ? undefined : {
      ...bill,
      id: createBillId(),
      dueDate: getNextMonthlyDueDate(bill.dueDate, recurrenceDay),
      isPaid: false,
      paidAt: undefined,
      notificationId: undefined,
      seriesId: paid.seriesId,
      recurrenceDay,
    };
    let reminderWarning: string | null = null;
    if (nextBill) {
      try {
        nextBill.notificationId = await scheduleBillReminder(nextBill);
      } catch {
        reminderWarning = 'Pembayaran tersimpan, tetapi pengingat tagihan berikutnya belum bisa dijadwalkan. Periksa izin notifikasi.';
      }
    }

    try {
      await persist([
        ...(nextBill ? [nextBill] : []),
        ...billsRef.current.map((item) => (item.id === id ? paid : item)),
      ]);
    } catch (cause) {
      if (nextBill?.notificationId) await cancelBillReminder(nextBill.notificationId).catch(() => undefined);
      throw cause;
    }

    if (bill.notificationId) {
      await cancelBillReminder(bill.notificationId).catch(() => {
        reminderWarning = 'Pembayaran tersimpan, tetapi pengingat lama belum bisa dibatalkan.';
      });
    }
    if (reminderWarning) setError(reminderWarning);
  }), [enqueue, persist]);

  const undoPaid = useCallback((id: string) => enqueue(async () => {
    const bill = billsRef.current.find((item) => item.id === id);
    if (!bill || !bill.isPaid) return;

    const seriesId = bill.seriesId ?? bill.id;
    const paidAt = bill.paidAt ?? '';
    const newerPaid = billsRef.current.some((item) =>
      item.id !== bill.id &&
      (item.seriesId ?? item.id) === seriesId &&
      item.isPaid &&
      (item.paidAt ?? '') > paidAt
    );
    if (newerPaid) {
      throw new Error('Pembayaran ini bukan pembayaran terbaru. Batalkan pembayaran paling baru terlebih dahulu.');
    }

    const recurrenceDay = bill.recurrenceDay ?? Number(bill.dueDate.slice(-2));
    let successor: Bill | undefined;
    if ((bill.repeat ?? 'monthly') !== 'once') {
      const expectedDueDate = getNextMonthlyDueDate(bill.dueDate, recurrenceDay);
      const activeSeries = billsRef.current.filter((item) =>
        !item.isPaid && (item.seriesId ?? item.id) === seriesId
      );
      if (activeSeries.length > 1) {
        throw new Error('Rangkaian tagihan memiliki lebih dari satu tagihan aktif. Koreksi data terlebih dahulu.');
      }
      if (activeSeries.length === 1) {
        const candidate = activeSeries[0];
        const unchanged =
          candidate.dueDate === expectedDueDate &&
          candidate.title === bill.title &&
          candidate.amount === bill.amount &&
          candidate.note === bill.note &&
          candidate.category === bill.category &&
          candidate.repeat === bill.repeat &&
          candidate.remind === bill.remind &&
          candidate.recurrenceDay === recurrenceDay;
        if (!unchanged) {
          throw new Error('Tagihan periode berikutnya sudah diubah. Pembayaran ini tidak dapat dibatalkan otomatis.');
        }
        successor = candidate;
      }
    }

    const restored: Bill = {
      ...bill,
      isPaid: false,
      paidAt: undefined,
      notificationId: undefined,
      seriesId,
      recurrenceDay,
    };

    try {
      restored.notificationId = await scheduleBillReminder(restored);
      await persist(
        billsRef.current
          .filter((item) => item.id !== successor?.id)
          .map((item) => item.id === bill.id ? restored : item),
      );
    } catch (cause) {
      if (restored.notificationId) {
        await cancelBillReminder(restored.notificationId).catch(() => undefined);
      }
      throw cause;
    }

    if (successor?.notificationId) {
      await cancelBillReminder(successor.notificationId).catch(() => {
        setError('Pembayaran dibatalkan, tetapi pengingat periode berikutnya belum berhasil dibersihkan.');
      });
    }
  }), [enqueue, persist]);

  return (
    <BillsContext.Provider value={{ bills, loading, error, reload, saveBill, deleteBill, markPaid, undoPaid }}>
      {children}
    </BillsContext.Provider>
  );
}

export function useBills() {
  const value = useContext(BillsContext);
  if (!value) throw new Error('useBills harus digunakan di dalam BillsProvider.');
  return value;
}