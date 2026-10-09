import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeHeartbeat } from './runtime-diagnostics.mjs';

test('STOP is suspected only after a readable counter fails to advance', () => {
  const heartbeat = new RuntimeHeartbeat(4_000);
  assert.equal(heartbeat.snapshot(0).mode, 'unknown');
  assert.equal(heartbeat.observe(4334, 1_000).mode, 'verifying');
  assert.equal(heartbeat.observe(4334, 4_999).mode, 'verifying');
  assert.equal(heartbeat.observe(4334, 5_000).mode, 'stalled');
  assert.equal(heartbeat.observe(4335, 5_100).mode, 'running');
  assert.equal(heartbeat.observe(4335, 9_100).mode, 'stalled');
});

test('counter wrap, invalid reads and reconnects do not fabricate RUN', () => {
  const heartbeat = new RuntimeHeartbeat(4_000);
  heartbeat.observe(0xffff_ffff, 1_000);
  assert.equal(heartbeat.observe(0, 2_000).mode, 'running');
  assert.equal(heartbeat.observe(undefined, 3_000).mode, 'unknown');
  assert.equal(heartbeat.observe(12, 4_000).mode, 'verifying');
  heartbeat.reset();
  assert.equal(heartbeat.snapshot(5_000).mode, 'unknown');
});
