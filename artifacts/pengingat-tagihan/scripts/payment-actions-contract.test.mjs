import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const billsContext = readFileSync(new URL('../contexts/BillsContext.tsx', import.meta.url), 'utf8');

test('unpaid tagihan has a visible, labelled payment button', () => {
  assert.match(source, /onPress=\{onMarkPaid\}[\s\S]*?<Text[^>]*>Sudah bayar<\/Text>[\s\S]*?<\/Pressable>/);
  assert.match(source, /accessibilityLabel=\{\x60Konfirmasi pembayaran \$\{bill.title\}\x60\}/);
});

test('paid tagihan has a visible undo action', () => {
  assert.match(source, /onPress=\{onUndoPaid\}[\s\S]*?<Text[^>]*>Batalkan<\/Text>[\s\S]*?<\/Pressable>/);
});

test('first-time users can add a bill on the default list', () => {
  assert.match(source, /useState<Filter>\('unpaid'\)/);
  assert.match(source, /bills.length === 0 && filter !== 'paid'/);
});

test('offline bill writes are serialized with reload and input date is validated', () => {
  assert.match(billsContext, /const reload = useCallback\(\(\) => enqueue\(async \(\) => \{/);
  assert.match(billsContext, /!isValidBillDate\(input.dueDate\)/);
  assert.match(billsContext, /reminderWarning = 'Tagihan disimpan tanpa notifikasi/);
});
