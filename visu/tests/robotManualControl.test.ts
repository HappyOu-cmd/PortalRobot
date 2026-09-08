import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { currentRobotPointLabel, MANUAL_POINT_OPTIONS, robotActionCommand } from '../src/components/robotManualControl.ts';

test('current point uses PLC enum, not the manual selector code', () => {
  assert.match(currentRobotPointLabel(17), /HOME_SAFETY/);
  assert.match(currentRobotPointLabel(19), /безопасно над слотом/);
  assert.match(currentRobotPointLabel(20), /внутри слота/);
  assert.match(currentRobotPointLabel(21), /смена захвата/);
  assert.equal(currentRobotPointLabel(0), 'Не определена');
  assert.equal(currentRobotPointLabel(999), 'Точка 999');
  assert.equal(currentRobotPointLabel(17, false), 'Нет данных');
});

test('manual point list preserves the gateway contract without legacy inside-machine points', () => {
  assert.deepEqual(MANUAL_POINT_OPTIONS.map((point) => point.value), [1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16]);
});

test('machine and home moves do not carry stale magazine or slot fields', () => {
  assert.deepEqual(robotActionCommand(1, 13, 42, 2), { command: 'robot.action', action: 1, point: 13, slot: 0, magazine: 0 });
});

test('magazine move carries selected magazine and slot in one transaction', () => {
  assert.deepEqual(robotActionCommand(1, 16, 42, 2), { command: 'robot.action', action: 1, point: 16, slot: 42, magazine: 2 });
});

test('all gripper and rotation actions clear movement fields', () => {
  for (const action of [2, 3, 4, 5, 6, 7] as const) {
    assert.deepEqual(robotActionCommand(action, 16, 42, 2), { command: 'robot.action', action, point: 0, slot: 0, magazine: 0 });
  }
});

test('robot overview separates actual drive power from readiness during motion', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /if \(!runtime\.drivesReady\) return \{ text: 'Приводы выключены'/);
  assert.match(source, /if \(runtime\.robotManual\.drivesOff\) return \{ text: 'Приводы выключены'/);
  assert.match(source, /runtime\.axisManual\.some\(\(axis\) => axis\.busy\)/);
});
