import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: join(tmpdir(), 'portal-scene-indication-tests'), server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] },
  // Routing tests never construct machines; skip the module's eager browser asset loading.
  plugins: [{ name: 'headless-scene-machine', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/three/machine.ts')) return `
      export function createMachine() { throw new Error('Unexpected machine construction'); }
      export function disposeMachineRig() {}
      export function updateMachineRig() {}
    `;
  } }] });
after(() => server.close());
const { createTwoPalletMagazine, updateTwoPalletMagazine } = await server.ssrLoadModule('/src/three/twoPalletMagazine.ts');
const { TwoPalletPreviewController } = await server.ssrLoadModule('/src/model/twoPalletPreview.ts');
const { createGeometrySnapshot } = await server.ssrLoadModule('/src/model/geometryControl.ts');
const { DEFAULT_LAYOUT, DEFAULT_STATE } = await server.ssrLoadModule('/src/model/defaults.ts');
const { DEFAULT_VISUAL_EFFECT_SETTINGS, EMPTY_SCENE_ACTIVITY } = await server.ssrLoadModule('/src/model/visualEffects.ts');
const { mapPlcSnapshot } = await server.ssrLoadModule('/src/plc/client.ts');
const { CellScene } = await server.ssrLoadModule('/src/three/cellScene.ts');
const { OperationalEffects } = await server.ssrLoadModule('/src/three/OperationalEffects.ts');
const { WarningGlowLayer } = await server.ssrLoadModule('/src/three/warningGlow.ts');
const { COLORS, disposeObject } = await server.ssrLoadModule('/src/three/primitives.ts');

const warning = (source, code) => ({ id: code, source, code, active: true,
  severity: 'warning', effect: 'warning', text: '', reportedAt: 1 });
const surfaces = root => {
  const result = new Map();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) result.set(material, material.color.getHex());
    }
  });
  return result;
};
const assertOriginal = originals => originals.forEach((color, material) => assert.equal(material.color.getHex(), color, material.name));
const assertAlarm = rig => {
  assert.ok(rig.alarmSurfaceMaterials.length > 0);
  for (const surface of rig.alarmSurfaceMaterials) {
    assert.equal(surface.uniforms.uAlarmActive.value, 1, surface.material.name);
    assert.notEqual(surface.material.color.getHex(), surface.color.getHex(), surface.material.name);
  }
};
function magazine(t, index = 0) {
  const rig = createTwoPalletMagazine(structuredClone(DEFAULT_LAYOUT), index);
  t.after(() => disposeObject(rig.root));
  const controller = new TwoPalletPreviewController();
  const geometry = { beltPhase: 0, beltTravel: 0, sample: 0.5, productType: 1, warningPulse: 0, operatorPulse: 0 };
  return { rig, update: (active, known = true, patch = {}) => updateTwoPalletMagazine(rig, controller,
    undefined, known, undefined, geometry, { active, dt: 0.25, inspecting: false, reducedMotion: false, ...patch }) };
}

test('both two-pallet magazines show alarms before confirmation without colouring GK or the other magazine', t => {
  const first = magazine(t), second = magazine(t, 1);
  for (const [index, current, other] of [[0, first, second], [1, second, first]]) {
    const number = index + 1;
    const state = mapPlcSnapshot({ uiMagazineMode: 1, [`astMagazineStatus[${number}].xEnabled`]: false,
      [`astMagazineStatus[${number}].xError`]: true, [`astTwinStatus[${number}].xConfirmed`]: false }, structuredClone(DEFAULT_STATE));
    const data = state.magazines[index];
    assert.equal(data.state.enabled, false);
    assert.equal(data.twin.confirmed, false);
    const conveyorOriginals = surfaces(current.rig.conveyor), otherOriginals = surfaces(other.rig.root);
    const workpieceOriginals = new Map(current.rig.productMeshes.flatMap(sets => [...sets.blank, ...sets.detail])
      .map(mesh => [mesh.material, mesh.material.color.getHex()]));
    current.update(data.state.error, data.twin.confirmed);
    assertAlarm(current.rig);
    assert.equal(current.rig.root.getObjectByName('Square_tube_stand').visible, true);
    current.rig.pallets.forEach(pallet => assert.equal(pallet.visible, false));
    assertOriginal(conveyorOriginals); assertOriginal(otherOriginals); assertOriginal(workpieceOriginals);
    current.update(true, true);
    current.rig.pallets.forEach(pallet => assert.equal(pallet.visible, true));
    assertAlarm(current.rig);
    assertOriginal(conveyorOriginals);
    current.update(false);
  }
});

test('two-pallet alarm pulses restore original materials during inspection and reset and respect reduced motion', t => {
  const { rig, update } = magazine(t);
  const originals = surfaces(rig.root);
  update(true); assertAlarm(rig);
  const firstColor = rig.alarmSurfaceMaterials[0].material.color.getHex();
  update(true);
  assert.notEqual(rig.alarmSurfaceMaterials[0].material.color.getHex(), firstColor);
  update(true, false, { inspecting: true });
  assertOriginal(originals);
  update(true, false, { reducedMotion: true });
  assertAlarm(rig);
  const staticColors = surfaces(rig.root);
  update(true, false, { reducedMotion: true, dt: 0.7 });
  assertOriginal(staticColors);
  rig.alarmSurfaceMaterials.forEach(surface => assert.equal(surface.uniforms.uAlarmElapsed.value, 0));
  update(false);
  assert.equal(rig.alarmElapsed, 0); assertOriginal(originals);
  rig.alarmSurfaceMaterials.forEach(surface => assert.equal(surface.uniforms.uAlarmActive.value, 0));
});

function warningScene(t) {
  // Exercise the scene's warning routing without constructing a WebGL renderer or browser.
  const scene = Object.create(CellScene.prototype);
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x334455 }));
  const door = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x778899 }));
  const root = new THREE.Group(); root.add(body, door);
  Object.assign(scene, { state: { ...structuredClone(DEFAULT_STATE), geometryControl: createGeometrySnapshot() },
    sceneActivity: { ...EMPTY_SCENE_ACTIVITY, live: true },
    warningLayer: new WarningGlowLayer(), reducedMotion: { matches: false }, inspectionModelSignature: 'fixture',
    inspectionEntries: [{ target: { kind: 'machine', index: 0 }, root, parts: { door: [door] } }],
    refreshInspectionEntries() {} });
  t.after(() => { scene.warningLayer.dispose(); disposeObject(root); });
  return { scene, root, body, door };
}
function effectsFixture(t, settings = {}) {
  const effects = new OperationalEffects({ ...DEFAULT_VISUAL_EFFECT_SETTINGS, ...settings });
  t.after(() => effects.dispose());
  const anchors = { machines: [], magazines: [], portal: { ground: new THREE.Vector3(), service: new THREE.Vector3() },
    cell: { center: new THREE.Vector3(6, 0, -3), length: 12, width: 6 } };
  return { effects, anchors, boundary: effects.root.getObjectByName('cell_boundary_indication'),
    activity: { ...EMPTY_SCENE_ACTIVITY, live: true } };
}

test('general cell warnings use a pulsing orange rectangle without tinting equipment or GK conveyors', t => {
  const { scene, root, body, door } = warningScene(t);
  const originals = surfaces(root), materials = [body.material, door.material];
  scene.setWarningEvents([warning('cell', 4)], true);
  scene.updateWarnings(0.1);
  assertOriginal(originals); assert.equal(body.material, materials[0]); assert.equal(door.material, materials[1]);
  assert.equal(root.children.some(child => child.userData.warningOverlay), false);
  assert.equal(scene.geometryWarningActive(0), false); assert.equal(scene.geometryWarningActive(1), false);
  const { effects, anchors, boundary, activity } = effectsFixture(t, { alarmBeacons: false });
  effects.update(0.1, activity, anchors, scene.warningTargets.some(target => target.equipment.kind === 'cell'));
  assert.equal(boundary.visible, true); assert.equal(boundary.material.color.getHex(), 0xff6500);
  const positions = boundary.geometry.getAttribute('position');
  assert.deepEqual(Array.from({ length: positions.count }, (_, i) => [positions.getX(i), positions.getZ(i)]),
    [[0, -6], [12, -6], [12, 0], [0, 0], [0, -6]]);
  for (let i = 0; i < positions.count; i++) assert.ok(Math.abs(positions.getY(i) - 0.024) < 1e-6);
  const opacity = boundary.material.opacity;
  effects.update(0.35, activity, anchors, true);
  assert.notEqual(boundary.material.opacity, opacity);
  assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)).intersectObject(boundary), []);
  scene.setWarningEvents([], true); scene.updateWarnings(0.1);
  effects.update(0.1, activity, anchors, scene.warningTargets.length > 0);
  assert.equal(boundary.visible, false); assertOriginal(originals);
  scene.setWarningEvents([warning('cell', 4)], false);
  assert.deepEqual(scene.warningTargets, []);
  assert.equal(scene.geometryWarningActive(0), false); assert.equal(scene.geometryWarningActive(1), false);
});

test('specific equipment and GK warnings stay local alongside a general cell warning', t => {
  const { scene, root, body, door } = warningScene(t);
  const originalBody = body.material;
  scene.setWarningEvents([warning('cell', 4), warning('machine-1', 9), warning('geometry-2', 1)], true);
  scene.updateWarnings(0);
  assert.equal(body.material, originalBody);
  assert.equal(door.material.color.getHex(), 0xff6500);
  assert.equal(root.children.some(child => child.userData.warningOverlay), false);
  assert.equal(scene.geometryWarningActive(0), false); assert.equal(scene.geometryWarningActive(1), true);
  scene.setWarningEvents([warning('cell', 52)], true);
  scene.state.geometryControl.stations[0].callWaitWarning = true;
  scene.updateWarnings(0.1);
  assert.equal(scene.geometryWarningActive(0), true); assert.equal(scene.geometryWarningActive(1), false);
});

test('cell boundary clears on disconnect, keeps red alarm priority and becomes static with reduced motion', t => {
  const { effects, anchors, boundary, activity } = effectsFixture(t, { alarmBeacons: true });
  effects.update(0.1, { ...activity, alarmTargets: [{ kind: 'cell' }] }, anchors, true);
  assert.equal(boundary.visible, true); assert.equal(boundary.material.color.getHex(), COLORS.red);
  effects.update(0.1, activity, anchors, true);
  assert.equal(boundary.material.color.getHex(), 0xff6500);
  effects.handleMotionPreference({ matches: true });
  effects.update(0.1, activity, anchors, true);
  const opacity = boundary.material.opacity;
  effects.update(0.7, activity, anchors, true); assert.equal(boundary.material.opacity, opacity);
  effects.update(0.1, { ...activity, live: false }, anchors, true); assert.equal(boundary.visible, false);
  effects.update(0.1, activity, anchors, false); assert.equal(boundary.visible, false);
});
