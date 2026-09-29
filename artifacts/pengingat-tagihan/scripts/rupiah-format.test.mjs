import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRupiah, formatRupiahInput, normalizeRupiahInput } from '../lib/bill-format.ts';

test('rupiah amounts use dots as thousands separators', () => {
  assert.equal(formatRupiah(1234567).replace(/\s/g, ' '), 'Rp 1.234.567');
  assert.equal(formatRupiahInput('1234567'), '1.234.567');
  assert.equal(formatRupiahInput('0'), '0');
  assert.equal(formatRupiahInput(''), '');
});

test('typing and pasting formatted rupiah keeps only the underlying digits', () => {
  assert.equal(normalizeRupiahInput('1.234.567'), '1234567');
  assert.equal(normalizeRupiahInput('Rp 001.234.567'), '1234567');
  assert.equal(normalizeRupiahInput('000'), '0');
  assert.equal(normalizeRupiahInput(''), '');
  assert.equal(normalizeRupiahInput('999.999.999.999.999'), '999999999999999');
  assert.equal(normalizeRupiahInput('123456789012345678'), '123456789012345');
});