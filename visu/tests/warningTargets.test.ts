import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { sceneWarningTargets, warningTargetHasAlarm, warningTargetKey } from '../src/model/warningTargets.ts';
import { WarningGlowLayer, createWarningGlow, updateWarningGlow } from '../src/three/warningGlow.ts';
import { GeometryBeltAnimation, createGeometrySnapshot } from '../src/model/geometryControl.ts';
import { EquipmentInspectionLayer, inspectionBounds } from '../src/three/equipmentInspection.ts';
import type { PlcAlarmEvent, PlcAlarmSource } from '../src/plc/client.ts';
import type { CellState } from '../src/model/types.ts';

const event = (source: PlcAlarmSource, code: number, patch: Partial<PlcAlarmEvent> = {}): PlcAlarmEvent => ({
  id: 1, source, code, severity: 'warning', effect: 'warning', text: '', active: true, reportedAt: 1, ...patch,
});
const keys = (events: PlcAlarmEvent[], live = true) => sceneWarningTargets(events, live).map(warningTargetKey);
const state = (): CellState => ({
  robot: { error: false },
  machines: Array.from({ length: 3 }, () => ({ alarm: false, mode: 'enabled', activeErrors: [] })),
  magazines: Array.from({ length: 2 }, () => ({ state: { enabled: false, error: false, activeErrors: [] } })),
  geometryControl: createGeometrySnapshot(),
  enclosureDoors: Object.fromEntries(['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear']
    .map(id => [id, { locked: true, closed: true }])),
  buttonStations: Object.fromEntries(['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear']
    .map(id => [id, { emergencyStopPressed: false }])),
  controlCabinets: { front: { emergencyStopPressed: false }, rear: { emergencyStopPressed: false, phaseRelayFault: false, safetyRelayFault: false }, airPreparation: { lowPressure: false } },
}) as unknown as CellState;
const mesh = (surface = new THREE.MeshStandardMaterial({ color: 0x087fcf })) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), surface);

test('warnings identify equipment, operator doors and unknown chuck contents without reusing alarm bit meanings', () => {
  assert.deepEqual(keys([event('machine-2', 9)]), ['machine:1:door']);
  assert.deepEqual(keys([event('machine-3', 7)]), ['machine:2:chuck']);
  assert.deepEqual(keys([event('machine-1', 4)]), ['machine:0:equipment']);
  assert.deepEqual(keys([event('machine-1', 999)]), ['machine:0:equipment']);
  for (const source of ['magazine-1', 'magazine-2', 'magazine-axis-1', 'magazine-axis-2'] as const) {
    assert.deepEqual(keys([event(source, 30)]), [`magazine:${Number(source.at(-1)) - 1}:equipment`]);
  }
});

test('axes, both grippers, rotation and robot services retain their own warning targets', () => {
  for (const source of ['axis-x', 'axis-y', 'axis-z'] as const) assert.deepEqual(keys([event(source, 12)]), [`robot::${source}`]);
  for (const [code, node] of [[3, 'gripper-1'], [4, 'gripper-2'], [5, 'rotation'], [1, 'grippers'], [2, 'grippers']] as const) {
    assert.deepEqual(keys([event('gripper', code)]), [`robot::${node}`]);
  }
  assert.deepEqual(keys([event('robot', 5)]), ['robot::grippers']);
  for (const source of ['robot', 'axis-group', 'motion-manager', 'point-manager'] as const) {
    assert.deepEqual(keys([event(source, 1)]), ['robot::equipment']);
  }
});

test('safety warnings select the four actual enclosure doors and the rear safety relay', () => {
  const doors = ['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear'];
  doors.forEach((id, index) => assert.deepEqual(keys([event('cell-safety', index + 2)]), [`enclosure-door:${id}:equipment`]));
  assert.deepEqual(keys([event('cell-safety', 1)]), ['cabinet:rear:safety-relay']);
});

test('cell warnings use explicit grippers or whole equipment families when the journal has no individual ID', () => {
  assert.deepEqual(keys([event('cell', 15)]), ['robot::gripper-1']);
  for (const code of [16, 29]) assert.deepEqual(keys([event('cell', code)]), ['robot::gripper-2']);
  for (const code of [2, 10]) assert.deepEqual(keys([event('cell', code)]), ['robot::equipment']);
  for (const code of [3, 18, 25, 30]) assert.deepEqual(keys([event('cell', code)]), ['magazine:0:equipment', 'magazine:1:equipment']);
  for (const code of [19, 20, 24, 26]) assert.deepEqual(keys([event('cell', code)]), ['machine:0:equipment', 'machine:1:equipment', 'machine:2:equipment']);
  assert.equal(keys([event('cell', 23)]).length, 5);
  for (const code of [50, 51]) assert.deepEqual(keys([event('cell', code)]), ['geometry:0:equipment', 'geometry:1:equipment']);
  assert.deepEqual(keys([event('cell', 4)]), ['cell::equipment']);
  assert.deepEqual(keys([event('cell', 999)]), ['cell::equipment']);
});

test('restored events, alarms and stale connections clear warnings while repeated causes are deduplicated', () => {
  const events = [event('machine-1', 9), event('machine-1', 9, { id: 2 }), event('machine-2', 9, { active: false }),
    event('machine-3', 9, { severity: 'alarm' })];
  assert.deepEqual(keys(events), ['machine:0:door']);
  assert.deepEqual(keys(events, false), []);
  assert.deepEqual(keys([]), []);
});

test('every catalogued warning has a presentation target and W52 keeps its PLC-selected stations', () => {
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  for (const [source, codes] of Object.entries(catalog.warnings)) for (const code of Object.keys(codes as object)) {
    assert.equal(keys([event(source as PlcAlarmSource, Number(code))]).length > 0, source !== 'cell' || code !== '52', `${source}:W${code}`);
  }
  for (const source of ['geometry-1', 'geometry-2'] as const) {
    for (const code of [1, 2, 3]) assert.deepEqual(keys([event(source, code)]), [`geometry:${Number(source.at(-1)) - 1}:equipment`]);
  }
  const station = createGeometrySnapshot().stations[0];
  const animation = new GeometryBeltAnimation();
  assert.ok(animation.update(station, 0.1, 0, false, true).warningPulse > 0);
  station.callWaitWarning = true;
  assert.equal(animation.update(station, 0.1, 0, false, false).warningPulse, 0, 'offline/alarm override also disables W52');
});

test('red alarm priority follows journal and equipment feedback without suppressing unrelated objects', () => {
  const snapshot = state();
  const alarm = event('machine-2', 9, { severity: 'alarm' });
  assert.equal(warningTargetHasAlarm({ kind: 'machine', index: 1 }, snapshot, [alarm]), true);
  assert.equal(warningTargetHasAlarm({ kind: 'machine', index: 0 }, snapshot, [alarm]), false);
  assert.equal(warningTargetHasAlarm({ kind: 'machine', index: 1 }, snapshot, [{ ...alarm, active: false }]), false);
  snapshot.robot.error = true;
  snapshot.magazines[0].state.error = true;
  snapshot.geometryControl!.stations[1].driveAlarm = true;
  assert.equal(warningTargetHasAlarm({ kind: 'robot' }, snapshot, []), true);
  assert.equal(warningTargetHasAlarm({ kind: 'magazine', index: 0 }, snapshot, []), true);
  assert.equal(warningTargetHasAlarm({ kind: 'geometry', index: 1 }, snapshot, []), true);
  snapshot.magazines[0].state.enabled = true;
  snapshot.enclosureDoors['magazine-1-rear'].locked = false;
  assert.equal(warningTargetHasAlarm({ kind: 'enclosure-door', id: 'magazine-1-rear' }, snapshot, []), true);
  assert.equal(warningTargetHasAlarm({ kind: 'enclosure-door', id: 'magazine-2-rear' }, snapshot, []), false);
});

test('warning material copies isolate shared surfaces and restore current originals on reset or loss of data', () => {
  const source = new THREE.MeshStandardMaterial({ color: 0x087fcf, emissive: 0x123456, emissiveIntensity: 0.23 });
  const target = mesh(source), neighbor = mesh(source);
  const layer = new WarningGlowLayer();
  layer.update([target], 0);
  assert.notEqual(target.material, source);
  assert.equal(target.material.color.getHex(), 0xff6500);
  assert.equal(neighbor.material, source);
  assert.equal(source.color.getHex(), 0x087fcf);
  assert.equal(source.emissive.getHex(), 0x123456);
  layer.restoreMaterials();
  assert.equal(target.material, source);
  source.color.setHex(0x334455); source.opacity = 0.6; source.transparent = true; source.needsUpdate = true;
  layer.update([target], 0.1);
  assert.equal(target.material.opacity, 0.6);
  layer.update([], 0);
  assert.equal(target.material, source);
  assert.equal(source.color.getHex(), 0x334455);
  assert.equal(target.children.length, 0);
  layer.dispose();
});

test('warning color and emissive match the geometry conveyor over the complete two-second cycle and reduced motion', () => {
  const target = mesh();
  const reference = new THREE.MeshStandardMaterial();
  const glow = createWarningGlow([1, 1, 1], [reference]);
  const station = { ...createGeometrySnapshot().stations[0], callWaitWarning: true };
  const animation = new GeometryBeltAnimation(), layer = new WarningGlowLayer();
  for (let frame = 0; frame <= 20; frame++) {
    const dt = frame ? 0.1 : 0;
    layer.update([target], dt);
    updateWarningGlow(glow, animation.update(station, dt, 0).warningPulse);
    assert.equal(target.material.color.getHex(), reference.color.getHex());
    assert.ok(Math.abs(target.material.emissiveIntensity - reference.emissiveIntensity) < 1e-9);
  }
  for (let frame = 0; frame < 5; frame++) {
    layer.update([target], 0.1, true);
    assert.equal(target.material.color.getHex(), 0xff6500);
  }
  layer.dispose();
});

test('parent and child warnings share one halo and changing target never leaves a tinted sibling', () => {
  const root = new THREE.Group(), child = mesh(), sibling = mesh(); root.add(child, sibling);
  const childSource = child.material, siblingSource = sibling.material;
  const layer = new WarningGlowLayer();
  layer.update([child, root, child], 0);
  assert.equal(root.children.filter(object => object.userData.warningOverlay).length, 1);
  assert.equal(child.children.length, 0);
  layer.update([child], 0.1);
  assert.equal(sibling.material, siblingSource);
  assert.notEqual(child.material, childSource);
  assert.equal(child.children.filter(object => object.userData.warningOverlay).length, 1);
  layer.dispose();
  assert.equal(child.material, childSource);
  assert.equal(sibling.material, siblingSource);
});

test('halos follow moving scaled equipment, handle instances and do not enlarge inspection bounds or intercept clicks', () => {
  const parent = new THREE.Group(); parent.position.set(3, 2, 1); parent.rotation.y = 0.4; parent.scale.setScalar(0.5);
  const target = mesh(); target.position.set(0.5, 0.5, 0); parent.add(target);
  const before = inspectionBounds([target]);
  const layer = new WarningGlowLayer(); layer.update([target], 0);
  const halo = target.children.find(object => object.userData.warningOverlay)!;
  assert.ok(before.equals(inspectionBounds([target])));
  assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0)).intersectObject(halo, true), []);
  const firstPosition = halo.getWorldPosition(new THREE.Vector3());
  parent.position.x += 4; parent.updateMatrixWorld(true);
  assert.ok(Math.abs(halo.getWorldPosition(new THREE.Vector3()).x - firstPosition.x - 4) < 1e-9);
  const inspection = new EquipmentInspectionLayer(new THREE.Scene());
  inspection.update(parent, { target: { kind: 'machine', index: 0 }, root: target, parts: { door: [target] } },
    { target: { kind: 'machine', index: 0 }, selectedNode: 'door', xray: true, issues: [] }, 0, true);
  const overlays: THREE.Object3D[] = [];
  target.traverse(object => { if (object.userData.inspectionOverlay) overlays.push(object); });
  assert.equal(overlays.length, 1, 'inspection must never turn the six halo faces into opaque xray overlays');
  inspection.dispose();
  const instance = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 2);
  instance.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 0, 0));
  instance.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, 0));
  layer.update([instance], 0);
  const instanceHalo = instance.children[0] as THREE.Group;
  const face = instanceHalo.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  assert.ok(face.material.uniforms.size.value.x > 5);
  layer.dispose();
});

test('model replacement and disposal release only owned warning resources and keep original geometry and textures', () => {
  const root = new THREE.Group(), first = mesh(); root.add(first);
  const original = first.material, geometry = first.geometry, texture = new THREE.Texture(); original.map = texture;
  let originalDisposals = 0, cloneDisposals = 0;
  original.addEventListener('dispose', () => originalDisposals++);
  geometry.addEventListener('dispose', () => originalDisposals++);
  texture.addEventListener('dispose', () => originalDisposals++);
  const layer = new WarningGlowLayer(); layer.update([root], 0, false, 'loading');
  first.material.addEventListener('dispose', () => cloneDisposals++);
  layer.restoreMaterials();
  const second = mesh(); root.add(second);
  const secondOriginal = second.material;
  layer.update([root], 0, false, 'loaded');
  assert.equal(cloneDisposals, 1);
  assert.notEqual(second.material, secondOriginal);
  layer.dispose();
  assert.equal(originalDisposals, 0);
  assert.equal(first.material, original);
  assert.equal(second.material, secondOriginal);
  assert.equal(first.geometry, geometry);
  assert.equal(original.map, texture);
  assert.equal(root.children.filter(object => object.userData.warningOverlay).length, 0);
});
