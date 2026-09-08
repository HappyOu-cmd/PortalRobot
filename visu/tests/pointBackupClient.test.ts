import assert from 'node:assert/strict';
import test from 'node:test';
import { gatewayApiUrlFromEndpoint } from '../src/api/gateway.ts';

test('REST points API follows the configured gateway websocket origin', () => {
  assert.equal(gatewayApiUrlFromEndpoint('/api/point-backups', 'ws://192.168.0.20:3001/ws'), 'http://192.168.0.20:3001/api/point-backups');
  assert.equal(gatewayApiUrlFromEndpoint('/api/point-backups', 'wss://gateway.example/ws'), 'https://gateway.example/api/point-backups');
  assert.equal(gatewayApiUrlFromEndpoint('/api/point-backups'), '/api/point-backups');
});
