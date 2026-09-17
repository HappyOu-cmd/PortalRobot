import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { alarmNode, equipmentIssues, equipmentNodes, inspectionSlot, equipmentHistoryMatches, equipmentHistoryPrefixes } from '../src/model/equipmentInspection.ts';
import { EquipmentInspectionLayer, inspectionBounds, isObjectVisible } from '../src/three/equipmentInspection.ts';
import { isEnclosureDoorUnsecured } from '../src/model/enclosure.ts';
import type { CellState } from '../src/model/types.ts';
import type { PlcAlarmEvent, CellLogEvent } from '../src/plc/client.ts';
import type { EquipmentInspection } from '../src/model/equipmentInspection.ts';

const snapshot = () => ({
  robot: { error: false }, machines: [{ activeErrors: [], alarm: false, mode: 'enabled' }],
  magazines: [
    { slots: Array(120).fill('empty'), state: { enabled: false, activeErrors: [], error: false, actualOperation: 'TAKE', selectedBlank: 12, selectedFreeSlot: 5 } },
    { slots: Array(120).fill('empty'), state: { enabled: false, activeErrors: [], error: false, actualOperation: 'NONE', selectedBlank: 0, selectedFreeSlot: 0 } },
  ],
  enclosureDoors: {
    'magazine-1-front': { closed: true, locked: true }, 'magazine-1-rear': { closed: true, locked: true },
    'magazine-2-front': { closed: true, locked: true }, 'magazine-2-rear': { closed: true, locked: true },
  },
  buttonStations: { 'magazine-1-front': { emergencyStopPressed: true } },
  controlCabinets: { front: { emergencyStopPressed: false }, rear: { emergencyStopPressed: false, phaseRelayFault: true, safetyRelayFault: false }, airPreparation: { lowPressure: true } },
}) as unknown as CellState;
const event = (overrides: Partial<PlcAlarmEvent> = {}): PlcAlarmEvent => ({
  id: 1, source: 'machine-1', code: 4, severity: 'alarm', effect: 'equipment-stop', text: 'Не удалось открыть люк', active: true, reportedAt: 1000, ...overrides,
});

test('historical DOOR bits identify robot hatch; operator door and warnings have separate meanings', () => {
  for (const code of [4, 5, 13, 18, 19]) assert.equal(alarmNode('machine-1', code), 'hatch');
  assert.equal(alarmNode('machine-1', 23), 'door');
  assert.equal(alarmNode('machine-1', 20), 'chuck');
  assert.equal(alarmNode('machine-1', 4, 'warning'), 'equipment');
  assert.equal(alarmNode('machine-1', 999), 'equipment');
});

test('hatch lock faults remain separate from hatch movement in events and state fallback', () => {
  const target = { kind: 'machine', index: 0 } as const;
  assert.ok(equipmentNodes(target).includes('hatch-lock'));
  for (const source of ['machine-1', 'machine-2', 'machine-3'] as const) {
    for (const code of [24, 25]) {
      assert.equal(alarmNode(source, code), 'hatch-lock');
      assert.equal(alarmNode(source, code, 'warning'), 'equipment');
    }
  }
  const state = snapshot();
  const lockText = 'TIMEOUT открытия замка люка';
  const texts = Array<string>(26).fill('');
  texts[24] = lockText;
  state.machines[0].activeErrors = [lockText];
  const issues = equipmentIssues(target, [event(), event({ id: 2, code: 24, text: lockText })], state, true,
    { 'machine-1': texts });
  assert.deepEqual(issues.map((issue) => issue.node), ['hatch', 'hatch-lock']);
  assert.equal(equipmentIssues(target, [], state, true, { 'machine-1': texts })[0].node, 'hatch-lock');
});

test('robot component faults keep separate axes, grippers and rotation', () => {
  assert.equal(alarmNode('axis-y', 13), 'axis-y');
  assert.equal(alarmNode('gripper', 0), 'gripper-1');
  assert.equal(alarmNode('gripper', 1), 'gripper-2');
  assert.equal(alarmNode('gripper', 2), 'rotation');
  assert.equal(alarmNode('robot', 5), 'equipment');
});

test('simultaneous faults remain separate, restored and unrelated events disappear, state masks are deduplicated', () => {
  const state = snapshot();
  state.machines[0].activeErrors = ['Не удалось открыть люк'];
  const issues = equipmentIssues({ kind: 'machine', index: 0 }, [event(), event({ id: 2, code: 23, text: 'Дверь открыта' }),
    event({ id: 3, source: 'machine-2' }), event({ id: 4, code: 20, active: false })], state, true,
  { 'machine-1': ['', '', '', '', 'Не удалось открыть люк'] });
  assert.deepEqual(issues.map((issue) => issue.node), ['hatch', 'door']);
});

test('static magazine slot is one-based and ambiguous or invalid selection highlights cassette', () => {
  const state = snapshot();
  const target = { kind: 'magazine', index: 0 } as const;
  assert.equal(inspectionSlot(state, target), 11);
  state.magazines[0].state.actualOperation = 'PUT';
  assert.equal(inspectionSlot(state, target), 4);
  for (const slot of [0, -1, 121, 2.5]) {
    state.magazines[0].state.selectedFreeSlot = slot;
    assert.equal(inspectionSlot(state, target), null);
  }
  state.magazines[0].state.actualOperation = 'CHANGE';
  assert.equal(inspectionSlot(state, target), null);
  assert.equal(equipmentIssues(target, [event({ source: 'magazine-1', code: 4 })], state, true, {})[0].node, 'cassette');
});

test('safety feedback is attributed to the PLC source and door faults require an enabled magazine', () => {
  const state = snapshot();
  const pressure = equipmentIssues({ kind: 'air' }, [], state, true, {})[0];
  const phase = equipmentIssues({ kind: 'cabinet', side: 'rear' }, [], state, true, {})[0];
  assert.deepEqual([pressure.origin, pressure.source, pressure.code], ['feedback', 'cell-safety', 8]);
  assert.deepEqual([phase.origin, phase.source, phase.code], ['feedback', 'cell-safety', 7]);
  const station = { kind: 'station', id: 'magazine-1-front' } as const;
  assert.deepEqual(equipmentIssues(station, [], state, true, {}).map((issue) => issue.code), [0]);
  state.enclosureDoors['magazine-1-front'].locked = false;
  assert.equal(isEnclosureDoorUnsecured(state.enclosureDoors['magazine-1-front'], false), false);
  assert.equal(isEnclosureDoorUnsecured(state.enclosureDoors['magazine-1-front'], true), true);
  assert.deepEqual(equipmentIssues(station, [], state, true, {}).map((issue) => issue.code), [0]);
  state.magazines[0].state.enabled = true;
  assert.deepEqual(equipmentIssues(station, [], state, true, {}).map((issue) => issue.code), [0, 10]);
});

test('history matches complete source prefix and activation rather than reset time', () => {
  const target = { kind: 'machine', index: 0 } as const;
  const item = { code: '2:4', eventType: 'alarm', status: 'active' } as CellLogEvent;
  assert.equal(equipmentHistoryMatches(target, item), true);
  assert.equal(equipmentHistoryMatches(target, { ...item, code: '12:4' }), false);
  assert.equal(equipmentHistoryMatches(target, { ...item, status: 'restored' }), false);
  assert.equal(equipmentHistoryMatches(target, { ...item, eventType: 'warning' }), false);
  assert.deepEqual(equipmentHistoryPrefixes({ kind: 'robot' }), ['1:', '9:', '10:', '11:', '12:', '13:', '14:', '15:']);
});

test('scene isolates a nested post, tints only faulty nodes, keeps transforms and restores original visibility/materials', () => {
  const scene = new THREE.Scene();
  const cell = new THREE.Group(); scene.add(cell);
  const fence = new THREE.Group(); const post = new THREE.Group(); const other = new THREE.Group();
  cell.add(fence, other); fence.add(post);
  const hidden = new THREE.Group(); hidden.visible = false; cell.add(hidden);
  const surface = new THREE.MeshStandardMaterial({ color: 0x789abc });
  const button = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), surface);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), surface);
  post.add(body, button); post.position.set(2, 1, 3);
  const original = surface.color.getHex();
  const target = { kind: 'station', id: 'magazine-1-front' } as const;
  const inspection: EquipmentInspection = { target, selectedNode: 'emergency-stop', xray: true,
    issues: [{ key: 'stop', title: 'Stop', node: 'emergency-stop', severity: 'alarm', origin: 'feedback' }] };
  const layer = new EquipmentInspectionLayer(scene);
  layer.update(cell, { target, root: post, parts: { 'emergency-stop': [button] } }, inspection, 0, true);
  assert.equal(isObjectVisible(post), true);
  assert.equal(isObjectVisible(other), false);
  assert.equal(button.children.length, 1);
  assert.equal(body.children.length, 0);
  assert.equal(surface.color.getHex(), original);
  assert.equal(button.children[0].parent, button);
  assert.deepEqual(inspectionBounds([button]).getCenter(new THREE.Vector3()).toArray(), [2, 1, 3]);
  layer.restoreVisibility();
  layer.update(cell, { target, root: post, parts: { 'emergency-stop': [button] } }, { ...inspection, xray: false }, 0, true);
  assert.equal((button.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.depthTest, true);
  layer.restoreVisibility();
  layer.update(cell, undefined, null, 0, true);
  assert.equal(other.visible, true);
  assert.equal(hidden.visible, false);
  assert.equal(button.children.length, 0);
  assert.equal(surface.color.getHex(), original);
  layer.dispose(); button.geometry.dispose(); body.geometry.dispose(); surface.dispose();
});
