import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthStore } from './auth-store.mjs';
import { PrimaryHmiSession } from './primary-hmi-session.mjs';
import { MobilePointsService } from './mobile-points.mjs';

const fixture = (t) => {
  let now = 1_000_000;
  const auth = new AuthStore({ databasePath: ':memory:', now: () => now });
  t.after(() => auth.close());
  auth.createUser({ username: 'paola', displayName: 'Паола', role: 'operator', password: 'test-pass' });
  const primary = new PrimaryHmiSession((token) => auth.getSession(token));
  const sockets = new Set();
  const login = (username = 'admin') => {
    now += 1000;
    const session = auth.login(username, username === 'admin' ? 'admin' : 'test-pass');
    primary.select(session.token, session);
    return session;
  };
  const connect = (session, extra = {}) => {
    const socket = { OPEN: 1, readyState: 1, authToken: session.token, isGuest: false, ...extra };
    sockets.add(socket);
    return socket;
  };
  return { auth, primary, sockets, login, connect, now: () => now, current: () => primary.current(sockets) };
};

test('relogin works while another admin HMI stays open, including the same account', (t) => {
  const f = fixture(t);
  const observer = f.login();
  f.connect(observer);
  const main = f.login();
  f.connect(main);
  assert.equal(f.current()?.token, main.token);

  f.auth.logout(main.token);
  const operator = f.login('paola');
  assert.equal(f.current(), null, 'new login waits for its own authenticated HMI socket');
  f.connect(operator);
  assert.equal(f.current()?.user.username, 'paola');
  assert.equal(f.auth.getSession(observer.token)?.user.username, 'admin', 'observer was not logged out');

  f.auth.logout(operator.token);
  const adminAgain = f.login();
  f.connect(adminAgain);
  assert.equal(f.current()?.token, adminAgain.token);
});

test('restart restores the most recent login, independent of socket order and last seen', (t) => {
  const f = fixture(t);
  const old = f.login();
  const recent = f.login('paola');
  f.connect(recent);
  f.connect(old);
  f.auth.getSession(old.token);
  const restarted = new PrimaryHmiSession((token) => f.auth.getSession(token));
  assert.equal(restarted.current(f.sockets)?.token, recent.token);
  assert.equal(f.auth.getSession(recent.token)?.createdAt, recent.createdAt);
});

test('closing or revoking the current HMI never promotes an older observer', (t) => {
  const f = fixture(t);
  f.connect(f.login());
  const recent = f.login('paola');
  const socket = f.connect(recent);
  assert.equal(f.current()?.token, recent.token);
  socket.readyState = 3;
  assert.equal(f.current(), null);
  f.connect(recent);
  assert.equal(f.current()?.token, recent.token);
  f.auth.logout(recent.token);
  assert.equal(f.current(), null);
});

test('guests and closed sockets cannot establish a primary HMI', (t) => {
  const f = fixture(t);
  const login = f.login();
  f.connect(login, { isGuest: true });
  f.connect(login, { readyState: 3 });
  assert.equal(f.current(), null);
});

test('HMI account switch invalidates the phone, stops its JOG and allows a fresh login', async (t) => {
  const f = fixture(t);
  const stopped = [];
  const mobile = new MobilePointsService({
    authenticate: (username, password) => f.auth.authenticate(username, password),
    primary: f.current,
    snapshot: () => ({ phoneSpeedLimitPercent: 10, robot: { speedOverridePercent: 10 } }),
    execute: async () => {}, heartbeat: async () => {}, stop: async () => {},
    motionHeartbeat: async () => {}, motionActive: async () => {},
    stopRobot: async (owner) => { stopped.push(owner.activeJog); }, now: f.now,
  });
  f.connect(f.login());
  const oldPhone = mobile.login('admin', 'admin');
  await mobile.action(oldPhone.token, { action: 'robot', command: 'robot.axis.jog', machine: 1, direction: 'positive', value: true, leaseId: 'account-switch-jog-1' });

  const operator = f.login('paola');
  await mobile.tick();
  assert.deepEqual(stopped, [{ axis: 1, direction: 'positive' }]);
  assert.equal(mobile.getSession(oldPhone.token), null);
  assert.equal(mobile.sessionView(null).cellUser, null);
  f.connect(operator);
  assert.equal(mobile.sessionView(null).cellUser.username, 'paola');
  assert.throws(() => mobile.login('admin', 'admin'), /аккаунт/);
  const newPhone = mobile.login('paola', 'test-pass');
  assert.equal(mobile.getSession(newPhone.token)?.user.username, 'paola');
  await assert.rejects(mobile.state(oldPhone.token), /Сессия/);
});
