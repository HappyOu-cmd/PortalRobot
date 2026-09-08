import assert from 'node:assert/strict';
import test from 'node:test';
import { MobilePointsService, isPhoneAgent } from './mobile-points.mjs';

const user = (id, username = `user${id}`) => ({ id, username, displayName: `User ${id}`, role: 'operator' });
const fixture = () => {
  let now = 1_000_000;
  let primary = { token: 'primary-token', user: user(1), expiresAt: now + 100_000 };
  let stopped = 0;
  let heartbeat = 0;
  let motionHeartbeat = 0;
  const motionActive = [];
  const commands = [];
  const plc = { active: false, runSeq: 0, checkState: 0, phoneSpeedLimitPercent: 10,
    robot: { speedOverridePercent: 80 }, axes: [{ busy: false }, { busy: false }, { busy: false }] };
  const service = new MobilePointsService({
    authenticate: (username, password) => {
      if (password !== 'correct') throw new Error('bad credentials');
      return username === 'user1' ? user(1) : user(2);
    },
    primary: () => primary,
    snapshot: () => ({ ...plc }),
    execute: async (message) => { commands.push(message); message._assertAuthorized?.(); message._pointEditorSequence = 41; message._pointEditorResult = { x: 1, y: 2, z: 3, speedFactor: 0.5, configured: true }; },
    heartbeat: async () => { heartbeat += 1; },
    motionHeartbeat: async () => { motionHeartbeat += 1; },
    motionActive: async (active) => { motionActive.push(active); },
    stop: async () => { stopped += 1; },
    stopRobot: async ({ activeJog } = {}) => {
      if (activeJog) commands.push({ command: 'robot.axis.jog', machine: activeJog.axis, direction: activeJog.direction, value: false });
      commands.push({ command: 'robot.stop' });
    },
    now: () => now,
  });
  return { service, plc, commands, motionActive,
    get stopped() { return stopped; }, get heartbeat() { return heartbeat; },
    get motionHeartbeat() { return motionHeartbeat; },
    advance: (ms) => { now += ms; }, setPrimary: (value) => { primary = value; } };
};

test('recognizes phone user agents without classifying ordinary desktop HMI', () => {
  assert.equal(isPhoneAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), true);
  assert.equal(isPhoneAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), true);
  assert.equal(isPhoneAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile'), true);
  assert.equal(isPhoneAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
});

test('mobile login requires the exact account of the active cell HMI', () => {
  const value = fixture();
  assert.throws(() => value.service.login('user2', 'correct'), /аккаунт/);
  const login = value.service.login('user1', 'correct');
  assert.equal(login.user.id, 1);
  assert.equal(value.service.getSession(login.token)?.user.username, 'user1');
});

test('mobile session dies when its parent HMI session changes', () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  value.setPrimary({ token: 'other-token', user: user(1), expiresAt: 2_000_000 });
  assert.equal(value.service.getSession(login.token), null);
});

test('check has one owner and stale phone triggers point-check stop', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  const { holdId } = await value.service.action(login.token, { action: 'prepareCheck' });
  const result = await value.service.action(login.token, { action: 'check', holdId, index: 1, draft: { x: 1, y: 2, z: 3, speedFactor: 0.5 } });
  assert.equal(result.sequence, 41);
  assert.equal(value.heartbeat > 0, true);
  value.plc.active = true;
  value.plc.runSeq = 41;
  value.advance(1600);
  await value.service.tick();
  assert.equal(value.stopped, 1);
  assert.equal(value.service.owner?.cancelled, true);
});

const prepareCheck = async (value) => {
  const { token } = value.service.login('user1', 'correct');
  const { holdId } = await value.service.action(token, { action: 'prepareCheck' });
  const start = () => value.service.action(token, { action: 'check', holdId, index: 10,
    draft: { x: 1, y: 2, z: 3, speedFactor: 0.5 } });
  return { token, holdId, start };
};

test('telemetry polls cannot sustain a check without fresh hold packets', async () => {
  const value = fixture();
  const { token, start } = await prepareCheck(value);
  await start();
  const heartbeat = value.heartbeat;
  for (let poll = 0; poll < 4; poll += 1) {
    value.advance(400);
    await value.service.state(token);
    await value.service.tick();
  }
  assert.equal(value.heartbeat, heartbeat);
  assert.equal(value.stopped, 1);
});

test('fresh hold packets renew only their owner; release and late packets cannot restart it', async () => {
  const value = fixture();
  const { token, holdId, start } = await prepareCheck(value);
  await start();
  for (let pulse = 0; pulse < 8; pulse += 1) {
    value.advance(300);
    await value.service.action(token, { action: 'holdCheck', holdId });
    await value.service.tick();
  }
  assert.equal(value.stopped, 0);
  assert.equal(value.heartbeat, 9);
  const other = value.service.login('user1', 'correct').token;
  await assert.rejects(value.service.action(other, { action: 'holdCheck', holdId }));
  await value.service.action(token, { action: 'stop', holdId });
  await assert.rejects(value.service.action(token, { action: 'holdCheck', holdId }));
  assert.equal(value.stopped, 1);
});

test('release overtaking start cancels prepared id without executing any motion', async () => {
  const value = fixture();
  const { token, holdId, start } = await prepareCheck(value);
  await value.service.action(token, { action: 'stop', holdId });
  await assert.rejects(start(), /удержание/);
  assert.equal(value.commands.length, 0);
});

test('stop bypasses a pending check acknowledgement and repeats after late acceptance', async () => {
  const value = fixture();
  const { token, holdId, start } = await prepareCheck(value);
  let acknowledge;
  const execute = value.service.execute;
  value.service.execute = async (message) => {
    await execute(message);
    await new Promise((resolve) => { acknowledge = resolve; });
  };
  const pending = start();
  await new Promise(setImmediate);
  assert.equal(value.service.busy, true);
  await value.service.action(token, { action: 'stop', holdId });
  assert.equal(value.stopped, 1);
  value.advance(250);
  await value.service.tick();
  assert.equal(value.stopped, 2);
  acknowledge();
  await pending;
  assert.equal(value.stopped, 3);
});

test('lease expiration during command startup is not hidden by busy or late heartbeat', async () => {
  const value = fixture();
  const { token, holdId, start } = await prepareCheck(value);
  let finish;
  value.service.execute = async (message) => {
    await new Promise((resolve) => { finish = resolve; });
    message._assertAuthorized();
  };
  const pending = start();
  const rejected = assert.rejects(pending, /отменён/);
  await new Promise(setImmediate);
  value.advance(1600);
  await value.service.state(token);
  await value.service.tick();
  assert.equal(value.stopped, 1);
  await assert.rejects(value.service.action(token, { action: 'holdCheck', holdId }));
  finish();
  await rejected;
});

test('completion requires the matching terminal PLC transaction, not coordinates or an idle sample', async () => {
  const value = fixture();
  const { token, start } = await prepareCheck(value);
  await start();
  Object.assign(value.plc, { active: false, runSeq: 40, checkState: 2 });
  await value.service.tick();
  assert.ok(value.service.owner);
  Object.assign(value.plc, { runSeq: 41, checkState: 1 });
  await value.service.tick();
  assert.ok(value.service.owner);
  Object.assign(value.plc, { checkState: 2 });
  await value.service.tick();
  assert.equal(value.service.owner, null);
  assert.equal((await value.service.state(token)).owned, false);
});

test('expired id and replayed check cannot launch a second motion', async () => {
  const value = fixture();
  const { token, holdId, start } = await prepareCheck(value);
  value.advance(1600);
  await assert.rejects(value.service.action(token, { action: 'holdCheck', holdId }));
  await assert.rejects(start());
  const next = await value.service.action(token, { action: 'prepareCheck' });
  await value.service.action(token, { action: 'check', holdId: next.holdId, index: 10 });
  Object.assign(value.plc, { active: false, runSeq: 41, checkState: 2 });
  await value.service.tick();
  await assert.rejects(value.service.action(token, { action: 'check', holdId: next.holdId, index: 10 }));
  assert.equal(value.commands.length, 1);
});

test('mobile endpoint rejects every action outside point editing allowlist', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  await assert.rejects(value.service.action(login.token, { action: 'cell.stop', index: 1 }), /мобильный пульт и редактор/);
});

test('emergency robot stop bypasses a busy mobile command queue', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  value.service.busy = true;
  await value.service.action(login.token, { action: 'robot', command: 'robot.stop' });
  assert.equal(value.commands.at(-1).command, 'robot.stop');
});

test('mobile JOG clamps speed to the phone limit and stops without dedicated hold heartbeat', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  const speed = await value.service.action(login.token, { action: 'robot', command: 'robot.speedOverride', value: 80 });
  assert.equal(speed.appliedValue, 10);
  assert.equal(value.commands.at(-1).value, 10);

  await value.service.action(login.token, { action: 'robot', command: 'robot.axis.jog', machine: 1, direction: 'positive', value: true, leaseId: 'jog-lease-00000001' });
  assert.equal(value.service.owner.type, 'jog');
  assert.deepEqual(value.service.owner.activeJog, { axis: 1, direction: 'positive' });
  assert.deepEqual(value.motionActive, [true]);
  // Telemetry remains alive, but it must not substitute for physical hold packets.
  value.advance(1600);
  await value.service.state(login.token);
  await value.service.tick();
  assert.equal(value.service.owner, null);
  assert.equal(value.commands.at(-2).value, false);
  assert.equal(value.commands.at(-1).command, 'robot.stop');
  assert.deepEqual(value.motionActive, [true, false]);
});

test('fresh JOG hold heartbeat sustains only its lease and release cannot be replayed', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  const leaseId = 'jog-lease-00000002';
  await value.service.action(login.token, { action: 'robot', command: 'robot.axis.jog', machine: 2, direction: 'negative', value: true, leaseId });
  for (let pulse = 0; pulse < 8; pulse += 1) {
    value.advance(300);
    await value.service.action(login.token, { action: 'motionHeartbeat', leaseId });
    await value.service.tick();
  }
  assert.equal(value.service.owner?.leaseId, leaseId);
  assert.equal(value.motionHeartbeat >= 9, true);
  await value.service.action(login.token, { action: 'motionStop', leaseId });
  assert.equal(value.service.owner, null);
  await assert.rejects(value.service.action(login.token, { action: 'robot', command: 'robot.axis.jog', machine: 2, direction: 'negative', value: true, leaseId }), /остановлена/);
});

test('JOG release overtaking a delayed OPC start repeats stop after the late write', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  const leaseId = 'jog-lease-race-0001';
  let finishStart;
  value.service.execute = async (message) => {
    if (message.command === 'robot.axis.jog' && message.value === true) {
      await new Promise((resolve) => { finishStart = resolve; });
    }
    value.commands.push(message);
  };
  const start = value.service.action(login.token, { action: 'robot', command: 'robot.axis.jog', machine: 1, direction: 'positive', value: true, leaseId });
  const rejected = assert.rejects(start, /отменён/);
  await new Promise(setImmediate);
  await value.service.action(login.token, { action: 'motionStop', leaseId });
  assert.equal(value.service.owner?.cancelled, true);
  finishStart();
  await rejected;
  assert.equal(value.service.owner, null);
  assert.equal(value.commands.at(-1).command, 'robot.stop');
  assert.equal(value.motionActive.at(-1), false);
});

test('step movement owns a mobile lease and is stopped when phone polling disappears', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  const leaseId = 'step-lease-0000001';
  await value.service.action(login.token, { action: 'robot', command: 'robot.axis.moveRelative', machine: 1, value: 100, leaseId });
  assert.equal(value.service.owner?.type, 'step');
  value.plc.axes[0].busy = true;
  await value.service.tick();
  value.advance(1600);
  await value.service.tick();
  assert.equal(value.service.owner, null);
  assert.equal(value.commands.at(-1).command, 'robot.stop');
  assert.deepEqual(value.motionActive, [true, false]);
});

test('completed step releases PLC lease without issuing stop', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  await value.service.action(login.token, { action: 'robot', command: 'robot.axis.moveRelative', machine: 3, value: -10, leaseId: 'step-lease-0000002' });
  value.plc.axes[2].busy = true;
  await value.service.tick();
  value.advance(400);
  await value.service.state(login.token);
  value.plc.axes[2].busy = false;
  await value.service.tick();
  assert.equal(value.service.owner, null);
  assert.notEqual(value.commands.at(-1).command, 'robot.stop');
  assert.deepEqual(value.motionActive, [true, false]);
});

test('step without a PLC busy edge is stopped before its lease is released', async () => {
  const value = fixture();
  const login = value.service.login('user1', 'correct');
  await value.service.action(login.token, { action: 'robot', command: 'robot.axis.moveRelative', machine: 2, value: 10, leaseId: 'step-lease-no-busy01' });
  value.advance(2100);
  await value.service.state(login.token);
  await value.service.tick();
  assert.equal(value.service.owner, null);
  assert.equal(value.commands.at(-1).command, 'robot.stop');
  assert.deepEqual(value.motionActive, [true, false]);
});
