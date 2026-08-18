import test from 'node:test';
import assert from 'node:assert/strict';

import { isHmiCommandAllowedDuringTest } from './test-session.mjs';

test('exclusive test session leaves only safety and reset commands available to HMI', () => {
  for (const command of ['cell.stop', 'cell.reset', 'robot.stop', 'robot.reset', 'hmi.heartbeat']) {
    assert.equal(isHmiCommandAllowedDuringTest(command, true), true);
  }
  for (const command of ['cell.start', 'cell.manual', 'robot.action', 'fault.enable']) {
    assert.equal(isHmiCommandAllowedDuringTest(command, true), false);
  }
  assert.equal(isHmiCommandAllowedDuringTest('cell.start', false), true);
});
