import assert from 'node:assert/strict';
import test from 'node:test';
import { PointEditorChannel } from './point-editor-channel.mjs';

test('serializes editor command until the exact PLC sequence is acknowledged', async () => {
  let now = 0;
  let ack = 0;
  const channel = new PointEditorChannel({
    ack: () => ack,
    readResult: async () => ({ result: 1, point: { x: 1 } }),
    now: () => now,
    pause: async () => { now += 40; ack = 7; },
  });
  const message = {};
  const requestId = await channel.run(message, async (target) => { target._pointEditorSequence = 7; return 'request-7'; });
  assert.equal(requestId, 'request-7');
  assert.deepEqual(message._pointEditorResult, { x: 1 });
});

test('waits for result read when the next import command arrives after PLC ack', async () => {
  let ack = 0;
  let finishFirstRead;
  let signalFirstRead;
  let readCount = 0;
  const firstReadStarted = new Promise((resolve) => { signalFirstRead = resolve; });
  const firstReadGate = new Promise((resolve) => { finishFirstRead = resolve; });
  const channel = new PointEditorChannel({
    ack: () => ack,
    readResult: async () => {
      readCount += 1;
      if (readCount === 1) {
        signalFirstRead();
        await firstReadGate;
      }
      return { result: 1, point: { x: readCount } };
    },
  });

  const first = channel.run({}, async (target) => {
    target._pointEditorSequence = 7;
    ack = 7;
    return 'request-7';
  });
  await firstReadStarted;

  let secondExecuted = false;
  const secondMessage = {};
  const second = channel.run(secondMessage, async (target) => {
    secondExecuted = true;
    target._pointEditorSequence = 8;
    ack = 8;
    return 'request-8';
  });
  await Promise.resolve();
  assert.equal(secondExecuted, false);

  finishFirstRead();
  assert.equal(await first, 'request-7');
  assert.equal(await second, 'request-8');
  assert.equal(secondMessage._pointEditorConfirmed, true);
});

test('ambiguous timeout blocks a new writer until the previous PLC ack arrives', async () => {
  let now = 0;
  let ack = 0;
  const channel = new PointEditorChannel({
    ack: () => ack,
    readResult: async () => ({ result: 1, point: {} }),
    now: () => now,
    timeoutMs: 80,
    pause: async () => { now += 40; },
  });
  await assert.rejects(channel.run({}, async (target) => { target._pointEditorSequence = 9; return 'request-9'; }), /не подтвердил/);
  await assert.rejects(channel.run({}, async () => 'request-10'), /предыдущей команды/);
  ack = 9;
  const next = {};
  await channel.run(next, async (target) => { target._pointEditorSequence = 9; return 'recovered'; });
  assert.equal(next._pointEditorConfirmed, true);
});
