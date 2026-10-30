import assert from 'node:assert/strict';
import test from 'node:test';
import { ControllerAlarmTracker } from './controller-alarms.mjs';
import { ControllerDiagnostics, controllerLedState } from './controller-diagnostics.mjs';
import { CellEventStore } from './cell-events.mjs';

const snapshot = (led = '00', modules = []) => ({
  status: 'online', error: null, resources: { led: controllerLedState(led) },
  modules: { data: modules, error: null },
});
const moduleState = (slot, errorCode) => ({ slot, type: 15, errorCode, message: `Ошибка модуля ${errorCode}` });
const active = (alarms) => alarms.filter((alarm) => alarm.active);
function fixture() {
  const events = [];
  return { events, tracker: new ControllerAlarmTracker((event) => events.push(event)) };
}

test('CPU faults notify once, clear on confirmed 00 and notify again after recurrence', () => {
  const { tracker, events } = fixture();
  assert.deepEqual(tracker.update(snapshot(), 0), []);
  const first = tracker.update(snapshot('5B'), 3_000);
  assert.equal(first[0].code, 'controller:led:5B');
  assert.equal(first[0].severity, 'alarm');
  assert.equal(first[0].effect, 'notification');
  assert.equal(events[0].details.observedOnConnect, false);
  tracker.update(snapshot('5B'), 6_000);
  assert.equal(events.length, 1);
  assert.equal(tracker.update(snapshot(), 9_000)[0].active, false);
  assert.deepEqual(events.map((event) => event.status), ['active', 'restored']);
  assert.equal(first[0].active, true, 'published snapshots must remain immutable');
  const repeated = active(tracker.update(snapshot('5B'), 12_000))[0];
  assert.notEqual(repeated.id, first[0].id);
  assert.equal(repeated.reportedAt, 12_000);
  assert.equal(events.length, 3);
});

test('CPU and module faults coexist; code changes close only the previous code', () => {
  const { tracker, events } = fixture();
  const first = tracker.update(snapshot('25', [moduleState(0, 2), moduleState(3, 5)]), 0);
  assert.equal(active(first).length, 3);
  assert.ok(events.every((event) => event.details.observedOnConnect));
  const next = tracker.update(snapshot('25', [moduleState(0, 3), moduleState(3, 0)]), 6_000);
  assert.deepEqual(active(next).map((alarm) => alarm.code).sort(), ['controller:led:25', 'controller:module:0:3']);
  const changed = events.find((event) => event.code === 'controller:module:0:2' && event.status === 'restored');
  assert.equal(changed.details.replacedByCode, 'controller:module:0:3');
  assert.match(changed.message, /больше не сообщается/);
  assert.equal(events.filter((event) => event.code === 'controller:led:25').length, 1);
});

test('loss of CPU or module reads preserves faults as stale and logs separate warnings', () => {
  const { tracker, events } = fixture();
  const first = tracker.update(snapshot('5B', [moduleState(0, 2)]), 0);
  const missing = { ...snapshot(), status: 'unauthorized', resources: null, error: 'Авторизация отклонена',
    modules: { data: null, error: 'Нет связи' } };
  const lost = active(tracker.update(missing, 6_000));
  assert.equal(lost.length, 4);
  assert.ok(lost.filter((alarm) => alarm.severity === 'alarm').every((alarm) => alarm.stale));
  assert.equal(events.filter((event) => event.status === 'restored').length, 0);
  tracker.update(missing, 9_000);
  assert.equal(events.length, 4);
  const same = active(tracker.update(snapshot('5B', [moduleState(0, 2)]), 12_000));
  assert.deepEqual(same.map((alarm) => alarm.id), first.map((alarm) => alarm.id));
  assert.ok(same.every((alarm) => !alarm.stale));
  assert.ok(events.filter((event) => event.status === 'restored').every((event) => event.eventType === 'warning'));
});

test('missing LED and missing or unreadable module slots cannot resolve observed faults', () => {
  const { tracker, events } = fixture();
  tracker.update(snapshot('5B', [moduleState(0, 2), moduleState(3, 5)]), 0);
  const incomplete = active(tracker.update(snapshot(null, [moduleState(0, null)]), 6_000));
  assert.equal(incomplete.filter((alarm) => alarm.severity === 'alarm').length, 3);
  assert.ok(incomplete.filter((alarm) => alarm.severity === 'alarm').every((alarm) => alarm.stale));
  assert.equal(events.filter((event) => event.status === 'restored').length, 0);
  tracker.update(snapshot('00', [moduleState(0, 0), moduleState(3, 0)]), 12_000);
  assert.equal(tracker.active.size, 0);
});

test('unknown manufacturer codes are alarms with their original code', () => {
  const { tracker, events } = fixture();
  const alarms = tracker.update(snapshot('7e', [moduleState(7, 65535)]), 0);
  assert.deepEqual(alarms.map((alarm) => alarm.code), ['controller:led:7E', 'controller:module:7:65535']);
  assert.match(alarms[0].text, /Неизвестный код производителя/);
  assert.equal(events.length, 2);
});

test('history is bounded without evicting active module faults', () => {
  const { tracker } = fixture();
  const modules = [moduleState(0, 2)];
  for (let index = 0; index < 130; index += 1) tracker.update(snapshot(index % 2 ? '5B' : '25', modules), index);
  const alarms = tracker.update(snapshot('25', modules), 131);
  assert.equal(active(alarms).length, 2);
  assert.equal(alarms.filter((alarm) => !alarm.active).length, 100);
});

test('polling persists system faults and recovery in the common journal with existing filters', async (t) => {
  const store = new CellEventStore({ autoPrune: false });
  t.after(() => store.close());
  let data = {
    resources: { led: '5B', runstate: '0' }, identity: { devicetype: 'MC522' },
    modules: [{ slave: 0, type: 15, error: 2 }],
  };
  const diagnostics = new ControllerDiagnostics({ enabled: true, url: 'http://localhost:8090',
    username: 'test-user', password: 'test-secret' }, async (_, section) => data[section], (event) => store.record(event));
  const first = await diagnostics.poll(0);
  await diagnostics.poll(3_000);
  let journal = store.query({ sourceIds: [8], level: 'error' });
  assert.equal(journal.count, 2);
  assert.ok(journal.events.every((event) => event.status === 'active' && event.details.origin === 'controller-web'));
  assert.doesNotMatch(JSON.stringify({ first, journal }), /test-user|test-secret|password|username/);
  data = { ...data, resources: { led: '00', runstate: '1' }, modules: [{ slave: 0, type: 15, error: 0 }] };
  await diagnostics.poll(6_000);
  journal = store.query({ sourceIds: [8], codePrefixes: ['controller:'], statuses: ['restored'], eventTypes: ['alarm'] });
  assert.equal(journal.count, 2);
  assert.ok(journal.events.every((event) => event.timestampMs === 6_000));
  assert.equal(active(diagnostics.state.alarms).length, 0);
});
