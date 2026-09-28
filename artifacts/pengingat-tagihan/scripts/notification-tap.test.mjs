import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationTapController } from '../lib/notification-tap.ts';

const records = {
  bills: [{ id: 'tagihan-1' }],
  debts: [{ id: 'hutang-1' }, { id: 'piutang-1' }],
  routines: [{ id: 'rutin-1' }],
};

const cases = [
  { name: 'tagihan', data: { billId: 'tagihan-1' }, route: { pathname: '/bill-form', params: { id: 'tagihan-1' } }, list: '/' },
  { name: 'hutang', data: { noteId: 'hutang-1', kind: 'debt' }, route: { pathname: '/catatan-form', params: { type: 'debt', id: 'hutang-1' } }, list: '/catatan' },
  { name: 'piutang', data: { noteId: 'piutang-1', kind: 'debt' }, route: { pathname: '/catatan-form', params: { type: 'debt', id: 'piutang-1' } }, list: '/catatan' },
  { name: 'biaya rutin', data: { noteId: 'rutin-1', kind: 'routine' }, route: { pathname: '/catatan-form', params: { type: 'routine', id: 'rutin-1' } }, list: '/catatan' },
];

function response(data, actionIdentifier = 'default') {
  return { actionIdentifier, notification: { request: { content: { data } } } };
}

function harness(last = null) {
  const calls = [];
  let listener;
  const source = {
    DEFAULT_ACTION_IDENTIFIER: 'default',
    addNotificationResponseReceivedListener(callback) {
      listener = callback;
      calls.push(['listen']);
      return { remove() { listener = undefined; calls.push(['remove']); } };
    },
    getLastNotificationResponse() { calls.push(['getLast']); return last; },
    clearLastNotificationResponse() { calls.push(['clear']); last = null; },
  };
  const controller = createNotificationTapController(source);
  const snapshot = {
    ready: true, billsLoading: false, notesLoading: false,
    billsError: null, notesError: null, ...records,
    push(route) { calls.push(['push', route]); },
    replace(route) { calls.push(['replace', route]); },
    alert(title, message) { calls.push(['alert', title, message]); },
  };
  return {
    calls, controller, snapshot,
    emit(value) { assert.ok(listener, 'native response listener is registered'); listener(value); },
    navigation() { return calls.filter(([name]) => ['push', 'replace', 'alert'].includes(name)); },
  };
}

for (const platform of ['Android', 'iOS']) {
  for (const item of cases) {
    test(`${platform}: ${item.name} opens the matching record from foreground response`, () => {
      const h = harness();
      h.controller.start();
      h.controller.update(h.snapshot);
      h.emit(response(item.data));
      assert.deepEqual(h.navigation(), [['push', item.route]]);
      assert.equal(h.calls.filter(([name]) => name === 'clear').length, 1);
      h.controller.stop();
      assert.ok(h.calls.some(([name]) => name === 'remove'));
    });

    test(`${platform}: ${item.name} waits for data/navigation when opened from background`, () => {
      const h = harness();
      h.controller.start();
      h.controller.update({ ...h.snapshot, ready: false, billsLoading: true, notesLoading: true });
      h.emit(response(item.data));
      h.controller.update({ ...h.snapshot, ready: true, billsLoading: false, notesLoading: true });
      assert.deepEqual(h.navigation(), []);
      h.controller.update(h.snapshot);
      assert.deepEqual(h.navigation(), [['push', item.route]]);
      h.controller.update(h.snapshot);
      assert.equal(h.navigation().length, 1, 'one tap must not open the form twice');
      h.controller.stop();
    });

    test(`${platform}: ${item.name} opens from terminated-app initial native response`, () => {
      const h = harness(response(item.data));
      h.controller.start();
      h.controller.update({ ...h.snapshot, ready: false, billsLoading: true });
      assert.deepEqual(h.navigation(), []);
      h.controller.update(h.snapshot);
      assert.deepEqual(h.navigation(), [['push', item.route]]);
      assert.equal(h.calls.filter(([name]) => name === 'clear').length, 1);
      h.controller.stop();
    });

    test(`${platform}: old ${item.name} reminder opens list rather than an empty form`, () => {
      const deleted = { ...item.data, ...(item.data.billId ? { billId: 'deleted' } : { noteId: 'deleted' }) };
      const h = harness(response(deleted));
      h.controller.start();
      h.controller.update(h.snapshot);
      assert.deepEqual(h.navigation().map(([name, value]) => [name, value]).slice(0, 1), [['replace', item.list]]);
      assert.equal(h.navigation().some(([name]) => name === 'push'), false);
      assert.equal(h.navigation().filter(([name]) => name === 'alert').length, 1);
      h.controller.stop();
    });
  }
}

test('ignores unrelated notification actions and payloads without opening a form', () => {
  const h = harness();
  h.controller.start();
  h.controller.update(h.snapshot);
  h.emit(response({ billId: 'tagihan-1' }, 'dismiss'));
  h.emit(response({ unrelated: true }));
  assert.deepEqual(h.navigation(), []);
  assert.equal(h.calls.filter(([name]) => name === 'clear').length, 2);
  h.controller.stop();
});

test('failed storage read goes to the list rather than an edit form', () => {
  const h = harness(response({ noteId: 'hutang-1', kind: 'debt' }));
  h.controller.start();
  h.controller.update({ ...h.snapshot, notesError: 'Gagal membaca catatan' });
  assert.deepEqual(h.navigation()[0], ['replace', '/catatan']);
  assert.equal(h.navigation().some(([name]) => name === 'push'), false);
  h.controller.stop();
});