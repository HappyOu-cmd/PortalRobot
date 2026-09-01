import assert from 'node:assert/strict';
import test from 'node:test';
import { CellEventClassifier, CellEventStore, describeOperatorCommand } from './cell-events.mjs';

const snapshot = (overrides = {}) => ({
  'stCellStatus.xRunning': false,
  'xModbusMode': false,
  'stRobotStatus.xBusy': false,
  'stRobotDiag.eActiveAction': 0,
  'stRobotDiag.eActivePoint': 0,
  'stRobotStatus.eCurrentPoint': 0,
  'astMagazineStatus[1].xBusy': false,
  'astMagazineStatus[2].xBusy': false,
  ...overrides,
});

test('stores persistent events with source, operation and command correlation', () => {
  const store = new CellEventStore({ databasePath: ':memory:', retentionDays: 90 });
  const saved = store.record({
    timestampMs: 1_000, sourceId: 5, eventType: 'modbus-command', status: 'completed',
    message: 'Команда завершена', operationId: 'cycle-1', commandSeq: 42,
    actor: { id: 7, username: 'operator', displayName: 'Оператор 7' }, details: { registers: [1, 2] },
  });

  assert.equal(saved.id, 1);
  assert.equal(saved.source, 'Робот');
  assert.equal(saved.operationId, 'cycle-1');
  assert.equal(saved.commandSeq, 42);
  assert.deepEqual(saved.actor, { id: 7, username: 'operator', displayName: 'Оператор 7' });
  assert.deepEqual(store.recent()[0].details, { registers: [1, 2] });
  assert.deepEqual(store.actors(), [{ id: 7, username: 'operator', displayName: 'Оператор 7' }]);
  store.close();
});

test('reads legacy actor data from event details', () => {
  const store = new CellEventStore({ databasePath: ':memory:', retentionDays: 90 });
  const saved = store.record({
    timestampMs: 1_000, sourceId: 6, eventType: 'operator-command', status: 'accepted',
    message: 'Команда оператора', details: { actor: { id: 3, username: 'legacy', role: 'operator' } },
  });

  assert.deepEqual(saved.actor, { id: 3, username: 'legacy', displayName: 'legacy' });
  store.close();
});

test('queries cell events with server-side filters and cursor pagination', () => {
  const store = new CellEventStore({ databasePath: ':memory:', retentionDays: 90 });
  store.record({ timestampMs: 1_000, sourceId: 1, eventType: 'door', status: 'changed', message: 'Дверь открыта' });
  store.record({ timestampMs: 2_000, sourceId: 5, eventType: 'modbus-command', status: 'completed', message: 'Робот завершил команду', operationId: 'cycle-2', commandSeq: 42, code: '0' });
  store.record({ timestampMs: 3_000, sourceId: 7, eventType: 'warning', status: 'active', message: 'Предупреждение робота', code: '17' });
  store.record({ timestampMs: 4_000, sourceId: 7, eventType: 'alarm', status: 'active', message: 'Авария робота', code: '18' });
  store.record({ timestampMs: 5_000, sourceId: 6, eventType: 'operator-command', status: 'accepted', message: 'Команда оператора', actor: { id: 11, username: 'admin', displayName: 'Администратор' } });

  const first = store.query({ fromMs: 1_500, sourceIds: [5, 7], order: 'desc', limit: 2 });
  assert.equal(first.count, 3);
  assert.deepEqual(first.events.map((event) => event.id), [4, 3]);
  assert.equal(first.hasMore, true);
  const second = store.query({ fromMs: 1_500, sourceIds: [5, 7], order: 'desc', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.events.map((event) => event.id), [2]);
  assert.equal(second.hasMore, false);

  assert.deepEqual(store.query({ level: 'error' }).events.map((event) => event.id), [4]);
  assert.deepEqual(store.query({ level: 'warning' }).events.map((event) => event.id), [3]);
  assert.deepEqual(store.query({ text: 'завершил', operationId: 'cycle-2', commandSeq: 42, code: '0' }).events.map((event) => event.id), [2]);
  assert.deepEqual(store.query({ statuses: ['changed'], eventTypes: ['door'], order: 'asc' }).events.map((event) => event.id), [1]);
  assert.deepEqual(store.query({ actorUserId: 11 }).events.map((event) => event.id), [5]);
  store.close();
});

test('classifies semantic transitions without logging unchanged snapshots', () => {
  const classifier = new CellEventClassifier();
  assert.deepEqual(classifier.process(snapshot(), 1_000), []);
  assert.deepEqual(classifier.process(snapshot(), 1_100), []);

  const events = classifier.process(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 2,
  }), 2_000);

  assert.ok(events.some((event) => event.sourceId === 5 && /начал выполнение/.test(event.message)));
  assert.ok(events.some((event) => /Станок 1 — внутри/.test(event.message)));
  assert.equal(classifier.process(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 2,
  }), 2_100).length, 0);
});

test('assigns one operation id to all events of an automatic cycle', () => {
  const classifier = new CellEventClassifier();
  classifier.process(snapshot(), 1_000);
  const started = classifier.process(snapshot({ 'stCellStatus.xRunning': true }), 2_000);
  const operationId = started.find((event) => event.eventType === 'cell-cycle')?.operationId;
  assert.ok(operationId);

  const robot = classifier.process(snapshot({
    'stCellStatus.xRunning': true,
    'stRobotStatus.xBusy': true,
  }), 3_000);
  assert.ok(robot.length > 0);
  assert.ok(robot.every((event) => event.operationId === operationId));
});

test('records alarm activation and restoration with duration', () => {
  const classifier = new CellEventClassifier();
  classifier.process(snapshot(), 1_000);
  const activeSnapshot = snapshot({
    'astAlarmEvent[1].udiSequence': 77,
    'astAlarmEvent[1].eSeverity': 0,
    'astAlarmEvent[1].eSource': 2,
    'astAlarmEvent[1].uiCode': 5,
    'astAlarmEvent[1].xActive': true,
  });
  const activated = classifier.process(activeSnapshot, 2_000);
  assert.equal(activated[0].sourceId, 7);
  assert.equal(activated[0].status, 'active');
  assert.equal(activated[0].message, 'Авария: Станок 1 — Не удалось закрыть люк');
  assert.equal(activated[0].details.effect, 'EQUIPMENT_STOP');

  const restored = classifier.process({ ...activeSnapshot, 'astAlarmEvent[1].xActive': false }, 5_000);
  assert.equal(restored[0].status, 'restored');
  assert.equal(restored[0].message, 'Авария устранена: Станок 1 — Не удалось закрыть люк');
  assert.equal(restored[0].details.durationMs, 3_000);
});

test('records an opened operator door during service as ROBOT_STOP', () => {
  const classifier = new CellEventClassifier();
  classifier.process(snapshot(), 1_000);
  const events = classifier.process(snapshot({
    'astAlarmEvent[1].udiSequence': 78,
    'astAlarmEvent[1].eSeverity': 0,
    'astAlarmEvent[1].eSource': 2,
    'astAlarmEvent[1].uiCode': 23,
    'astAlarmEvent[1].eEffect': 1,
    'astAlarmEvent[1].xActive': true,
  }), 2_000);

  assert.equal(events[0].message, 'Авария: Станок 1 — Дверь открыта во время обслуживания станка');
  assert.equal(events[0].details.effect, 'ROBOT_STOP');
});

test('adds a full register snapshot only to meaningful Modbus command transitions', () => {
  const classifier = new CellEventClassifier();
  const base = snapshot({
    xModbusMode: true,
    'stRobotModbusStatus.uiExecutionState': 0,
    ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`auiRobotModbusWriteRegisters[${index + 1}]`, 0])),
    ...Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`auiRobotModbusReadRegisters[${index + 1}]`, 0])),
  });
  classifier.process(base, 1_000);
  const accepted = classifier.process({
    ...base,
    'stRobotModbusStatus.uiExecutionState': 1,
    'stRobotModbusStatus.uiActiveCommand': 23,
    'stRobotModbusStatus.uiAckSeq': 12,
    'auiRobotModbusWriteRegisters[8]': 12,
  }, 2_000);
  const command = accepted.find((event) => event.eventType === 'modbus-command');
  assert.equal(command.commandSeq, 12);
  assert.equal(command.details.writeRegisters.length, 9);
  assert.equal(command.details.readRegisters.length, 17);
});

test('describes operator commands without storing transport-only fields', () => {
  const command = describeOperatorCommand({ type: 'command', requestId: 'abc', command: 'robot.action', action: 3, point: 0 });
  assert.equal(command.label, 'Ручная команда роботу');
  assert.deepEqual(command.details, { action: 3, point: 0 });
});

test('describes manual machine mechanism commands in the operator journal', () => {
  const command = describeOperatorCommand({ type: 'command', requestId: 'door', command: 'machine.manualDoorOpen', machine: 2 });
  assert.equal(command.label, 'Открыть операторскую дверь станка');
  assert.deepEqual(command.details, { machine: 2 });
});

test('describes fixed-point editor commands with their point and draft', () => {
  const capture = describeOperatorCommand({ type: 'command', requestId: 'cap', command: 'robot.point.capture', index: 13 });
  const save = describeOperatorCommand({
    type: 'command', requestId: 'save', command: 'robot.point.save', index: 13,
    draft: { x: 100, y: 200, z: 300, speedFactor: 0.5 },
  });
  assert.equal(capture.label, 'Зафиксировать координаты инженерной точки');
  assert.deepEqual(capture.details, { index: 13 });
  assert.equal(save.label, 'Сохранить инженерную точку');
  assert.deepEqual(save.details, { index: 13, draft: { x: 100, y: 200, z: 300, speedFactor: 0.5 } });
});

test('does not report the current manual readiness reason as a rejected command', () => {
  const classifier = new CellEventClassifier();
  classifier.process(snapshot({ 'stRobotHmiStatus.eRejectReason': 0 }), 1_000);

  const events = classifier.process(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotHmiStatus.eRejectReason': 11,
  }), 2_000);

  assert.equal(events.some((event) => event.eventType === 'plc-rejection'), false);
});
