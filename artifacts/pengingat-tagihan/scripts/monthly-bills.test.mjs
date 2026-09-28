import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextMonthlyDueDate, getNextWeeklyDueDate } from '../lib/bill-format.ts';

test('a monthly bill keeps its original due day after a short month', () => {
  assert.equal(getNextMonthlyDueDate('2025-01-31', 31), '2025-02-28');
  assert.equal(getNextMonthlyDueDate('2025-02-28', 31), '2025-03-31');
});

test('monthly bills handle leap years and year changes', () => {
  assert.equal(getNextMonthlyDueDate('2024-01-31', 31), '2024-02-29');
  assert.equal(getNextMonthlyDueDate('2026-12-30', 30), '2027-01-30');
});

test('weekly expenses stay seven calendar days apart across months', () => {
  assert.equal(getNextWeeklyDueDate('2026-12-29'), '2027-01-05');
  assert.equal(getNextWeeklyDueDate('2024-02-26'), '2024-03-04');
});