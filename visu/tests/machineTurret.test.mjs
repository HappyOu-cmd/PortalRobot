import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: join(tmpdir(), 'portal-turret-tests'), server: { middlewareMode: true, watch: null },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { prepareMachineTurret, createMachineTurret, updateMachineTurret } = await server.ssrLoadModule('/src/three/machineTurret.ts');
const { MachineCoolantEffect } = await server.ssrLoadModule('/src/three/MachineCoolantEffect.ts');
const bytes = await readFile(new URL('../src/assets/models/Headman.glb', import.meta.url));
const { scene: template } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

function triangles(root, excludedName) {
  const result = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.name === excludedName) return;
    const p = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.getIndex();
    for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
      const vertices = [];
      for (let k = 0; k < 3; k++) {
        const v = idx ? idx.getX(i + k) : i + k;
        vertices.push([p.getX(v), p.getY(v), p.getZ(v)].map(n => n.toFixed(6)).join(','));
      }
      result.push(vertices.sort().join(';'));
    }
  });
  return result.sort();
}

const body = template.getObjectByName('CNC-1');
const before = triangles(body);
const disc = body.children[10];
const steel = body.children[12];
assert.equal(prepareMachineTurret(disc, steel), true);

function fixture() {
  const model = template.clone(true);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.geometry = o.geometry.clone();
    o.material = o.material.clone();
  });
  const chuck = model.getObjectByName('Chuck-1');
  const part = new THREE.Group();
  part.position.x = 0.14;
  chuck.add(part);
  const rig = createMachineTurret(model, chuck, part, { diameter: 39, length: 70 });
  const state = { mode: 'processing', partPresent: true, chuckOpen: false, chuckClosed: true,
    doorOpen: false, hatchOpen: false, alarm: false, activeErrors: [],
    cycleExpectedS: 60, cycleElapsedS: 0, cycleRemainingS: 60 };
  return { model, chuck, part, rig, state };
}

function tick(f, seconds) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    f.state.cycleElapsedS += 0.05;
    f.state.cycleRemainingS = Math.max(0, f.state.cycleExpectedS - f.state.cycleElapsedS);
    updateMachineTurret(f.rig, f.state, 0.05, 6);
  }
}

test('separation preserves every original triangle and keeps bed and enclosure stationary', () => {
  assert.deepEqual(triangles(body, 'machine_turret_back_wall'), before);
  const f = fixture();
  f.model.scale.set(0.82, 1, 1.006);
  f.model.updateMatrixWorld(true);
  const movedDisc = f.model.getObjectByName('machine_turret_disc');
  const originalMatrix = new THREE.Matrix4().makeScale(0.82, 1, 1.006);
  assert.ok(movedDisc.matrixWorld.elements.every((n, i) => Math.abs(n - originalMatrix.elements[i]) < 1e-12));
  const bed = f.model.getObjectByName('CNC-1').children.find(o => o.isMesh && o.material.name === 'brushedsteel');
  const bedMatrix = bed.matrixWorld.clone();
  const chuckMatrix = f.chuck.matrixWorld.clone();
  tick(f, 4);
  f.model.updateMatrixWorld(true);
  assert.ok(bed.matrixWorld.equals(bedMatrix));
  assert.ok(f.chuck.matrixWorld.equals(chuckMatrix));
  assert.ok(!movedDisc.matrixWorld.equals(originalMatrix));
});

test('fixed back wall seals the original mount opening throughout cutting and final return', () => {
  const f = fixture();
  f.model.scale.set(0.82, 1, 1.006);
  const wall = f.model.getObjectByName('machine_turret_back_wall');
  assert.equal(wall.parent, f.model.getObjectByName('CNC-1'));
  assert.equal(wall.material.name, 'whitecarpaint');
  assert.equal(wall.material.transparent, false);
  f.model.updateMatrixWorld(true);
  const fixedMatrix = wall.matrixWorld.clone();
  // This point is inside the CAD opening, above the displaced turret. Before
  // the fix a ray here passed through the enclosure into the scene background.
  const origin = f.model.localToWorld(new THREE.Vector3(0.35, 1.38, -0.165));
  const direction = new THREE.Vector3(1, 0, 0).transformDirection(f.model.matrixWorld);
  const ray = new THREE.Raycaster(origin, direction);
  const checkWall = () => {
    f.model.updateMatrixWorld(true);
    assert.ok(wall.matrixWorld.equals(fixedMatrix));
    const hits = ray.intersectObject(wall);
    assert.equal(hits.length, 1);
    const point = f.model.worldToLocal(hits[0].point.clone());
    assert.ok(Math.abs(point.x - 0.7025) < 1e-6);
    assert.ok(Math.abs(point.y - 1.38) < 1e-6);
  };
  checkWall();
  for (let i = 0; i < 13; i++) { tick(f, 1); checkWall(); }
  f.state.cycleElapsedS = 55;
  for (let i = 0; i < 5; i++) { tick(f, 1); checkWall(); }
  const boundary = wall.geometry.getAttribute('position');
  assert.equal(boundary.count, 13);
  const base = f.model.getObjectByName('machine_turret_base').geometry.getAttribute('position');
  for (let i = 1; i < boundary.count; i++) {
    const rim = new THREE.Vector3().fromBufferAttribute(boundary, i);
    assert.ok(Array.from({ length: base.count }, (_, j) => new THREE.Vector3().fromBufferAttribute(base, j))
      .some(vertex => vertex.distanceTo(rim) < 1e-6));
  }
});

test('working cutter reaches the stock surface, feeds outside the jaws and repeats the same path', () => {
  const f = fixture();
  tick(f, 4.2);
  f.model.updateMatrixWorld(true);
  const tip = new THREE.Vector3(-0.28, 0, 0.345).applyMatrix4(f.rig.head.matrixWorld);
  const radialDistance = Math.hypot(tip.y - f.rig.spindleCenter.y, tip.z - f.rig.spindleCenter.z);
  assert.ok(Math.abs(radialDistance - f.rig.radius) < 0.001, `radial error ${radialDistance - f.rig.radius}`);
  assert.ok(tip.x > f.chuck.position.x + 0.155);
  assert.ok(tip.x <= f.rig.startX + 0.001);
  const firstPass = f.rig.slide.position.clone();
  tick(f, 6);
  assert.ok(firstPass.distanceTo(f.rig.slide.position) < 0.0001);
  assert.equal(f.rig.head.rotation.x, 0);
});

test('final five seconds return the head and keep it parked while processing remains true', () => {
  const f = fixture();
  tick(f, 4);
  f.state.cycleElapsedS = 55;
  tick(f, 4.9);
  assert.equal(f.rig.returning, true);
  assert.equal(f.state.mode, 'processing');
  assert.ok(f.rig.slide.position.length() < 0.0001);
  tick(f, 4);
  assert.ok(f.rig.slide.position.length() < 0.000001);
});

test('ordinary stop retracts radially before traversing home; a new cycle restarts the loop', () => {
  const f = fixture();
  tick(f, 4);
  f.state.mode = 'enabled';
  const x = f.rig.slide.position.x;
  updateMachineTurret(f.rig, f.state, 0.05, 6);
  assert.equal(f.rig.slide.position.x, x);
  tick(f, 4);
  assert.ok(f.rig.slide.position.length() < 0.0001);
  f.state.mode = 'processing';
  f.state.cycleElapsedS = 0;
  tick(f, 4);
  assert.equal(f.rig.returning, false);
  assert.ok(f.rig.slide.position.length() > 0.1);
});

test('alarm and an open chuck freeze the head; removing the stock returns it home', () => {
  const f = fixture();
  tick(f, 4);
  const position = f.rig.slide.position.clone();
  const elapsed = f.rig.elapsed;
  f.state.mode = 'error';
  tick(f, 2);
  assert.ok(f.rig.slide.position.equals(position));
  assert.equal(f.rig.elapsed, elapsed);
  f.state.mode = 'processing';
  f.state.chuckOpen = true;
  tick(f, 2);
  assert.ok(f.rig.slide.position.equals(position));
  f.state.partPresent = false;
  tick(f, 4);
  assert.ok(f.rig.slide.position.length() < 0.0001);
});

test('three machines have independent movement and geometry; short cycles still get a working interval', () => {
  const a = fixture(), b = fixture(), c = fixture();
  tick(a, 4);
  assert.equal(b.rig.slide.position.length(), 0);
  assert.equal(c.rig.slide.position.length(), 0);
  assert.notEqual(a.model.getObjectByName('machine_turret_disc').geometry, b.model.getObjectByName('machine_turret_disc').geometry);
  b.state.cycleExpectedS = 5;
  tick(b, 2);
  assert.equal(b.rig.returning, false);
  tick(b, 2.1);
  assert.equal(b.rig.returning, true);
});

function ringCenter(mesh, ring) {
  const position = mesh.geometry.getAttribute('position');
  const center = new THREE.Vector3();
  for (let i = 0; i < 8; i++) center.add(new THREE.Vector3().fromBufferAttribute(position, ring * 9 + i));
  return center.divideScalar(8);
}

test('two white coolant streams follow hose outlets, retain their width and hit the stock without enclosure fog', () => {
  const f = fixture();
  f.model.scale.set(0.82, 1, 1.006);
  f.model.position.set(1.15, -0.05, -0.84);
  const coolant = new MachineCoolantEffect(f.model, f.chuck, f.part, { diameter: 39, length: 70 }, f.rig);
  const fixed = f.model.getObjectByName('coolant_body_hose_outlet');
  const moving = f.model.getObjectByName('coolant_turret_hose_outlet');
  const beforeFixed = fixed.getWorldPosition(new THREE.Vector3());
  const beforeMoving = moving.getWorldPosition(new THREE.Vector3());
  coolant.setActive(true);
  tick(f, 4);
  coolant.update(0.05);
  assert.ok(fixed.getWorldPosition(new THREE.Vector3()).distanceTo(beforeFixed) < 1e-12);
  assert.ok(moving.getWorldPosition(new THREE.Vector3()).distanceTo(beforeMoving) > 0.1);
  for (const prefix of ['coolant_body', 'coolant_turret']) {
    const stream = f.model.getObjectByName(`${prefix}_stream`);
    const source = f.model.getObjectByName(`${prefix}_hose_outlet`);
    assert.equal(stream.material.color.getHex(), 0xffffff);
    const worldStart = f.model.localToWorld(ringCenter(stream, 0));
    assert.ok(worldStart.distanceTo(source.getWorldPosition(new THREE.Vector3())) < 1e-6);
    const end = ringCenter(stream, 32);
    for (const ring of [0, 16, 32]) {
      const center = ringCenter(stream, ring);
      const edge = new THREE.Vector3().fromBufferAttribute(stream.geometry.getAttribute('position'), ring * 9);
      assert.ok(Math.abs(center.distanceTo(edge) - 0.0065) < 0.0005);
    }
    assert.ok(end.x >= f.chuck.position.x + 0.159 - 1e-6);
    assert.ok(end.x <= f.rig.spindleCenter.x + 0.035 + 1e-6);
    assert.ok(Math.abs(Math.hypot(end.y - f.rig.spindleCenter.y, end.z - f.rig.spindleCenter.z) - 0.0195) < 1e-6);
  }
  f.model.traverse(o => assert.ok(!o.isPoints && !o.isSprite));
  for (const prefix of ['coolant_body', 'coolant_turret']) {
    const splash = f.model.getObjectByName(`${prefix}_stream_local_splashes`);
    const impact = f.model.getObjectByName(`${prefix}_stream_impact`);
    assert.ok(splash.count > 0);
    for (let i = 0; i < splash.count; i++) {
      const matrix = new THREE.Matrix4();
      splash.getMatrixAt(i, matrix);
      const position = new THREE.Vector3().setFromMatrixPosition(matrix);
      assert.ok(position.distanceTo(impact.position) < 0.3);
    }
  }
  const colors = f.model.getObjectByName('coolant_turret_stream').geometry.getAttribute('color');
  const shade = colors.getX(10);
  coolant.update(0.05);
  assert.notEqual(colors.getX(10), shade);
  coolant.dispose();
});

test('coolant fades out and disposes each shared hose geometry and material once', () => {
  const f = fixture();
  const coolant = new MachineCoolantEffect(f.model, f.chuck, f.part, { diameter: 39, length: 70 }, f.rig);
  const roots = ['machine_coolant_streams', 'coolant_body_hose', 'coolant_turret_hose'].map(name => f.model.getObjectByName(name));
  const resources = new Set();
  for (const root of roots) root.traverse(o => {
    if (!o.isMesh) return;
    resources.add(o.geometry);
    resources.add(o.material);
  });
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  coolant.setActive(true);
  for (let i = 0; i < 20; i++) coolant.update(0.05);
  assert.equal(roots[0].visible, true);
  coolant.setActive(false);
  for (let i = 0; i < 40; i++) coolant.update(0.05);
  assert.equal(roots[0].visible, false);
  coolant.dispose();
  assert.equal(disposed.size, resources.size);
  assert.ok([...disposed.values()].every(count => count === 1));
  assert.ok(roots.every(root => root.parent === null));
  assert.equal(f.rig.head.parent, f.rig.slide);
});
