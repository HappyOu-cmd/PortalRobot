import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  AttributeIds, MessageSecurityMode, OPCUAClient, OPCUACertificateManager,
  OPCUAServer, RegisterServerMethod, SecurityPolicy, UserTokenType, VariableIds,
} from 'node-opcua';
import { opcuaUserIdentity } from './opcua-user-identity.mjs';

test('an unconfigured PLC login keeps anonymous authentication', () => {
  assert.deepEqual(opcuaUserIdentity({}), { type: UserTokenType.Anonymous });
  assert.deepEqual(opcuaUserIdentity({ OPCUA_USERNAME: '', OPCUA_PASSWORD: '' }), {
    type: UserTokenType.Anonymous,
  });
});

test('a partial PLC login is rejected without leaking credentials', () => {
  for (const env of [
    { OPCUA_USERNAME: 'private-test-user' },
    { OPCUA_PASSWORD: 'private-test-password' },
    { OPCUA_USERNAME: '  ', OPCUA_PASSWORD: 'private-test-password' },
  ]) {
    assert.throws(() => opcuaUserIdentity(env), (error) => {
      assert.match(error.message, /OPCUA_USERNAME.*OPCUA_PASSWORD/);
      assert.doesNotMatch(error.message, /private-test-/);
      return true;
    });
  }
});

test('PLC credentials preserve case and password whitespace', () => {
  assert.deepEqual(opcuaUserIdentity({ OPCUA_USERNAME: 'HmiGateway', OPCUA_PASSWORD: ' pass word ' }), {
    type: UserTokenType.UserName, userName: 'HmiGateway', password: ' pass word ',
  });
});

test('PLC username authentication works over real OPC UA sessions', { timeout: 30_000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'portal-opcua-login-test-'));
  const clientCertificateManager = new OPCUACertificateManager({
    rootFolder: join(root, 'client'), automaticallyAcceptUnknownCertificate: true,
  });
  const serverCertificateManager = new OPCUACertificateManager({ rootFolder: join(root, 'server') });
  const identity = opcuaUserIdentity({ OPCUA_USERNAME: 'HmiGateway', OPCUA_PASSWORD: ' test password ' });
  const server = new OPCUAServer({
    port: 0, host: '127.0.0.1', hostname: '127.0.0.1',
    resourcePath: '/portal-opcua-login-test',
    registerServerMethod: RegisterServerMethod.HIDDEN,
    allowAnonymous: false,
    securityModes: [MessageSecurityMode.None],
    securityPolicies: [SecurityPolicy.None, SecurityPolicy.Basic256Sha256],
    serverCertificateManager,
    userManager: { isValidUser: (userName, password) =>
      userName === identity.userName && password === identity.password },
  });
  const clients = [];
  const sessions = [];
  t.after(async () => {
    await Promise.allSettled(sessions.map(session => session.close()));
    await Promise.allSettled(clients.map(client => client.disconnect()));
    await server.shutdown(0);
    await clientCertificateManager.dispose();
    // Delete only the unique temporary directory created by this test.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  await clientCertificateManager.initialize();
  await server.initialize();
  await server.start();
  const endpointUrl = server.getEndpointUrl();
  const connect = async () => {
    const client = OPCUAClient.create({
      applicationName: 'PortalOpcuaLoginTest',
      applicationUri: `urn:${hostname()}:PortalOpcuaLoginTest`,
      clientCertificateManager,
      securityMode: MessageSecurityMode.None, securityPolicy: SecurityPolicy.None,
      connectionStrategy: { maxRetry: 0 }, endpointMustExist: false,
    });
    clients.push(client);
    await client.connect(endpointUrl);
    return client;
  };

  await t.test('main and diagnostic sessions accept the same PLC credentials', async () => {
    const pair = await Promise.all([connect(), connect()]);
    const active = await Promise.all(pair.map(async client => {
      const session = await client.createSession(identity);
      sessions.push(session);
      return session;
    }));
    for (const session of active) {
      const value = await session.read({
        nodeId: `ns=0;i=${VariableIds.Server_ServerStatus_CurrentTime}`,
        attributeId: AttributeIds.Value,
      });
      assert.ok(value.statusCode.isGood());
      assert.ok(value.value.value instanceof Date);
    }
  });

  await t.test('an incorrect password is rejected without anonymous fallback', async () => {
    const client = await connect();
    await assert.rejects(client.createSession({ ...identity, password: 'incorrect-test-password' }),
      /BadUserAccessDenied|BadIdentityTokenRejected/);
  });

  await t.test('a server without an anonymous policy rejects anonymous authentication', async () => {
    const client = await connect();
    await assert.rejects(client.createSession(opcuaUserIdentity({})),
      /Cannot find ANONYMOUS user token policy/);
  });
});
