import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { createServer } from 'vite';

// Use the same TS module resolution as the app, without WebGL, a gateway or PLC.
const server = await createServer({
  configFile: false,
  cacheDir: join(tmpdir(), 'portal-robot-vite-tests'),
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { createPortal, updatePortalRig } = await server.ssrLoadModule('/src/three/portal.ts');
const { sampleChainPath } = await server.ssrLoadModule('/src/three/cableChain.ts');
const { DEFAULT_LAYOUT, DEFAULT_STATE } = await server.ssrLoadModule('/src/model/defaults.ts');
const { disposeObject } = await server.ssrLoadModule('/src/three/primitives.ts');
const near = (actual, expected, tolerance = 1e-7) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`,
);
const world = (object) => object.getWorldPosition(new THREE.Vector3());

function makeRig(t) {
  const layout = structuredClone(DEFAULT_LAYOUT);
  const rig = createPortal(layout);
  t.after(() => disposeObject(rig.root));
  return { rig, layout };
}

function settle(rig, layout, state, coordinates = { x: 6200, y: 800, z: 800 }) {
  // A fresh already-received frame avoids relying on wall-clock sleeps in tests.
  rig.telemetry.initialized = false;
  rig.current = { ...coordinates };
  const frame = { sequence: 1, timestampMs: Date.now(), sourceTimestampMs: Date.now(), coordinates };
  for (let i = 0; i < 220; i++) updatePortalRig(rig, state, frame, layout, 1 / 60);
}

test('all chains retain arc length and end tangents throughout their stroke', (t) => {
  const { rig } = makeRig(t);
  for (const chain of Object.values(rig.chains)) {
    for (const fraction of [-1, -0.5, 0, 0.5, 1]) {
      const travel = fraction * (chain.straightLength - chain.radius * 2);
      const previous = new THREE.Vector3();
      const point = new THREE.Vector3();
      const tangent = new THREE.Vector3();
      sampleChainPath(0, travel, chain.straightLength, chain.radius, point, tangent);
      near(point.length(), 0);
      near(tangent.x, 1);
      let measuredLength = 0;
      for (let i = 1; i <= 12000; i++) {
        previous.copy(point);
        sampleChainPath(chain.length * i / 12000, travel, chain.straightLength, chain.radius, point, tangent);
        measuredLength += point.distanceTo(previous);
        near(tangent.length(), 1);
      }
      near(measuredLength, chain.length, 0.00002);
      near(point.x, travel);
      near(point.y, chain.radius * 2);
      near(tangent.x, -1);
    }
  }
});

test('chain terminals stay attached to their owning bodies at every XYZ corner', (t) => {
  const { rig, layout } = makeRig(t);
  const owners = {
    x: [rig.root, rig.xAssembly],
    y: [rig.xAssembly, rig.yCarriage],
    z: [rig.yCarriage, rig.zRam],
  };
  const terminalOffsets = Object.fromEntries(Object.entries(rig.chains).map(([axis, chain]) => [axis,
    [chain.fixedEnd, chain.movingEnd].map((end, index) => owners[axis][index].worldToLocal(world(end))),
  ]));
  const resourceIds = Object.values(rig.chains).map((chain) => [chain.links.geometry.uuid, chain.links.count]);
  for (const x of [0, layout.portal.lengthX / 1000]) {
    for (const y of [0, layout.portal.widthY / 1000]) {
      for (const z of [0, (layout.portal.frameBottomZ - layout.robot.zBaseLength) / 1000]) {
        rig.updateMechanics(x, y, z);
        for (const [axis, chain] of Object.entries(rig.chains)) {
          [chain.fixedEnd, chain.movingEnd].forEach((end, index) => {
            const local = owners[axis][index].worldToLocal(world(end));
            near(local.distanceTo(terminalOffsets[axis][index]), 0);
          });
          assert.ok(Array.from(chain.links.instanceMatrix.array).every(Number.isFinite));
          const matrix = new THREE.Matrix4();
          for (let i = 0; i < chain.links.count; i++) {
            chain.links.getMatrixAt(i, matrix);
            near(matrix.determinant(), 1, 0.000001);
          }
        }
      }
    }
  }
  assert.deepEqual(Object.values(rig.chains).map((chain) => [chain.links.geometry.uuid, chain.links.count]), resourceIds);
});

test('Z translates as a rigid ram from its raised home position', (t) => {
  const { rig, layout } = makeRig(t);
  const mast = rig.root.getObjectByName('axis_z_column');
  const mastSize = new THREE.Box3().setFromObject(mast).getSize(new THREE.Vector3());
  for (const coordinates of [{ x: 0, y: 0, z: 0 }, { x: 5000, y: 850, z: 1650 }]) {
    settle(rig, layout, DEFAULT_STATE.robot, coordinates);
    near(new THREE.Box3().setFromObject(mast).getSize(new THREE.Vector3()).distanceTo(mastSize), 0);
    assert.deepEqual(rig.zRam.scale.toArray(), [1, 1, 1]);
    const tool = world(rig.gripperMount);
    near(tool.x, (layout.portal.position.x + coordinates.x) / 1000);
    near(tool.z, -(layout.portal.position.y + layout.coordinate.origin.y + coordinates.y) / 1000);
    near(tool.y, (layout.portal.position.z + layout.portal.frameBottomZ + layout.portal.frameThicknessZ
      + layout.robot.yBeamHeight * 0.72 - Math.min(layout.robot.zBaseLength, 200)
      - Math.max(0, layout.coordinate.origin.z + coordinates.z)) / 1000);
  }
  layout.coordinate = { origin: { x: 8000, y: 1700, z: 2000 }, direction: { x: -1, y: -1, z: -1 } };
  settle(rig, layout, DEFAULT_STATE.robot, { x: 1000, y: 400, z: 700 });
  near(rig.xAssembly.position.x, 7);
  near(rig.yCarriage.position.z, -1.3);
  near(rig.zRam.position.y, -1.3);
});

test('each three-jaw chuck opens radially and closes on the configured part', (t) => {
  const { rig, layout } = makeRig(t);
  const state = { ...DEFAULT_STATE.robot, gripper1Closed: false, gripper2Closed: true };
  settle(rig, layout, state);
  const distance = (finger) => Math.hypot(finger.position.y - rig.gripper.jawCenter.x,
    finger.position.z - rig.gripper.jawCenter.y);
  const firstOpen = rig.gripper.fingers1.map(distance);
  const secondClosed = rig.gripper.fingers2.map(distance);
  assert.equal(firstOpen.length, 3);
  firstOpen.forEach((radius) => near(radius, firstOpen[0]));
  secondClosed.forEach((radius) => near((radius - 0.0235) * rig.gripper.pivot.scale.x, layout.partGeometry.diameter / 2000));
  settle(rig, layout, { ...state, gripper1Closed: true, gripper2Closed: true });
  rig.gripper.fingers1.forEach((finger, i) => assert.ok(distance(finger) < firstOpen[i]));
  rig.gripper.fingers2.forEach((finger, i) => near(distance(finger), secondClosed[i]));
});

test('180 degree swap exchanges complete payload poses while the actuator stays on Z', (t) => {
  const { rig, layout } = makeRig(t);
  const state = { ...DEFAULT_STATE.robot, gripper1Closed: true, gripper2Closed: true,
    rotatedToBlank: true, rotatedToDetail: false };
  settle(rig, layout, state);
  const firstPose = rig.gripper.blank.matrixWorld.clone();
  const secondPose = rig.gripper.detail.matrixWorld.clone();
  // getWorldPosition also makes ancestor matrices current before the snapshots.
  world(rig.gripper.blank); world(rig.gripper.detail);
  firstPose.copy(rig.gripper.blank.matrixWorld);
  secondPose.copy(rig.gripper.detail.matrixWorld);
  const actuator = rig.root.getObjectByName('gripper_rotary_actuator');
  const actuatorPosition = world(actuator);
  settle(rig, layout, { ...state, rotatedToBlank: false, rotatedToDetail: true });
  world(rig.gripper.blank); world(rig.gripper.detail);
  rig.gripper.blank.matrixWorld.elements.forEach((value, i) => near(value, secondPose.elements[i]));
  rig.gripper.detail.matrixWorld.elements.forEach((value, i) => near(value, firstPose.elements[i]));
  near(world(actuator).distanceTo(actuatorPosition), 0);
  assert.equal(rig.gripper.blank.parent.parent, rig.gripper.gripper1);
  assert.equal(rig.gripper.detail.parent.parent, rig.gripper.gripper2);
});

test('scene disposal releases all three instanced-chain buffers', () => {
  const rig = createPortal(structuredClone(DEFAULT_LAYOUT));
  let released = 0;
  Object.values(rig.chains).forEach((chain) => chain.links.addEventListener('dispose', () => released++));
  disposeObject(rig.root);
  assert.equal(released, 3);
});

test('every knee strut mates with a column plate and a rail or end-arm plate', (t) => {
  const { rig } = makeRig(t);
  rig.root.updateMatrixWorld(true);
  const bounds = (object) => new THREE.Box3().setFromObject(object);
  const columns = [];
  const beams = [];
  rig.root.traverse((object) => {
    if (/^portal_support_\d/.test(object.name)) columns.push(bounds(object));
    if (/^portal_x_rail_.*_body$/.test(object.name) || object.name === 'portal_end_arm') beams.push(bounds(object));
  });
  const knees = rig.root.getObjectsByProperty('name', 'portal_knee_brace');
  assert.ok(knees.length >= 4);
  for (const knee of knees) {
    const strut = bounds(knee.getObjectByName('portal_knee_strut'));
    const columnPlate = bounds(knee.getObjectByName('portal_knee_column_plate'));
    const beamPlate = bounds(knee.getObjectByName('portal_knee_beam_plate'));
    const touches = (a, b) => a.clone().expandByScalar(0.000001).intersectsBox(b);
    assert.ok(columns.some((column) => touches(columnPlate, column)), 'column plate floats off its post');
    assert.ok(beams.some((beam) => touches(beamPlate, beam)), 'upper plate floats below its beam');
    assert.ok(touches(strut, columnPlate), 'strut misses its vertical mating face');
    assert.ok(touches(strut, beamPlate), 'strut misses its horizontal mating face');
    near(strut.max.y, beamPlate.min.y);
    if (knee.scale.x > 0) near(strut.min.x, columnPlate.max.x);
    else near(strut.max.x, columnPlate.min.x);
  }
});

test('X and Y trays touch the beam sides and Y stays within the beam ends', (t) => {
  const { rig, layout } = makeRig(t);
  rig.root.updateMatrixWorld(true);
  const bounds = (name) => new THREE.Box3().setFromObject(rig.root.getObjectByName(name));
  const yBeams = new THREE.Box3();
  rig.root.getObjectsByProperty('name', 'axis_y_extrusion_body').forEach((beam) => yBeams.union(new THREE.Box3().setFromObject(beam)));
  const yTray = bounds('axis_y_chain_tray');
  assert.ok(yTray.min.z >= yBeams.min.z && yTray.max.z <= yBeams.max.z, 'Y tray projects beyond the beam ends');
  near(bounds('axis_y_chain_tray_mounting_wall').min.x, yBeams.max.x);
  const xRails = [];
  rig.root.traverse((object) => {
    if (/^portal_x_rail_.*_body$/.test(object.name)) xRails.push(new THREE.Box3().setFromObject(object));
  });
  near(bounds('axis_x_chain_tray_mounting_wall').max.z, Math.min(...xRails.map((rail) => rail.min.z)));
  assert.equal(rig.root.getObjectByName('axis_x_chain_fixed_bracket'), undefined);
  const terminal = bounds('axis_x_chain_fixed_terminal');
  const xTray = bounds('axis_x_chain_tray');
  assert.ok(terminal.min.z >= xTray.min.z && terminal.max.z <= xTray.max.z);

  // The rolling chains must stay over their shelves at the travel limits too.
  for (const fraction of [0, 0.5, 1]) {
    rig.updateMechanics(layout.portal.lengthX / 1000 * fraction, layout.portal.widthY / 1000 * fraction, 0);
    rig.root.updateMatrixWorld(true);
    for (const axis of ['x', 'y']) {
      const chain = rig.chains[axis];
      const tray = bounds(`axis_${axis}_chain_tray`);
      chain.links.geometry.computeBoundingBox();
      const transform = new THREE.Matrix4();
      for (let i = 0; i < chain.links.count; i++) {
        chain.links.getMatrixAt(i, transform);
        transform.premultiply(chain.links.matrixWorld);
        const link = chain.links.geometry.boundingBox.clone().applyMatrix4(transform);
        assert.ok(link.min.x >= tray.min.x - 0.000001 && link.max.x <= tray.max.x + 0.000001, `${axis} chain leaves tray in X`);
        assert.ok(link.min.z >= tray.min.z - 0.000001 && link.max.z <= tray.max.z + 0.000001, `${axis} chain leaves tray in Y`);
      }
    }
  }
});
