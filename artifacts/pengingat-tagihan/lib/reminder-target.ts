type Identified = { id: string };

export type ReminderTarget = {
  kind: 'bill' | 'debt' | 'routine';
  id: string;
  exists: boolean;
};

export function resolveReminderTarget(
  data: unknown,
  bills: Identified[],
  debts: Identified[],
  routines: Identified[],
): ReminderTarget | null {
  if (!data || typeof data !== 'object') return null;
  if ('billId' in data && typeof data.billId === 'string' && data.billId.length > 0) {
    return { kind: 'bill', id: data.billId, exists: bills.some((item) => item.id === data.billId) };
  }
  if (!('noteId' in data) || typeof data.noteId !== 'string' || !data.noteId) return null;
  if (!('kind' in data)) return null;
  if (data.kind === 'debt') {
    return { kind: 'debt', id: data.noteId, exists: debts.some((item) => item.id === data.noteId) };
  }
  if (data.kind === 'routine') {
    return { kind: 'routine', id: data.noteId, exists: routines.some((item) => item.id === data.noteId) };
  }
  return null;
}