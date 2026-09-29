import type { Bill } from '@/contexts/BillsContext';

export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidBillDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function getNextMonthlyDueDate(value: string, originalDay: number): string {
  const [year, month] = value.split('-').map(Number);
  const lastDayOfNextMonth = new Date(year, month + 1, 0).getDate();
  return getLocalDateString(new Date(year, month, Math.min(originalDay, lastDayOfNextMonth)));
}

export function getNextWeeklyDueDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + 7);
  return getLocalDateString(next);
}

export function getNextExpenseDueDate(frequency: 'once' | 'weekly' | 'monthly', dueDate: string, anchorDay: number): string | null {
  if (frequency === 'once') return null;
  return frequency === 'weekly'
    ? getNextWeeklyDueDate(dueDate)
    : getNextMonthlyDueDate(dueDate, anchorDay);
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function normalizeRupiahInput(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 15);
}

export function formatRupiahInput(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getDaysUntilDue(value: string): number {
  const due = parseLocalDate(value);
  const today = parseLocalDate(getLocalDateString(new Date()));
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function formatDueLabel(value: string): string {
  const days = getDaysUntilDue(value);
  if (days < 0) return `Terlambat ${Math.abs(days)} hari`;
  if (days === 0) return 'Jatuh tempo hari ini';
  if (days === 1) return 'Jatuh tempo besok';
  return `Jatuh tempo ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(parseLocalDate(value))}`;
}

export function formatDateInput(value: string): string {
  if (!isValidBillDate(value)) return '';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseLocalDate(value));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseLocalDate(value));
}

export function sortBills(bills: Bill[]): Bill[] {
  return [...bills].sort((a, b) => {
    if (a.isPaid !== b.isPaid) return Number(a.isPaid) - Number(b.isPaid);
    if (a.isPaid) return (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate);
    return a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'id');
  });
}