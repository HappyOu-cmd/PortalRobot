import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthStore, AuthStoreError } from './auth-store.mjs';

const createStore = () => new AuthStore({ databasePath: ':memory:', now: () => 1_000_000 });

test('creates bootstrap admin and authenticates with a server session', () => {
  const store = createStore();
  const [admin] = store.listUsers();
  assert.equal(admin.username, 'admin');
  assert.equal(admin.role, 'admin');
  assert.equal(admin.shiftPlan, 0);
  assert.equal(admin.mustChangePassword, true);
  const login = store.login('ADMIN', 'admin');
  assert.equal(login.user.id, admin.id);
  assert.equal(store.getSession(login.token)?.user.username, 'admin');
  assert.equal(store.logout(login.token), true);
  assert.equal(store.getSession(login.token), null);
  store.close();
});

test('creates, updates, disables and deletes managed users', () => {
  const store = createStore();
  const admin = store.listUsers()[0];
  const operator = store.createUser({ username: 'operator.1', displayName: 'Оператор 1', password: 'strong-pass', role: 'operator', shiftPlan: 120 });
  assert.equal(operator.shiftPlan, 120);
  assert.equal(store.login('operator.1', 'strong-pass').user.displayName, 'Оператор 1');
  const updated = store.updateUser(operator.id, { displayName: 'Оператор смены', enabled: false, shiftPlan: 150 });
  assert.equal(updated.enabled, false);
  assert.equal(updated.shiftPlan, 150);
  assert.throws(() => store.login('operator.1', 'strong-pass'), (error) => error instanceof AuthStoreError && error.status === 401);
  assert.equal(store.deleteUser(operator.id, admin.id).username, 'operator.1');
  assert.equal(store.getUser(operator.id), null);
  store.close();
});

test('stores a cropped profile avatar and rejects invalid image payloads', () => {
  const store = createStore();
  const avatarDataUrl = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAABwAgCdASoBAAEAAUAmJaQAA3AA/vuUAAA=';
  const operator = store.createUser({
    username: 'operator.avatar', displayName: 'Оператор с фото', password: 'strong-pass', role: 'operator', avatarDataUrl,
  });
  assert.equal(operator.avatarDataUrl, avatarDataUrl);
  assert.equal(store.updateUser(operator.id, { avatarDataUrl: null }).avatarDataUrl, null);
  assert.throws(() => store.updateUser(operator.id, { avatarDataUrl: 'data:text/html;base64,PGgxPk5ldDwvaDE+' }), /PNG, JPEG или WebP/);
  store.close();
});

test('protects current user and the last active administrator', () => {
  const store = createStore();
  const admin = store.listUsers()[0];
  assert.throws(() => store.deleteUser(admin.id, admin.id), /собственную/);
  assert.throws(() => store.updateUser(admin.id, { enabled: false }), /последнего активного/);
  const secondAdmin = store.createUser({ username: 'admin.2', displayName: 'Второй администратор', password: 'strong-pass', role: 'admin' });
  assert.equal(store.updateUser(admin.id, { enabled: false }).enabled, false);
  assert.throws(() => store.updateUser(secondAdmin.id, { role: 'operator' }), /последнего активного/);
  store.close();
});

test('rejects duplicate usernames and weak managed passwords', () => {
  const store = createStore();
  store.createUser({ username: 'worker', displayName: 'Работник', password: 'strong-pass', role: 'operator' });
  assert.throws(() => store.createUser({ username: 'WORKER', displayName: 'Дубль', password: 'strong-pass', role: 'operator' }), /уже существует/);
  assert.throws(() => store.createUser({ username: 'worker2', displayName: 'Работник', password: '123', role: 'operator' }), /8 до 128/);
  assert.throws(() => store.createUser({ username: 'worker3', displayName: '123456789012345678901', password: 'strong-pass', role: 'operator' }), /1 до 20/);
  assert.throws(() => store.updateUser(store.listUsers()[0].id, { shiftPlan: -1 }), /План на смену/);
  store.close();
});
