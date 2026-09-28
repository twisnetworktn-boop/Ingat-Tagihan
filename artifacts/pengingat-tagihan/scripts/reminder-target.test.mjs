import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveReminderTarget } from '../lib/reminder-target.ts';

const bills = [{ id: 'tagihan-1' }];
const debts = [{ id: 'hutang-1' }];
const routines = [{ id: 'rutin-1' }];

test('opens the exact bill carried by a one-time or monthly reminder', () => {
  assert.deepEqual(resolveReminderTarget({ billId: 'tagihan-1' }, bills, debts, routines), {
    kind: 'bill', id: 'tagihan-1', exists: true,
  });
});

test('opens the debt or routine record carried by a notes reminder', () => {
  assert.deepEqual(resolveReminderTarget({ noteId: 'hutang-1', kind: 'debt' }, bills, debts, routines), {
    kind: 'debt', id: 'hutang-1', exists: true,
  });
  assert.deepEqual(resolveReminderTarget({ noteId: 'rutin-1', kind: 'routine' }, bills, debts, routines), {
    kind: 'routine', id: 'rutin-1', exists: true,
  });
});

test('recognizes deleted records and rejects unrelated or malformed notifications', () => {
  assert.deepEqual(resolveReminderTarget({ billId: 'deleted' }, bills, debts, routines), {
    kind: 'bill', id: 'deleted', exists: false,
  });
  assert.deepEqual(resolveReminderTarget({ noteId: 'deleted', kind: 'debt' }, bills, debts, routines), {
    kind: 'debt', id: 'deleted', exists: false,
  });
  assert.equal(resolveReminderTarget({ noteId: 'rutin-1', kind: 'other' }, bills, debts, routines), null);
  assert.equal(resolveReminderTarget({ billId: 123 }, bills, debts, routines), null);
  assert.equal(resolveReminderTarget(null, bills, debts, routines), null);
});