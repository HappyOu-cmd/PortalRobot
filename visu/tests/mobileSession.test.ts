import assert from 'node:assert/strict';
import test from 'node:test';
import { watchMobileSession, type MobileSession } from '../src/mobile/session.ts';

const admin = { id: 1, username: 'admin', displayName: 'Admin', role: 'admin' };
const operator = { id: 2, username: 'paola', displayName: 'Паола', role: 'operator' };

test('login screen follows admin -> no HMI -> operator -> fresh mobile login without reload', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let server: MobileSession = { authenticated: false, user: null, cellUser: admin };
  const seen: MobileSession[] = [];
  const monitor = watchMobileSession({ read: async () => server, onSession: (value) => seen.push(value), onError: assert.fail });
  t.after(() => monitor.stop());
  await monitor.refresh();
  assert.equal(seen.at(-1)?.cellUser?.username, 'admin');
  monitor.replace({ authenticated: true, user: admin, cellUser: admin });

  server = { authenticated: false, user: null, cellUser: null };
  t.mock.timers.tick(1000);
  await monitor.refresh();
  assert.equal(seen.at(-1)?.authenticated, false);
  server = { authenticated: false, user: null, cellUser: operator };
  t.mock.timers.tick(1000);
  await monitor.refresh();
  assert.equal(seen.at(-1)?.cellUser?.username, 'paola');
  monitor.replace({ authenticated: true, user: operator, cellUser: operator });
  assert.equal(seen.at(-1)?.user?.username, 'paola');
});

test('late unauthenticated response cannot undo a successful mobile login', async (t) => {
  let resolve!: (value: MobileSession) => void;
  const pending = new Promise<MobileSession>((done) => { resolve = done; });
  const seen: MobileSession[] = [];
  const monitor = watchMobileSession({ read: () => pending, onSession: (value) => seen.push(value), onError: assert.fail });
  t.after(() => monitor.stop());
  const initial = monitor.refresh();
  monitor.replace({ authenticated: true, user: operator, cellUser: operator });
  resolve({ authenticated: false, user: null, cellUser: null });
  await initial;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].authenticated, true);
});

test('late authenticated response cannot undo logout', async (t) => {
  let resolve!: (value: MobileSession) => void;
  const pending = new Promise<MobileSession>((done) => { resolve = done; });
  const seen: MobileSession[] = [];
  const monitor = watchMobileSession({ read: () => pending, onSession: (value) => seen.push(value), onError: assert.fail });
  t.after(() => monitor.stop());
  const initial = monitor.refresh();
  monitor.replace({ authenticated: false, user: null, cellUser: operator });
  resolve({ authenticated: true, user: admin, cellUser: admin });
  await initial;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].authenticated, false);
});

test('session polling retries after network failure and stops after unmount', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  const errors: unknown[] = [];
  const seen: MobileSession[] = [];
  const monitor = watchMobileSession({
    read: async () => {
      calls += 1;
      if (calls === 1) throw new Error('network offline');
      return { authenticated: false, user: null, cellUser: operator };
    },
    onSession: (value) => seen.push(value), onError: (error) => errors.push(error),
  });
  t.after(() => monitor.stop());
  await monitor.refresh();
  assert.equal(errors.length, 1);
  t.mock.timers.tick(1000);
  await monitor.refresh();
  assert.equal(seen.at(-1)?.cellUser?.username, 'paola');
  monitor.stop();
  t.mock.timers.tick(3000);
  await monitor.refresh();
  assert.equal(calls, 2);
});
