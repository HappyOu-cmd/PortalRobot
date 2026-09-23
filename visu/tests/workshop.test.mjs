import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, cacheDir: join(tmpdir(), 'portal-workshop-tests'),
  root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, watch: null },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { WorkshopTraffic, getWorkshopLayout, FORKLIFT } = await server.ssrLoadModule('/src/three/workshopTraffic.ts');
const { Workshop } = await server.ssrLoadModule('/src/three/workshop.ts');
const { ForkliftDriver } = await server.ssrLoadModule('/src/three/forkliftDriver.ts');
const { DEFAULT_LAYOUT } = await server.ssrLoadModule('/src/model/defaults.ts');
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const layout = getWorkshopLayout(DEFAULT_LAYOUT);

test('one box completes near → forks → far → forks → near without a reset teleport', () => {
  const traffic = new WorkshopTraffic(layout);
  const owners = traffic.phases.map(p => p.cargo).filter((owner, i, all) => i === 0 || all[i - 1] !== owner);
  assert.deepEqual(owners, ['near', 'forks', 'far', 'forks', 'near']);
  const start = traffic.sample(0), end = traffic.sample(traffic.duration - 1e-7);
  near(start.x, end.x); near(start.z, end.z); near(angle(start.yaw, end.yaw), 0);
  near(start.lift, end.lift); near(start.tilt, end.tilt);
  assert.equal(start.cargo, end.cargo);
  near(traffic.sample(traffic.duration + 0.5).x, traffic.sample(0.5).x);
});

test('every phase boundary has continuous position, heading and cargo support', () => {
  const traffic = new WorkshopTraffic(layout);
  let time = 0;
  for (const phase of traffic.phases) {
    time += phase.duration;
    const before = traffic.sample(time - 1e-7), after = traffic.sample(time + 1e-7);
    near(before.x, after.x); near(before.z, after.z);
    near(angle(before.yaw, after.yaw), 0);
    near(before.lift, after.lift); near(before.tilt, after.tilt);
    if (before.cargo !== after.cargo) {
      near(after.x + FORKLIFT.cargoZ, layout.bayX);
      near(after.lift + FORKLIFT.forkTop, FORKLIFT.cargoBottom);
      near(after.tilt, 0); near(angle(after.yaw, Math.PI / 2), 0);
      assert.ok(Math.min(Math.abs(after.z - layout.nearZ), Math.abs(after.z - layout.farZ)) < 1e-5);
    }
  }
});

test('traffic stays inside the workshop and clear of the robot with low transport height', () => {
  for (const cell of [DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, floor: { lengthX: 17000, widthY: 7200 } }]) {
    const plan = getWorkshopLayout(cell), traffic = new WorkshopTraffic(plan);
    for (let t = 0; t < traffic.duration; t += 0.025) {
      const frame = traffic.sample(t);
      assert.ok(Math.abs(frame.speed) <= 1.151);
      assert.ok(Math.abs(frame.steering) < 0.8);
      assert.ok(frame.lift >= 0 && frame.lift <= 0.281);
      for (const x of [-0.7, 0.7]) for (const z of [-2.05, 1.83]) {
        const wx = frame.x + Math.cos(frame.yaw) * x + Math.sin(frame.yaw) * z;
        const wz = frame.z - Math.sin(frame.yaw) * x + Math.cos(frame.yaw) * z;
        assert.ok(wx > plan.minX && wx < plan.cellLeft, `swept X ${wx}`);
        assert.ok(wz > plan.minZ && wz < plan.maxZ, `swept Z ${wz}`);
      }
      if (Math.abs(frame.speed) > 0.01 && frame.cargo === 'forks') near(frame.lift, FORKLIFT.travelLift);
    }
  }
});

test('actual scene carries the same box on the forks, returns it to its pallet and pauses', () => {
  const scene = new Workshop(DEFAULT_LAYOUT, false);
  try {
    const identity = scene.cargo.uuid;
    const initial = scene.cargo.position.clone();
    const world = new THREE.Vector3();
    let previous = initial.clone();
    let pickedUp = false, leftAtFar = false, carriedBack = false;
    const step = 0.05;
    for (let i = 1; i <= Math.ceil(scene.traffic.duration / step); i++) {
      scene.update(step, false);
      const frame = scene.traffic.sample(i * step);
      assert.equal(scene.cargo.uuid, identity);
      assert.ok(scene.cargo.position.distanceTo(previous) < 0.08, 'cargo must never teleport');
      previous.copy(scene.cargo.position);
      if (frame.cargo === 'forks') {
        scene.forklift.cargoAnchor.getWorldPosition(world);
        near(world.distanceTo(scene.cargo.position), 0);
        pickedUp = true;
        if (leftAtFar) carriedBack = true;
      }
      if (frame.cargo === 'far') leftAtFar = true;
    }
    assert.ok(pickedUp && leftAtFar && carriedBack);
    near(scene.cargo.position.distanceTo(initial), 0);
    const frozen = scene.forklift.root.position.clone();
    for (let i = 0; i < 20; i++) scene.update(step, true);
    near(scene.forklift.root.position.distanceTo(frozen), 0);
  } finally { scene.dispose(); }
});

test('workshop batches fixed meshes, reuses animation resources and disposes owned textures', () => {
  const scene = new Workshop(DEFAULT_LAYOUT, false);
  const resources = new Set(), meshes = [];
  let disposed = 0;
  scene.root.traverse(object => {
    if (!object.isMesh) return;
    meshes.push(object.uuid); resources.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  assert.ok(meshes.length < 140, `${meshes.length} workshop meshes`);
  for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
  for (let i = 0; i < 300; i++) scene.update(0.05, false);
  const afterMeshes = [];
  scene.root.traverse(object => { if (object.isMesh) afterMeshes.push(object.uuid); });
  assert.deepEqual(afterMeshes, meshes);
  scene.dispose();
  assert.equal(disposed, resources.size);
  scene.dispose();
  assert.equal(disposed, resources.size, 'idempotent disposal');
});

test('the bundled realistic worker is seated, grips the wheel and stays inside the cab', async () => {
  const file = await readFile(new URL('../src/assets/models/workshop/worker.glb', import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength));
  assert.equal(json.asset.extras.license, 'CC0');
  assert.ok(json.images.length > 0, 'the shipped model must retain its detailed texture');
  assert.equal(json.materials[0].pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(json.materials[0].emissiveTexture, undefined);
  const primitive = json.meshes[0].primitives[0];
  assert.ok(json.accessors[primitive.indices].count / 3 < 40000, 'keep geometry suitable for the HMI');
  // Headless parsing uses the actual mesh, weights and skeleton. Only image
  // decoding is skipped because Node has no browser image API.
  json.materials = [{ name: 'worker' }]; delete json.images; delete json.textures; delete json.samplers;
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const binary = file.subarray(20 + jsonLength);
  const buffer = Buffer.alloc(20 + padded.length + binary.length);
  buffer.writeUInt32LE(0x46546c67, 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(padded.length, 12); buffer.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(buffer, 20); binary.copy(buffer, 20 + padded.length);
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer, '');
  const scene = new Workshop(DEFAULT_LAYOUT, false);
  const driver = new ForkliftDriver(gltf.scene);
  scene.forklift.root.add(driver.root);
  try {
    for (const yaw of [0, Math.PI / 2, Math.PI]) for (const steering of [-0.65, 0, 0.65]) {
      scene.forklift.root.rotation.y = yaw;
      scene.forklift.steeringWheel.rotation.z = steering * 2.3;
      driver.update(0.05, scene.forklift.root, scene.forklift.steeringWheel, steering < 0);
      scene.root.updateMatrixWorld(true);
      for (const [name, side] of [['Left', 1], ['Right', -1]]) {
        const hand = driver.root.getObjectByName(`${name}Hand`).getWorldPosition(new THREE.Vector3());
        const onWheel = scene.forklift.steeringWheel.worldToLocal(hand);
        assert.ok(Math.abs(onWheel.z) < 0.025 && Math.abs(Math.hypot(onWheel.x, onWheel.y) - 0.157) < 0.025,
          `hand misses rim: ${onWheel.toArray()}`);
        const foot = scene.forklift.root.worldToLocal(driver.root.getObjectByName(`${name}Foot`).getWorldPosition(new THREE.Vector3()));
        assert.ok(foot.y > 0.55 && foot.y < 0.8, `foot height ${foot.y}`);
      }
      const head = scene.forklift.root.worldToLocal(driver.root.getObjectByName('head_end').getWorldPosition(new THREE.Vector3()));
      assert.ok(head.y < 2.17 && head.y > 1.85, `head height ${head.y}`);
      driver.root.traverse(object => {
        if (!object.isSkinnedMesh) return;
        object.skeleton.update();
        const vertex = new THREE.Vector3();
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 53) {
          object.getVertexPosition(i, vertex);
          scene.forklift.root.worldToLocal(object.localToWorld(vertex));
          assert.ok(Number.isFinite(vertex.length()) && Math.abs(vertex.x) < 0.55
            && vertex.y > 0.4 && vertex.y < 2.2 && vertex.z > -1.4 && vertex.z < -0.08,
          `worker skin outside cab: ${vertex.toArray()}`);
        }
      });
    }
  } finally { driver.dispose(); scene.dispose(); }
});
