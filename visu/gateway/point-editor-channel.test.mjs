import assert from 'node:assert/strict';
import test from 'node:test';
import { PointEditorChannel } from './point-editor-channel.mjs';

const point = x => ({ x, y: 471.7284, z: 1280.804, magazineSafeZ: -300, magazineChangeZ: 0, speedFactor: 1, configured: false });

test('serializes editor command until the exact PLC sequence is acknowledged', async () => {
  let now = 0;
  let ack = 0;
  const channel = new PointEditorChannel({
    ack: () => ack,
    readResult: async () => ({ result: 1, sequence: 7, index: 13, point: point(1) }),
    now: () => now,
    pause: async () => { now += 40; ack = 7; },
  });
  const message = { index: 13, command: 'robot.point.capture' };
  const requestId = await channel.run(message, async (target) => { target._pointEditorSequence = 7; return 'request-7'; });
  assert.equal(requestId, 'request-7');
  assert.deepEqual(message._pointEditorResult, point(1));
  assert.deepEqual(message._pointEditorReply, { sequence: 7, index: 13, command: 'robot.point.capture', point: point(1) });
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
      return { result: 1, sequence: ack, index: 13, point: point(readCount) };
    },
  });

  const first = channel.run({ index: 13, command: 'robot.point.save' }, async (target) => {
    target._pointEditorSequence = 7;
    ack = 7;
    return 'request-7';
  });
  await firstReadStarted;

  let secondExecuted = false;
  const secondMessage = { index: 13, command: 'robot.point.save' };
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
    readResult: async () => ({ result: 1, sequence: 9, index: 13, point: point(1) }),
    now: () => now,
    timeoutMs: 80,
    pause: async () => { now += 40; },
  });
  await assert.rejects(channel.run({ index: 13, command: 'robot.point.save' }, async (target) => { target._pointEditorSequence = 9; return 'request-9'; }), /не подтвердил/);
  await assert.rejects(channel.run({ index: 13, command: 'robot.point.save' }, async () => 'request-10'), /предыдущей команды/);
  ack = 9;
  const next = { index: 13, command: 'robot.point.save' };
  await channel.run(next, async (target) => { target._pointEditorSequence = 9; return 'recovered'; });
  assert.equal(next._pointEditorConfirmed, true);
});

test('stale sequence or another point cannot be returned as this command result', async () => {
  for (const result of [{ sequence: 6, index: 13 }, { sequence: 7, index: 14 }]) {
    const message = { index: 13, command: 'robot.point.capture' };
    const channel = new PointEditorChannel({ ack: () => 7, readResult: async () => ({ ...result, result: 1, point: point(3030) }) });
    await assert.rejects(channel.run(message, async target => { target._pointEditorSequence = 7; return 'request'; }), /не соответствует/);
    assert.equal(message._pointEditorReply, undefined);
    assert.equal(message._pointEditorResult, undefined);
  }
});

test('failed SAVE and invalid point values never publish a successful point reply', async () => {
  for (const result of [{ result: 2, reason: 'Запись запрещена PLC', point: point(3030) },
    { result: 1, point: { ...point(8000), x: Number.NaN } }]) {
    const message = { index: 13, command: 'robot.point.save' };
    const channel = new PointEditorChannel({ ack: () => 7, readResult: async () => ({ sequence: 7, index: 13, ...result }) });
    await assert.rejects(channel.run(message, async target => { target._pointEditorSequence = 7; return 'request'; }), /Запись запрещена|недостоверные/);
    assert.equal(message._pointEditorReply, undefined);
    assert.equal(message._pointEditorConfirmed, true);
  }
});
