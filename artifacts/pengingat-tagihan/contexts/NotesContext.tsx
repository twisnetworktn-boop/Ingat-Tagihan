import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { ensureReminderPermission, type BillCategory } from '@/contexts/BillsContext';
import { formatRupiah, getNextExpenseDueDate, isValidBillDate } from '@/lib/bill-format';
import { removeStoredPhoto, storePhoto, type PhotoDraft } from '@/lib/photo-attachments';

const STORAGE_KEY = '@ingat-tagihan/notes/v1';
const ANDROID_CHANNEL_ID = 'bill-reminders';

export type Debt = {
  id: string;
  direction: 'owe' | 'owed';
  person: string;
  amount: number;
  dueDate: string;
  note: string;
  photoUri?: string;
  remind: boolean;
  notificationId?: string;
};

export type Deposit = {
  id: string;
  debtId: string;
  amount: number;
  date: string;
  note: string;
};

export type Routine = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  frequency: 'once' | 'weekly' | 'monthly';
  anchorDay: number;
  remind: boolean;
  note: string;
  category?: BillCategory;
  notificationId?: string;
};

export type RoutinePayment = {
  id: string;
  routineId: string;
  title: string;
  amount: number;
  dueDate: string;
  paidAt: string;
  category?: BillCategory;
  note?: string;
  frequency?: Routine['frequency'];
  anchorDay?: number;
  remind?: boolean;
  receiptUri?: string;
};

type DebtInput = Omit<Debt, 'id' | 'notificationId' | 'photoUri'> & { id?: string; photo?: PhotoDraft | null };
type DepositInput = Omit<Deposit, 'id'> & { id?: string };
type RoutineInput = Omit<Routine, 'id' | 'anchorDay' | 'notificationId' | 'category'> & { id?: string; category: BillCategory };
type NotesData = {
  debts: Debt[];
  deposits: Deposit[];
  routines: Routine[];
  routinePayments: RoutinePayment[];
};
type NotesContextValue = NotesData & {
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveDebt: (input: DebtInput) => Promise<string>;
  deleteDebt: (id: string) => Promise<void>;
  saveDeposit: (input: DepositInput) => Promise<string>;
  deleteDeposit: (id: string) => Promise<void>;
  saveRoutine: (input: RoutineInput) => Promise<string>;
  deleteRoutine: (id: string) => Promise<void>;
  payRoutine: (id: string, receipt?: PhotoDraft) => Promise<void>;
  undoRoutinePayment: (paymentId: string) => Promise<void>;
};

const EMPTY_DATA: NotesData = { debts: [], deposits: [], routines: [], routinePayments: [] };
const NotesContext = createContext<NotesContextValue | null>(null);

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function totalDeposited(debtId: string, deposits: Deposit[]): number {
  return deposits.filter((entry) => entry.debtId === debtId).reduce((sum, entry) => sum + entry.amount, 0);
}

function reminderDate(dueDate: string): Date | null {
  const [year, month, day] = dueDate.split('-').map(Number);
  const now = new Date();
  let date = new Date(year, month - 1, day - 1, 9);
  if (date <= now) date = new Date(year, month - 1, day, 9);
  return date > now ? date : null;
}

async function scheduleReminder(
  kind: 'debt' | 'routine',
  item: Debt | Routine,
): Promise<string | undefined> {
  if (!item.remind || Platform.OS === 'web') return undefined;
  const date = reminderDate(item.dueDate);
  if (!date) return undefined;
  const permission = await ensureReminderPermission();
  if (!permission.granted) throw new Error('Izin notifikasi belum aktif.');
  const title = kind === 'debt'
    ? (item as Debt).direction === 'owe' ? 'Hutang perlu dibayar' : 'Piutang perlu ditagih'
    : (item as Routine).frequency === 'once' ? 'Pengeluaran perlu dibayar' : 'Biaya rutin perlu dibayar';
  const detail = kind === 'debt' ? (item as Debt).person : (item as Routine).title;
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: `${detail} · ${formatRupiah(item.amount)} · jatuh tempo ${item.dueDate}`,
      sound: true,
      data: { noteId: item.id, kind },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });
}

async function cancelReminder(id?: string): Promise<void> {
  if (id && Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(id);
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<NotesData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<NotesData>(EMPTY_DATA);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(operation);
    queue.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const persist = useCallback(async (next: NotesData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      dataRef.current = next;
      setData(next);
      setError(null);
    } catch (cause) {
      setError('Perubahan catatan belum tersimpan. Periksa ruang penyimpanan perangkat.');
      throw cause;
    }
  }, []);

  const reload = useCallback(() => enqueue(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const decoded: unknown = raw ? JSON.parse(raw) : EMPTY_DATA;
      if (
        !decoded || typeof decoded !== 'object' ||
        !('debts' in decoded) || !Array.isArray(decoded.debts) ||
        !('deposits' in decoded) || !Array.isArray(decoded.deposits) ||
        !('routines' in decoded) || !Array.isArray(decoded.routines) ||
        !('routinePayments' in decoded) || !Array.isArray(decoded.routinePayments)
      ) throw new Error('Format catatan tidak dikenali.');
      const next = decoded as NotesData;
      dataRef.current = next;
      setData(next);
      setError(null);
    } catch {
      setError('Catatan belum bisa dibuka. Coba muat ulang.');
    } finally {
      setLoading(false);
    }
  }), [enqueue]);

  useEffect(() => { void reload(); }, [reload]);

  const saveDebt = useCallback((input: DebtInput) => enqueue(async () => {
    if (!input.person.trim() || !Number.isFinite(input.amount) || input.amount <= 0 || !isValidBillDate(input.dueDate)) {
      throw new Error('Isi nama, nominal, dan tanggal jatuh tempo yang valid.');
    }
    const current = dataRef.current;
    const previous = input.id ? current.debts.find((debt) => debt.id === input.id) : undefined;
    if (input.id && !previous) throw new Error('Catatan hutang tidak ditemukan.');
    const id = input.id ?? createId();
    if (input.amount < totalDeposited(id, current.deposits)) {
      throw new Error('Nominal hutang tidak boleh lebih kecil dari total setoran.');
    }
    const { photo, ...fields } = input;
    const storedPhoto = photo ? await storePhoto(photo) : undefined;
    const debt: Debt = {
      ...fields, id, person: input.person.trim(),
      photoUri: photo === undefined ? previous?.photoUri : storedPhoto,
      notificationId: undefined,
    };
    let warning: string | null = null;
    if (totalDeposited(id, current.deposits) < debt.amount) {
      try { debt.notificationId = await scheduleReminder('debt', debt); }
      catch { warning = 'Catatan tersimpan, tetapi pengingat belum bisa dijadwalkan. Periksa izin notifikasi.'; }
    }
    try {
      await persist({
        ...current,
        debts: previous ? current.debts.map((item) => item.id === id ? debt : item) : [debt, ...current.debts],
      });
    } catch (cause) {
      await cancelReminder(debt.notificationId).catch(() => undefined);
      removeStoredPhoto(storedPhoto);
      throw cause;
    }
    if (previous?.photoUri && previous.photoUri !== debt.photoUri) {
      try { removeStoredPhoto(previous.photoUri); }
      catch { warning = 'Catatan tersimpan, tetapi foto lama belum bisa dibersihkan.'; }
    }
    if (previous?.notificationId) {
      await cancelReminder(previous.notificationId).catch(() => {
        warning = 'Catatan tersimpan, tetapi pengingat lama belum bisa dibatalkan.';
      });
    }
    if (warning) setError(warning);
    return id;
  }), [enqueue, persist]);

  const deleteDebt = useCallback((id: string) => enqueue(async () => {
    const current = dataRef.current;
    const debt = current.debts.find((item) => item.id === id);
    if (!debt) return;
    await persist({
      ...current,
      debts: current.debts.filter((item) => item.id !== id),
      deposits: current.deposits.filter((item) => item.debtId !== id),
    });
    try { removeStoredPhoto(debt.photoUri); }
    catch { setError('Catatan dihapus, tetapi foto lama belum bisa dibersihkan.'); }
    await cancelReminder(debt.notificationId).catch(() => setError('Catatan dihapus, tetapi pengingat lama belum bisa dibatalkan.'));
  }), [enqueue, persist]);

  const saveDeposit = useCallback((input: DepositInput) => enqueue(async () => {
    const current = dataRef.current;
    const debt = current.debts.find((item) => item.id === input.debtId);
    if (!debt) throw new Error('Pilih hutang yang masih tersimpan.');
    if (!isValidBillDate(input.date) || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Isi jumlah setoran dan tanggal yang valid.');
    }
    const previous = input.id ? current.deposits.find((item) => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error('Setoran tidak ditemukan.');
    if (previous && previous.debtId !== input.debtId) throw new Error('Hutang untuk setoran ini tidak bisa diubah.');
    const id = input.id ?? createId();
    const deposit: Deposit = { ...input, id };
    const deposits = previous
      ? current.deposits.map((item) => item.id === id ? deposit : item)
      : [deposit, ...current.deposits];
    const total = totalDeposited(debt.id, deposits);
    if (total > debt.amount) throw new Error('Setoran melebihi sisa hutang.');
    let newReminderId: string | undefined;
    let warning: string | null = null;
    if (total < debt.amount && debt.remind && !debt.notificationId) {
      try { newReminderId = await scheduleReminder('debt', debt); }
      catch { warning = 'Setoran tersimpan, tetapi pengingat hutang belum bisa dijadwalkan.'; }
    }
    try {
      await persist({
        ...current,
        deposits,
        debts: current.debts.map((item) => item.id === debt.id
          ? { ...item, notificationId: total >= debt.amount ? undefined : newReminderId ?? debt.notificationId }
          : item),
      });
    } catch (cause) {
      await cancelReminder(newReminderId).catch(() => undefined);
      throw cause;
    }
    if (total >= debt.amount && debt.notificationId) {
      await cancelReminder(debt.notificationId).catch(() => {
        warning = 'Hutang lunas, tetapi pengingat lama belum bisa dibatalkan.';
      });
    }
    if (warning) setError(warning);
    return id;
  }), [enqueue, persist]);

  const deleteDeposit = useCallback((id: string) => enqueue(async () => {
    const current = dataRef.current;
    const deposit = current.deposits.find((item) => item.id === id);
    if (!deposit) return;
    const debt = current.debts.find((item) => item.id === deposit.debtId);
    const deposits = current.deposits.filter((item) => item.id !== id);
    let notificationId: string | undefined;
    let warning: string | null = null;
    if (debt && debt.remind && !debt.notificationId && totalDeposited(debt.id, deposits) < debt.amount) {
      try { notificationId = await scheduleReminder('debt', debt); }
      catch { warning = 'Setoran dihapus, tetapi pengingat hutang belum bisa dijadwalkan.'; }
    }
    try {
      await persist({
        ...current,
        deposits,
        debts: current.debts.map((item) => item.id === debt?.id ? { ...item, notificationId: notificationId ?? item.notificationId } : item),
      });
    } catch (cause) {
      await cancelReminder(notificationId).catch(() => undefined);
      throw cause;
    }
    if (warning) setError(warning);
  }), [enqueue, persist]);

  const saveRoutine = useCallback((input: RoutineInput) => enqueue(async () => {
    if (!input.title.trim() || !Number.isFinite(input.amount) || input.amount <= 0 || !isValidBillDate(input.dueDate)) {
      throw new Error('Isi nama biaya, nominal, dan tanggal jatuh tempo yang valid.');
    }
    const current = dataRef.current;
    const previous = input.id ? current.routines.find((item) => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error('Biaya rutin tidak ditemukan.');
    const id = input.id ?? createId();
    const routine: Routine = {
      ...input,
      id,
      title: input.title.trim(),
      anchorDay: previous?.dueDate === input.dueDate ? previous.anchorDay : Number(input.dueDate.slice(-2)),
      notificationId: undefined,
    };
    let warning: string | null = null;
    try { routine.notificationId = await scheduleReminder('routine', routine); }
    catch { warning = 'Biaya tersimpan, tetapi pengingat belum bisa dijadwalkan. Periksa izin notifikasi.'; }
    try {
      await persist({
        ...current,
        routines: previous ? current.routines.map((item) => item.id === id ? routine : item) : [routine, ...current.routines],
      });
    } catch (cause) {
      await cancelReminder(routine.notificationId).catch(() => undefined);
      throw cause;
    }
    if (previous?.notificationId) {
      await cancelReminder(previous.notificationId).catch(() => {
        warning = 'Biaya tersimpan, tetapi pengingat lama belum bisa dibatalkan.';
      });
    }
    if (warning) setError(warning);
    return id;
  }), [enqueue, persist]);

  const deleteRoutine = useCallback((id: string) => enqueue(async () => {
    const current = dataRef.current;
    const routine = current.routines.find((item) => item.id === id);
    if (!routine) return;
    await persist({ ...current, routines: current.routines.filter((item) => item.id !== id) });
    await cancelReminder(routine.notificationId).catch(() => setError('Biaya dihapus, tetapi pengingat lama belum bisa dibatalkan.'));
  }), [enqueue, persist]);

  const payRoutine = useCallback((id: string, receipt?: PhotoDraft) => enqueue(async () => {
    const current = dataRef.current;
    const routine = current.routines.find((item) => item.id === id);
    if (!routine) throw new Error('Pengeluaran tidak ditemukan.');
    const receiptUri = receipt ? await storePhoto(receipt) : undefined;
    const payment: RoutinePayment = {
      id: createId(),
      routineId: id,
      title: routine.title,
      amount: routine.amount,
      dueDate: routine.dueDate,
      paidAt: new Date().toISOString(),
      category: routine.category ?? 'other',
      note: routine.note,
      frequency: routine.frequency,
      anchorDay: routine.anchorDay,
      remind: routine.remind,
      receiptUri,
    };
    const nextDueDate = getNextExpenseDueDate(routine.frequency, routine.dueDate, routine.anchorDay);
    const nextRoutine: Routine | null = nextDueDate
      ? { ...routine, dueDate: nextDueDate, notificationId: undefined }
      : null;
    let warning: string | null = null;
    if (nextRoutine) {
      try { nextRoutine.notificationId = await scheduleReminder('routine', nextRoutine); }
      catch { warning = 'Pembayaran tersimpan, tetapi pengingat berikutnya belum bisa dijadwalkan.'; }
    }
    try {
      await persist({
        ...current,
        routines: nextRoutine
          ? current.routines.map((item) => item.id === id ? nextRoutine : item)
          : current.routines.filter((item) => item.id !== id),
        routinePayments: [payment, ...current.routinePayments],
      });
    } catch (cause) {
      await cancelReminder(nextRoutine?.notificationId).catch(() => undefined);
      removeStoredPhoto(receiptUri);
      throw cause;
    }
    if (routine.notificationId) {
      await cancelReminder(routine.notificationId).catch(() => {
        warning = 'Pembayaran tersimpan, tetapi pengingat lama belum bisa dibatalkan.';
      });
    }
    if (warning) setError(warning);
  }), [enqueue, persist]);

  const undoRoutinePayment = useCallback((paymentId: string) => enqueue(async () => {
    const current = dataRef.current;
    const payment = current.routinePayments.find((item) => item.id === paymentId);
    if (!payment) return;

    const newerPayment = current.routinePayments.some((item) =>
      item.id !== payment.id &&
      item.routineId === payment.routineId &&
      item.paidAt > payment.paidAt
    );
    if (newerPayment) {
      throw new Error('Pembayaran ini bukan pembayaran terbaru. Batalkan pembayaran paling baru terlebih dahulu.');
    }

    const frequency = payment.frequency ?? 'once';
    const anchorDay = payment.anchorDay ?? Number(payment.dueDate.slice(-2));
    const active = current.routines.find((item) => item.id === payment.routineId);
    const expectedNext = getNextExpenseDueDate(frequency, payment.dueDate, anchorDay);

    if (active && expectedNext && active.dueDate !== expectedNext) {
      throw new Error('Pengeluaran periode berikutnya sudah diubah. Pembayaran ini tidak dapat dibatalkan otomatis.');
    }
    if (active && !expectedNext) {
      throw new Error('Data pengeluaran sekali bayar tidak konsisten. Muat ulang sebelum melakukan koreksi.');
    }

    const restored: Routine = {
      id: payment.routineId,
      title: payment.title,
      amount: payment.amount,
      dueDate: payment.dueDate,
      frequency,
      anchorDay,
      remind: payment.remind ?? false,
      note: payment.note ?? '',
      category: payment.category ?? 'other',
      notificationId: undefined,
    };

    try {
      restored.notificationId = await scheduleReminder('routine', restored);
      await persist({
        ...current,
        routines: active
          ? current.routines.map((item) => item.id === active.id ? restored : item)
          : [restored, ...current.routines],
        routinePayments: current.routinePayments.filter((item) => item.id !== payment.id),
      });
    } catch (cause) {
      await cancelReminder(restored.notificationId).catch(() => undefined);
      throw cause;
    }

    if (active?.notificationId) {
      await cancelReminder(active.notificationId).catch(() => {
        setError('Pembayaran dibatalkan, tetapi pengingat periode berikutnya belum berhasil dibersihkan.');
      });
    }
    try {
      removeStoredPhoto(payment.receiptUri);
    } catch {
      setError('Pembayaran dibatalkan, tetapi foto nota lama belum bisa dibersihkan.');
    }
  }), [enqueue, persist]);

  return (
    <NotesContext.Provider value={{
      ...data, loading, error, reload, saveDebt, deleteDebt,
      saveDeposit, deleteDeposit, saveRoutine, deleteRoutine, payRoutine, undoRoutinePayment,
    }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes(): NotesContextValue {
  const value = useContext(NotesContext);
  if (!value) throw new Error('useNotes harus digunakan di dalam NotesProvider.');
  return value;
}