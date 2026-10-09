import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_PHYSICAL_IO, PHYSICAL_IO_SIGNALS, filterIoSignals, ioEquipmentType, ioSignalKey, ioSignalLevel } from '../src/plc/physicalIo.ts';

test('offline and unverified/missing hardware are unknown rather than healthy zeroes', () => {
  const input = PHYSICAL_IO_SIGNALS.find((signal) => signal.direction === 'DI')!;
  const data = { ...INITIAL_PHYSICAL_IO, available: true, rawDi: Array(84).fill(false), usedDi: Array(84).fill(false) };
  assert.equal(ioSignalLevel(data, input, 'raw', false), null);
  assert.equal(ioSignalLevel(data, input, 'raw', true), null);
  assert.equal(ioSignalLevel({ ...data, mappingVerified: true }, input, 'raw', true), false);
  const missing = { ...input, installed: false };
  assert.equal(ioSignalLevel({ ...data, mappingVerified: true }, missing, 'raw', true), null);
});

test('both GK sensors have independent program levels and physical inputs remain visible', () => {
  const data = { ...INITIAL_PHYSICAL_IO, available: true, mappingVerified: true, rawDi: Array(84).fill(false), usedDi: Array(84).fill(false) };
  data.usedDi[78] = true;
  const a = PHYSICAL_IO_SIGNALS.find((signal) => signal.variable === 'xDiGk1PartAtEnd')!;
  const b = PHYSICAL_IO_SIGNALS.find((signal) => signal.variable === 'xDiGk2PartAtEnd')!;
  assert.equal(ioSignalLevel(data, a, 'raw', true), false);
  assert.equal(ioSignalLevel(data, a, 'used', true), true);
  assert.equal(ioSignalLevel(data, b, 'used', true), false);
});

test('47 outputs retain stable IDs and are command levels and cannot be disguised as physical DI feedback', () => {
  const output = PHYSICAL_IO_SIGNALS.find((signal) => signal.direction === 'DO' && signal.index === 50)!;
  const data = { ...INITIAL_PHYSICAL_IO, available: true, outputs: Array(50).fill(false) };
  data.outputs[49] = true;
  assert.equal(ioSignalLevel(data, output, 'used', true), true);
  assert.equal(ioSignalLevel(data, output, 'raw', true), null);
  assert.equal(ioSignalLevel({ ...data, available: false }, output, 'used', true), null);
  assert.equal(PHYSICAL_IO_SIGNALS.length, 131);
  assert.equal(PHYSICAL_IO_SIGNALS.filter((s) => s.direction === 'DO').length, 47);
  assert.ok(!PHYSICAL_IO_SIGNALS.some((s) => s.direction === 'DO' && [37, 38, 39].includes(s.index)));
});

test('equipment type, specific machine and case-insensitive search select independent DI/DO sets', () => {
  const machines = filterIoSignals(PHYSICAL_IO_SIGNALS, { equipmentType: 'machines', category: 'Станок 2' });
  assert.ok(machines.some((s) => s.direction === 'DI')); assert.ok(machines.some((s) => s.direction === 'DO'));
  assert.ok(machines.every((s) => s.category === 'Станок 2'));
  assert.equal(filterIoSignals(PHYSICAL_IO_SIGNALS, { equipmentType: 'magazines', category: 'Станок 2' }).length, 0);
  const found = filterIoSignals(PHYSICAL_IO_SIGNALS, { equipmentType: 'line', query: '  XDIgk2PARTatEND  ' });
  assert.equal(found.length, 1); assert.equal(found[0].index, 80); assert.equal(ioEquipmentType(found[0]), 'line');
  assert.ok(filterIoSignals(PHYSICAL_IO_SIGNALS, { query: found[0].address }).some((s) => ioSignalKey(s) === 'DI:80'));
});

test('custom selection does not confuse DI and DO with the same index and survives equipment filters', () => {
  const selected = new Set(['DI:1', 'DO:1', 'DO:41']);
  assert.deepEqual(filterIoSignals(PHYSICAL_IO_SIGNALS, { selected }).map(ioSignalKey).sort(), ['DI:1', 'DO:1', 'DO:41']);
  assert.deepEqual(filterIoSignals(PHYSICAL_IO_SIGNALS, { equipmentType: 'line', selected }).map(ioSignalKey), ['DO:41']);
  assert.equal(filterIoSignals(PHYSICAL_IO_SIGNALS, { selected: new Set() }).length, 0);
  assert.equal(selected.size, 3);
});
