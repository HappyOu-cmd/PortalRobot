import test from 'node:test';
import assert from 'node:assert/strict';

import { isHmiCommandAllowedDuringTest } from './test-session.mjs';

test('exclusive test session leaves safety, reset and queued simulation factor available to HMI', () => {
  for (const command of ['cell.stop', 'cell.reset', 'robot.stop', 'robot.reset', 'hmi.heartbeat', 'simulation.accelerationFactor']) {
    assert.equal(isHmiCommandAllowedDuringTest(command, true), true);
  }
  for (const command of ['cell.start', 'cell.manual', 'robot.action', 'fault.enable']) {
    assert.equal(isHmiCommandAllowedDuringTest(command, true), false);
  }
  assert.equal(isHmiCommandAllowedDuringTest('cell.start', false), true);
});

test('exclusive tests delegate direct manual I/O permission to PLC while keeping emergency reset excluded', () => {
  for (const command of ['io.heartbeat', 'io.manual.begin', 'io.manual.end', 'io.override', 'io.output', 'io.release', 'io.releaseAll', 'io.output.release', 'io.outputs.releaseAll', 'io.releaseEverything', 'io.emergencyStop']) {
    assert.equal(isHmiCommandAllowedDuringTest(command, true), true);
  }
  for (const command of ['io.emergencyReset']) {
    assert.equal(isHmiCommandAllowedDuringTest(command, true), false);
    assert.equal(isHmiCommandAllowedDuringTest(command, false), true);
  }
});
