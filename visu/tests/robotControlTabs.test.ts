import assert from 'node:assert/strict';
import test from 'node:test';
import { initialRobotControlTab, reconcileRobotControlTab } from '../src/components/robotControlTabs.ts';

test('initial motion tab follows the mode already applied by PLC', () => {
  assert.equal(initialRobotControlTab(false, true), 'jog');
  assert.equal(initialRobotControlTab(false, false), 'position');
  assert.equal(initialRobotControlTab(true, false), 'diagnostics');
});

test('visible motion tab follows external PLC mode changes', () => {
  assert.equal(reconcileRobotControlTab('jog', false, false), 'position');
  assert.equal(reconcileRobotControlTab('position', false, true), 'jog');
});

test('interface changes cannot leave an incompatible motion tab visible', () => {
  assert.equal(reconcileRobotControlTab('jog', true, true), 'diagnostics');
  assert.equal(reconcileRobotControlTab('diagnostics', false, false), 'position');
  assert.equal(reconcileRobotControlTab('registers', false, true), 'jog');
});

test('non-motion tabs remain selected when PLC motion mode changes', () => {
  assert.equal(reconcileRobotControlTab('points', false, true), 'points');
  assert.equal(reconcileRobotControlTab('grippers', false, false), 'grippers');
});
