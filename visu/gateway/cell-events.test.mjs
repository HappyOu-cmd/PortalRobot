import assert from 'node:assert/strict';
import test from 'node:test';
import { CellEventClassifier, CellEventStore, captureCellEventContext, describeOperatorCommand } from './cell-events.mjs';

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

test('mode and reset availability log PLC feedback and supporting signals without duplicates', () => {
  const classifier = new CellEventClassifier();
  const initial = snapshot({ xCellManual: false, 'stCellStatus.xResetAllowed': false,
    'stRobotStatus.xResetAllowed': false, 'stRobotStatus.xError': true });
  const observed = classifier.process(initial, 1000).filter((event) => ['control-mode', 'reset-availability'].includes(event.eventType));
  assert.equal(observed.length, 2);
  assert.equal(observed[0].details.observedOnConnect, true);
  const current = { ...initial, xCellManual: true, 'stCellStatus.xResetAllowed': true,
    'stRobotStatus.xResetAllowed': true, udiCellModeAckSeq: 2, uiCellModeResult: 1 };
  const events = classifier.process(current, 2000);
  assert.deepEqual(events.map((event) => event.eventType), ['control-mode', 'reset-availability']);
  assert.equal(events[1].details.signals['stRobotStatus.xResetAllowed'], true);
  assert.equal(events[0].details.signals.udiCellModeAckSeq, 2);
  assert.equal(events[0].details.observedOnConnect, false);
  assert.deepEqual(classifier.process(current, 3000), []);
});

test('missing mode/reset signals are not invented as false telemetry', () => {
  const classifier = new CellEventClassifier();
  assert.deepEqual(classifier.process(snapshot(), 1000), []);
  assert.deepEqual(classifier.process(snapshot(), 2000), []);
});

test('equipment inspection history filters exact source prefixes and activation time', () => {
  const store = new CellEventStore({ databasePath: ':memory:' });
  try {
    for (const [code, status, timestampMs] of [['2:4', 'active', 1000], ['12:4', 'active', 2000], ['2:4', 'restored', 3000], ['io:cabinet:rear:emergency-stop', 'active', 4000]]) {
      store.record({ code, status, timestampMs, sourceId: 7, eventType: code.startsWith('io:') ? 'equipment-diagnostic' : 'alarm', message: 'test' });
    }
    assert.deepEqual(store.query({ codePrefixes: ['2:'], statuses: ['active'] }).events.map((event) => event.timestampMs), [1000]);
    assert.deepEqual(store.query({ codePrefixes: ['2:', 'io:cabinet:rear:'], statuses: ['active'] }).events.map((event) => event.timestampMs), [4000, 1000]);
  } finally { store.close(); }
});

test('inspection logs E-stop edges and observes already pressed buttons on connection without inventing absent signals', () => {
  const classifier = new CellEventClassifier();
  const path = 'stRearControlCabinetIoStatus.xEmergencyStopPressed';
  const initial = classifier.process(snapshot({ [path]: true }), 1000).filter((event) => event.eventType === 'equipment-diagnostic');
  assert.equal(initial.length, 1);
  assert.equal(initial[0].code, 'io:cabinet:rear:emergency-stop');
  assert.equal(initial[0].details.observedOnConnect, true);
  assert.equal(classifier.process(snapshot({ [path]: true }), 2000).filter((event) => event.eventType === 'equipment-diagnostic').length, 0);
  const released = classifier.process(snapshot({ [path]: false }), 3000).filter((event) => event.eventType === 'equipment-diagnostic');
  assert.equal(released[0].status, 'restored');
  assert.equal(released[0].details.observedOnConnect, false);
  const pressed = classifier.process(snapshot({ [path]: true }), 4000).filter((event) => event.eventType === 'equipment-diagnostic');
  assert.equal(pressed[0].status, 'active');
  assert.equal(pressed[0].timestampMs, 4000);
  assert.equal(pressed[0].details.observedOnConnect, false);

  const station = new CellEventClassifier();
  const releasedPath = 'stCellSafetyStatus.axEmergencyStopReleased[1]';
  const stationPressed = station.process(snapshot({ [releasedPath]: false }), 5000)
    .filter((event) => event.eventType === 'equipment-diagnostic');
  assert.deepEqual(stationPressed.map((event) => [event.code, event.status]), [
    ['io:station:magazine-1-front:emergency-stop', 'active'],
  ]);
  const stationReleased = station.process(snapshot({ [releasedPath]: true }), 6000)
    .filter((event) => event.eventType === 'equipment-diagnostic');
  assert.equal(stationReleased[0].status, 'restored');
});

test('inspection logs unsafe relay and enabled-magazine door conditions with inverted OK polarity', () => {
  const classifier = new CellEventClassifier();
  const phase = 'stCellSafetyStatus.xPhaseRelayOk';
  const door = 'stCellSafetyStatus.axDoorReady[1]';
  assert.equal(classifier.process(snapshot({ [phase]: true, [door]: true }), 1000)
    .filter((event) => event.eventType === 'equipment-diagnostic').length, 0);
  const active = classifier.process(snapshot({ [phase]: false, [door]: false }), 2000)
    .filter((event) => event.eventType === 'equipment-diagnostic');
  assert.deepEqual(active.map((event) => [event.code, event.status]), [
    ['io:station:magazine-1-front:door-lock', 'active'],
    ['io:cabinet:rear:phase-relay', 'active'],
  ]);
  const restored = classifier.process(snapshot({ [phase]: true, [door]: true }), 3000)
    .filter((event) => event.eventType === 'equipment-diagnostic');
  assert.deepEqual(restored.map((event) => event.status), ['restored', 'restored']);
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
  const capture = describeOperatorCommand({ type: 'command', requestId: 'cap', command: 'robot.point.capture', index: 10 });
  const save = describeOperatorCommand({
    type: 'command', requestId: 'save', command: 'robot.point.save', index: 10,
    draft: { x: 100, y: 200, z: 300, speedFactor: 0.5 },
  });
  assert.equal(capture.label, 'Зафиксировать координаты инженерной точки');
  assert.deepEqual(capture.details, { index: 10 });
  assert.equal(save.label, 'Сохранить инженерную точку');
  assert.deepEqual(save.details, { index: 10, draft: { x: 100, y: 200, z: 300, speedFactor: 0.5 } });
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

const contextSnapshot = (overrides = {}) => snapshot({
  uiMagazineMode: 1,
  'stCellStatus.xRunning': true,
  'stCellDiag.eState': 5,
  'stCellStatus.uiSelectedMachine': 2,
  'stMultiType.CycleStatus.uiSelectedType': 1,
  'stCellStatus.uiActiveMagazine': 1,
  'astTwinStatus[1].uiRobotPallet': 1,
  'astTwinStatus[1].uiStep': 0,
  'astTwinStatus[2].uiRobotPallet': 2,
  ...Object.fromEntries([1, 2, 3].flatMap(machine => [
    [`astMachineDiag[${machine}].eState`, 4],
    [`astMachineStatus[${machine}].ePartState`, machine === 2 ? 1 : 2],
    [`astMachineStatus[${machine}].ePartType`, machine === 2 ? 0 : machine === 1 ? 1 : 2],
    [`astMachineStatus[${machine}].xBusy`, false],
    [`astMachineStatus[${machine}].xProcessing`, machine === 3],
    [`astGeometryCalls[${machine}].udiId`, 40 + machine],
    [`astGeometryCalls[${machine}].uiState`, 1],
    [`astGeometryCalls[${machine}].uiStation`, 0],
  ])),
  ...overrides,
});

test('GK call context belongs to the requested machine while preserving the different planner target', () => {
  const values = contextSnapshot();
  const description = describeOperatorCommand({ type: 'command', command: 'geometry.command', action: 8, machine: 1, magazine: 0 }, values);
  const context = description.details.context;
  assert.equal(context.selectedMachine, 2);
  assert.equal(context.selectedType, 1);
  assert.equal(context.partState, 2);
  assert.equal(context.partType, 1);
  assert.equal(context.busy, false);
  assert.equal(context.processing, false);
  assert.equal(context.callId, 41);
  assert.equal(context.callState, 1);
  assert.equal(context.station, 0);
  assert.equal(context.activeMagazine, 1);
  assert.equal(context.robotPallet, 1);
  values['astGeometryCalls[1].udiId'] = 100;
  values['astMachineStatus[1].ePartState'] = 1;
  assert.equal(context.callId, 41);
  assert.equal(context.partState, 2);
  for (const message of [
    { command: 'geometry.command', action: 12, machine: 1 },
    { command: 'robot.action', action: 8 },
    { command: 'hmi.heartbeat' },
  ]) assert.equal(Object.hasOwn(describeOperatorCommand(message, values).details, 'context'), false);
});

test('service context enriches one existing state event per automatic service and persists in SQLite', () => {
  const classifier = new CellEventClassifier();
  const initial = contextSnapshot();
  assert.deepEqual(classifier.process(initial, 1000), []);
  const serving = { ...initial, 'stCellDiag.eState': 6,
    'astMachineStatus[2].xBusy': true, 'astMachineDiag[2].eState': 11 };
  const events = classifier.process(serving, 2000);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'state');
  assert.equal(events[0].sourceId, 2);
  assert.deepEqual([events[0].oldValue, events[0].newValue], [4, 11]);
  assert.ok(events[0].operationId);
  assert.deepEqual(events[0].details.context, {
    cellState: 6, selectedMachine: 2, selectedType: 1, activeMagazine: 1, robotPallet: 1,
    partState: 1, partType: 0, busy: true, processing: false, callId: 42, callState: 1, station: 0,
  });
  const store = new CellEventStore({ databasePath: ':memory:' });
  try {
    store.record(events[0]);
    assert.deepEqual(store.recent()[0].details, events[0].details);
    assert.equal(store.query({ eventTypes: ['state'] }).count, 1);
  } finally { store.close(); }
  assert.deepEqual(classifier.process(serving, 2100), []);
  const moving = { ...serving, 'astMachineDiag[2].eState': 9 };
  const later = classifier.process(moving, 2200);
  assert.equal(later.length, 1);
  assert.equal(later[0].details, undefined);
  const released = { ...moving, 'stCellDiag.eState': 5,
    'astMachineStatus[2].xBusy': false, 'astMachineDiag[2].eState': 4 };
  classifier.process(released, 3000);
  const next = classifier.process(serving, 4000);
  assert.equal(next.length, 1);
  assert.deepEqual(next[0].details.context, events[0].details.context);
});

test('service context waits for observed automatic service and does not relog a service on reconnect', () => {
  const initial = contextSnapshot();
  const serving = { ...initial, 'stCellDiag.eState': 6,
    'astMachineStatus[2].xBusy': true, 'astMachineDiag[2].eState': 11 };
  for (const overrides of [{ 'stCellStatus.xRunning': false }, { 'stCellDiag.eState': 5 }, { 'stCellStatus.uiSelectedMachine': 1 }]) {
    const classifier = new CellEventClassifier();
    classifier.process(initial, 1000);
    const events = classifier.process({ ...serving, ...overrides }, 2000);
    assert.equal(events.find(event => event.sourceId === 2 && event.eventType === 'state').details, undefined);
  }
  const reconnect = new CellEventClassifier();
  assert.deepEqual(reconnect.process(serving, 1000), []);
  assert.equal(reconnect.process({ ...serving, 'astMachineDiag[2].eState': 9 }, 2000)[0].details, undefined);

  const delayed = new CellEventClassifier();
  delayed.process(initial, 1000);
  const pending = { ...serving, 'astMachineStatus[2].xBusy': false };
  assert.equal(delayed.process(pending, 2000)[0].details, undefined);
  assert.deepEqual(delayed.process(serving, 2100), []);
  const later = delayed.process({ ...serving, 'astMachineDiag[2].eState': 9 }, 2200);
  assert.equal(later.length, 1);
  assert.equal(later[0].details.context.busy, true);
  assert.equal(delayed.process({ ...serving, 'astMachineDiag[2].eState': 10 }, 2300)[0].details, undefined);
});

test('pallet change enriches only its existing event with all three machine contents', () => {
  const classifier = new CellEventClassifier();
  const initial = contextSnapshot();
  classifier.process(initial, 1000);
  const exchanged = { ...initial, 'astTwinStatus[1].uiRobotPallet': 2 };
  const events = classifier.process(exchanged, 2000);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'pallet-state');
  assert.deepEqual([events[0].oldValue, events[0].newValue], [1, 2]);
  assert.equal(events[0].details.magazine, 1);
  assert.equal(events[0].details.context.robotPallet, 2);
  assert.deepEqual(events[0].details.context.machines, [
    { machine: 1, partState: 2, partType: 1, busy: false, processing: false },
    { machine: 2, partState: 1, partType: 0, busy: false, processing: false },
    { machine: 3, partState: 2, partType: 2, busy: false, processing: true },
  ]);
  assert.deepEqual(classifier.process(exchanged, 2100), []);
  const step = classifier.process({ ...exchanged, 'astTwinStatus[1].uiStep': 20 }, 2200);
  assert.equal(step.length, 1);
  assert.deepEqual(step[0].details, { magazine: 1 });
  const other = classifier.process({ ...exchanged, 'astTwinStatus[1].uiStep': 20, 'astTwinStatus[2].uiRobotPallet': 1 }, 2300);
  assert.equal(other.length, 1);
  assert.equal(other[0].details.magazine, 2);
  assert.equal(other[0].details.context.activeMagazine, 1);
  assert.equal(other[0].details.context.robotPallet, 2);
});

test('missing or invalid context telemetry remains unknown and static magazines use pallet zero', () => {
  const context = captureCellEventContext({
    'stCellStatus.uiSelectedMachine': 1,
    'astMachineStatus[1].ePartState': null,
    'astMachineStatus[1].ePartType': '1',
    'astMachineStatus[1].xBusy': 1,
  });
  assert.equal(context.selectedMachine, 1);
  for (const key of ['cellState', 'selectedType', 'activeMagazine', 'robotPallet', 'partState', 'partType', 'busy', 'processing', 'callId', 'callState', 'station']) {
    assert.equal(context[key], null, key);
  }
  assert.equal(captureCellEventContext(contextSnapshot({ uiMagazineMode: 0 })).robotPallet, 0);
  assert.deepEqual(Object.keys(captureCellEventContext({}, 0)), ['cellState', 'selectedMachine', 'selectedType', 'activeMagazine', 'robotPallet']);
});

test('machine part state messages name empty, loaded and unknown without changing event values', () => {
  const classifier = new CellEventClassifier();
  const initial = snapshot({ 'astMachineStatus[1].ePartState': 0 });
  classifier.process(initial, 1000);
  let previous = 0;
  for (const [state, label] of [[1, 'станок пуст'], [2, 'изделие загружено'], [0, 'состояние изделия неизвестно'], [99, 'состояние изделия 99']]) {
    const events = classifier.process({ ...initial, 'astMachineStatus[1].ePartState': state }, 2000 + state);
    assert.equal(events.length, 1);
    assert.equal(events[0].message, `Станок 1: ${label}`);
    assert.deepEqual([events[0].oldValue, events[0].newValue], [previous, state]);
    assert.deepEqual(classifier.process({ ...initial, 'astMachineStatus[1].ePartState': state }, 3000 + state), []);
    previous = state;
  }
});

test('event contexts have bounded size and exclude coordinates, slot maps and full telemetry', () => {
  const values = contextSnapshot({
    lrActualX: 1500, 'astGeometryCalls[2].udiId': 0xffffffff,
    'astTwinStore[1].astPallet[1].aSlots': Array.from({ length: 96 }, () => ({ eDetailType: 1 })),
    unrelated: 'x'.repeat(10000),
  });
  const context = captureCellEventContext(values);
  assert.equal(Object.keys(context).length, 12);
  assert.ok(Buffer.byteLength(JSON.stringify({ context }), 'utf8') <= 256);
  assert.equal(context.callId, 0xffffffff);
  assert.equal(Object.hasOwn(context, 'lrActualX'), false);
  assert.equal(Object.hasOwn(context, 'unrelated'), false);
  const classifier = new CellEventClassifier();
  classifier.process(values, 1000);
  const events = classifier.process({ ...values, 'astTwinStatus[1].uiRobotPallet': 2 }, 2000);
  assert.equal(events.length, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(events[0].details), 'utf8') <= 512);
});
