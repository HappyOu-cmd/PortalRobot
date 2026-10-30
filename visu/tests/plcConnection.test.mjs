import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: join(tmpdir(), 'portal-connection-tests'), server: { middlewareMode: true, watch: null },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { createPlcClient, clearRecoveredConnectionError } = await server.ssrLoadModule('/src/plc/client.ts');

function fixture(t, clearOnRecovery = false) {
  const sockets = [], intervals = new Map(), timeouts = new Map();
  const errors = [], connections = [], snapshots = [];
  let timerId = 0, error = '';
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    send(payload) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(payload)); }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const browser = {
    WebSocket: FakeWebSocket,
    location: { protocol: 'http:', host: '127.0.0.1:5173', hostname: '127.0.0.1' },
    window: {
      setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; },
      clearInterval(id) { intervals.delete(id); },
      setTimeout(callback) { const id = ++timerId; timeouts.set(id, callback); return id; },
      clearTimeout(id) { timeouts.delete(id); },
    },
  };
  const descriptors = Object.fromEntries(Object.keys(browser).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(browser)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const client = createPlcClient({
    onConnection(info) {
      connections.push(info);
      if (clearOnRecovery) error = clearRecoveredConnectionError(error, info.status);
    },
    onSnapshot(values, changed, full) { snapshots.push({ values: { ...values }, changed, full }); },
    onCommandError(message) { error = message; errors.push(message); },
  });
  t.after(() => {
    client.close();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    client, sockets, errors, connections, snapshots,
    get error() { return error; },
    heartbeat() { for (const callback of intervals.values()) callback(); },
    reconnect() {
      const pending = [...timeouts.values()]; timeouts.clear();
      for (const callback of pending) callback();
    },
  };
}

test('background heartbeat failures never become operator command errors', (t) => {
  const f = fixture(t), socket = f.sockets[0];
  socket.open();
  assert.equal(socket.sent[0].command, 'hmi.heartbeat');
  socket.receive({ type: 'ack', requestId: socket.sent[0].requestId, ok: false, error: 'OPC UA не подключён' });
  assert.deepEqual(f.errors, []);
  for (const ok of [true, false, false]) {
    f.heartbeat();
    const request = socket.sent.at(-1);
    socket.receive({ type: 'ack', requestId: request.requestId, ok, error: 'OPC UA не подключён' });
  }
  f.client.send({ command: 'io.heartbeat', value: 1 });
  socket.receive({ type: 'ack', requestId: socket.sent.at(-1).requestId, ok: false, error: 'OPC UA не подключён' });
  assert.deepEqual(f.errors, []);
});

test('OPC UA recovery clears its connection error on the same WebSocket and accepts fresh snapshots', (t) => {
  const f = fixture(t, true), socket = f.sockets[0];
  socket.open();
  for (const status of ['connected', 'degraded']) {
    socket.receive({ type: 'connection', status: 'disconnected' });
    f.client.send({ command: 'cell.reset', value: true });
    socket.receive({ type: 'ack', requestId: socket.sent.at(-1).requestId, ok: false, error: 'OPC UA не подключён' });
    assert.equal(f.error, 'OPC UA не подключён');
    socket.receive({ type: 'connection', status: 'connecting' });
    assert.equal(f.error, 'OPC UA не подключён');
    socket.receive({ type: 'connection', status });
    assert.equal(f.error, '');
    socket.receive({ type: 'snapshot', full: true, values: { udiPlcHeartbeat: 10 } });
    socket.receive({ type: 'snapshot', full: false, values: { udiPlcHeartbeat: 11 } });
    assert.equal(f.snapshots.at(-1).values.udiPlcHeartbeat, 11);
  }
  assert.equal(f.sockets.length, 1);
  assert.equal(socket.sent.filter(message => message.command === 'cell.reset').length, 2);
});

test('only connection errors clear on recovery; operator rejections and unknown results remain visible', () => {
  const connectionErrors = [
    'OPC UA не подключён', 'OPC UA не подключен', 'Нет связи со шлюзом', 'Нет связи с PLC',
    'Управление ячейкой недоступно без связи с PLC', 'Сброс недоступен без связи с PLC',
    'Переключение режима недоступно без связи с PLC', 'Управление роботом недоступно без связи с PLC',
    'Экспорт циклограммы недоступен: нет связи со шлюзом',
  ];
  for (const status of ['connected', 'degraded']) {
    for (const message of connectionErrors) assert.equal(clearRecoveredConnectionError(message, status), '');
    for (const message of ['', 'PLC отклонил команду', 'Сначала остановите обмен палет',
      'Нет подтверждения PLC: результат команды неизвестен', 'Тег не опубликован: udiHmiHeartbeat']) {
      assert.equal(clearRecoveredConnectionError(message, status), message);
    }
  }
  for (const status of ['connecting', 'disconnected']) {
    for (const message of connectionErrors) assert.equal(clearRecoveredConnectionError(message, status), message);
  }
});

test('late failed heartbeat ACKs after recovery preserve a real command rejection', (t) => {
  const f = fixture(t, true), socket = f.sockets[0];
  socket.open();
  const heartbeat = socket.sent[0];
  f.client.send({ command: 'cell.reset', value: true });
  socket.receive({ type: 'ack', requestId: socket.sent.at(-1).requestId, ok: false, error: 'PLC отклонил команду' });
  socket.receive({ type: 'connection', status: 'connected' });
  socket.receive({ type: 'ack', requestId: heartbeat.requestId, ok: false, error: 'OPC UA не подключён' });
  assert.equal(f.error, 'PLC отклонил команду');
  assert.deepEqual(f.errors, ['PLC отклонил команду']);
});

test('WebSocket recovery clears a transport error without replaying the operator command', (t) => {
  const f = fixture(t, true), first = f.sockets[0];
  first.open();
  f.client.send({ command: 'cell.reset', value: true });
  first.close();
  assert.equal(f.client.send({ command: 'cell.reset', value: true }), false);
  assert.equal(f.error, 'Нет связи со шлюзом');
  f.reconnect();
  const second = f.sockets[1];
  second.open();
  second.receive({ type: 'connection', status: 'connected' });
  assert.equal(f.error, '');
  assert.equal(first.sent.filter(message => message.command === 'cell.reset').length, 1);
  assert.deepEqual(second.sent.map(message => message.command), ['hmi.heartbeat']);
});
