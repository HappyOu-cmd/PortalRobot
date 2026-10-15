import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import WebSocket from 'ws';
import { AuthStore } from './auth-store.mjs';

test('real gateway + Vite: mobile login survives HMI account switches with another admin tab open', { timeout: 60_000 }, async (t) => {
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
    // A service is not a child test runner. Inherited child-v8 context redirects
    // its startup banner into the test protocol instead of ordinary stdout.
    const serviceEnvironment = { ...process.env };
    delete serviceEnvironment.NODE_TEST_CONTEXT;
    const gatewayStartedAt = performance.now();
    gateway = spawn(process.execPath, ['gateway/server.mjs'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...serviceEnvironment, GATEWAY_HOST: '127.0.0.1', GATEWAY_PORT: String(gatewayPort),
        // No connection to the live PLC; every database belongs to this test.
        OPCUA_ENDPOINT: 'opc.tcp://127.0.0.1:1',
        OPCUA_PKI_DIR: join(temporary, 'opcua-pki'),
        AUTH_DB_PATH: authPath, CELL_EVENTS_DB_PATH: join(temporary, 'events.sqlite'),
        GEOMETRY_DB_PATH: join(temporary, 'geometry.sqlite'),
        CYCLOGRAM_DB_PATH: join(temporary, 'cyclogram.sqlite'),
        STATISTICS_DB_PATH: join(temporary, 'statistics.sqlite'), TEST_DB_PATH: join(temporary, 'tests.sqlite'),
        ARCHIVE_POLICY_DB_PATH: join(temporary, 'archive-policy.sqlite'),
        POINT_BACKUP_DIR: join(temporary, 'backups'),
      },
    });
    gatewayExit = once(gateway, 'exit');
    let gatewayStdout = '', gatewayStderr = '';
    gateway.stdout.on('data', (data) => { gatewayStdout = `${gatewayStdout}${data}`.slice(-4000); });
    gateway.stderr.on('data', (data) => { gatewayStderr = `${gatewayStderr}${data}`.slice(-4000); });
    const gatewayOutput = () => `\nstdout:\n${gatewayStdout || '(empty)'}\nstderr:\n${gatewayStderr || '(empty)'}`;
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        gateway.off('error', onError);
        gateway.stdout.off('data', onOutput);
        error ? reject(error) : resolve();
      };
      const onError = (error) => finish(new Error(`Test gateway spawn failed: ${error.message}${gatewayOutput()}`));
      // The server emits this address only after HTTP listening. Accumulating
      // output also handles a readiness line split across stdout chunks.
      const onOutput = () => { if (gatewayStdout.includes(`[Gateway] ${target}`)) finish(); };
      // Parallel tests import node-opcua and generate certificates on Windows;
      // allow startup time without sleeps or retries that hide an early crash.
      const timeout = setTimeout(() => finish(new Error(`Test gateway did not start within 25 s${gatewayOutput()}`)), 25_000);
      gateway.once('error', onError);
      gateway.stdout.on('data', onOutput);
      gatewayExit.then(([code, signal]) => finish(new Error(`Test gateway exited (${code ?? signal})${gatewayOutput()}`)), onError);
    });
    t.diagnostic(`Test gateway ready after ${Math.round(performance.now() - gatewayStartedAt)} ms`);
    assert.ok(existsSync(join(temporary, 'opcua-pki', 'own', 'private', 'private_key.pem')), 'Test gateway must use its isolated PKI');
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
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
