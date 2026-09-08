import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import WebSocket from 'ws';
import { AuthStore } from './auth-store.mjs';

test('real gateway + Vite: mobile login survives HMI account switches with another admin tab open', { timeout: 30_000 }, async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const temporary = mkdtempSync(join(tmpdir(), 'portal-mobile-login-test-'));
  const sockets = [];
  let gateway;
  let gatewayExit;
  let vite;
  try {
    const authPath = join(temporary, 'auth.sqlite');
    const auth = new AuthStore({ databasePath: authPath });
    auth.createUser({ username: 'paola', displayName: 'Паола', role: 'operator', password: 'test-pass' });
    auth.close();
    const reservation = createTcpServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const gatewayPort = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const target = `http://127.0.0.1:${gatewayPort}`;
    gateway = spawn(process.execPath, ['gateway/server.mjs'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, GATEWAY_HOST: '127.0.0.1', GATEWAY_PORT: String(gatewayPort),
        // No connection to the live PLC; every database belongs to this test.
        OPCUA_ENDPOINT: 'opc.tcp://127.0.0.1:1',
        AUTH_DB_PATH: authPath, CELL_EVENTS_DB_PATH: join(temporary, 'events.sqlite'),
        CYCLOGRAM_DB_PATH: join(temporary, 'cyclogram.sqlite'),
        STATISTICS_DB_PATH: join(temporary, 'statistics.sqlite'), TEST_DB_PATH: join(temporary, 'tests.sqlite'),
        POINT_BACKUP_DIR: join(temporary, 'backups'),
      },
    });
    gatewayExit = once(gateway, 'exit');
    let gatewayStderr = '';
    gateway.stderr.on('data', (data) => { gatewayStderr = `${gatewayStderr}${data}`.slice(-4000); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Test gateway did not start${gatewayStderr ? `:\n${gatewayStderr}` : ''}`)), 10_000);
      const finish = (error) => { clearTimeout(timeout); error ? reject(error) : resolve(); };
      gateway.once('error', finish);
      gateway.stdout.on('data', (data) => { if (data.toString().includes('[Gateway]')) finish(); });
      gatewayExit.then(([code, signal]) => finish(new Error(`Test gateway exited (${code ?? signal})${gatewayStderr ? `:\n${gatewayStderr}` : ''}`)));
    });
    vite = await createViteServer({
      root, configFile: join(root, 'vite.config.ts'), logLevel: 'silent',
      server: {
        host: '127.0.0.1', port: 0, open: false,
        proxy: { '/api': { target }, '/ws': { target } },
      },
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const request = async (path, { cookie = '', body, phone = false } = {}) => {
      const response = await fetch(`${origin}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Cookie: cookie, 'Content-Type': 'application/json',
          'User-Agent': phone ? 'Mozilla/5.0 (Android) Mobile' : 'PortalRobot desktop integration test',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      assert.equal(response.status, 200, data.error);
      return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie };
    };
    const loginHmi = async (username) => {
      const result = await request('/api/auth/login', { body: { username, password: username === 'admin' ? 'admin' : 'test-pass' } });
      const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws`, { headers: { Cookie: result.cookie } });
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('HMI socket did not authenticate')), 5000);
        socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
        socket.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type !== 'connection') return;
          clearTimeout(timeout);
          if (message.readOnly) reject(new Error('Proxy lost the HMI auth cookie'));
          else resolve();
        });
      });
      return result;
    };
    await loginHmi('admin'); // Old observer stays connected for the whole scenario.
    let main = await loginHmi('admin');
    let view = await request('/api/mobile-points/session', { phone: true });
    assert.equal(view.data.cellUser?.username, 'admin');
    const oldPhone = await request('/api/mobile-points/login', { phone: true, body: { username: 'admin', password: 'admin' } });

    await request('/api/auth/logout', { cookie: main.cookie, body: {} });
    view = await request('/api/mobile-points/session', { phone: true, cookie: oldPhone.cookie });
    assert.equal(view.data.authenticated, false);
    assert.equal(view.data.cellUser, null);
    main = await loginHmi('paola');
    view = await request('/api/mobile-points/session', { phone: true });
    assert.equal(view.data.cellUser?.username, 'paola');
    const operatorPhone = await request('/api/mobile-points/login', { phone: true, body: { username: 'paola', password: 'test-pass' } });
    assert.equal(operatorPhone.data.authenticated, true);

    await request('/api/auth/logout', { cookie: main.cookie, body: {} });
    await loginHmi('admin');
    view = await request('/api/mobile-points/session', { phone: true, cookie: operatorPhone.cookie });
    assert.equal(view.data.authenticated, false);
    assert.equal(view.data.cellUser?.username, 'admin');
    const newPhone = await request('/api/mobile-points/login', { phone: true, body: { username: 'admin', password: 'admin' } });
    assert.equal(newPhone.data.authenticated, true);
  } finally {
    for (const socket of sockets) socket.terminate();
    if (vite) await vite.close();
    if (gateway && gateway.exitCode === null) gateway.kill();
    if (gatewayExit) await gatewayExit;
    // Exact directory returned by mkdtempSync above; contains only test fixtures.
    rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
