import * as THREE from 'three';
import { WorkshopAssets } from './workshopAssets';
import { FORKLIFT, type TrafficFrame } from './workshopTraffic';

export interface ForkliftRig {
  root: THREE.Group;
  mast: THREE.Group;
  carriage: THREE.Group;
  cargoAnchor: THREE.Object3D;
  wheels: { swivel: THREE.Group; spin: THREE.Group; rear: boolean; side: number }[];
  steeringWheel: THREE.Group;
  beacon: THREE.MeshStandardMaterial;
  brake: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  piston: THREE.Mesh;
  blueSpot: THREE.Mesh;
}

export function createForklift(a: WorkshopAssets): ForkliftRig {
  const root = new THREE.Group(); root.name = 'WorkshopForklift';
  const body = new THREE.Group(); body.name = 'ForkliftBody'; root.add(body);
  const yellow = a.surface(0xe9a91a, { roughness: 0.36, metalness: 0.32 });
  const dark = a.surface(0x273035, { roughness: 0.48, metalness: 0.48 });
  const black = a.surface(0x161b1e, { roughness: 0.84, metalness: 0.03 });
  const steel = a.surface(0x87949b, { roughness: 0.29, metalness: 0.82 });
  const chrome = a.surface(0xc9d2d6, { roughness: 0.16, metalness: 0.95 });
  const tire = a.surface(0x252829, { roughness: 0.94, metalness: 0 });
  const light = a.surface(0xf4f5dc, { emissive: 0xfff1c8, emissiveIntensity: 1.9, roughness: 0.2 });
  const beacon = a.surface(0xffbd18, { emissive: 0xff9800, emissiveIntensity: 1.2 });
  const brake = a.surface(0xa32118, { emissive: 0xf92911, emissiveIntensity: 0.4 });
  const reverse = a.surface(0xe4dfc6, { emissive: 0xffedd1, emissiveIntensity: 0.1 });
  const glass = a.surface(0xc3e1e7, { transparent: true, opacity: 0.18, metalness: 0.3,
    roughness: 0.14, depthWrite: false, side: THREE.DoubleSide });

  a.box(body, dark, [1.1, 0.28, 2.25], [0, 0.40, -0.83], true);
  a.box(body, yellow, [1.08, 0.74, 0.70], [0, 0.75, -1.57], true);
  a.box(body, yellow, [0.98, 0.24, 1.28], [0, 0.66, -0.64], true);
  a.box(body, dark, [1.13, 0.11, 0.18], [0, 0.36, -1.99], true);
  a.box(body, black, [0.81, 0.035, 0.62], [0, 0.807, -1.45], true);
  for (const side of [-1, 1]) {
    a.box(body, yellow, [0.22, 0.09, 0.91], [side * 0.53, 0.68, -0.10], true);
    a.box(body, dark, [0.21, 0.045, 0.45], [side * 0.57, 0.30, -0.74]);
    for (let i = 0; i < 5; i++) a.box(body, steel, [0.2, 0.006, 0.016], [side * 0.57, 0.326, -0.91 + i * 0.08]);
    a.tube(body, dark, 0.035, [side * 0.49, 0.68, -1.34], [side * 0.49, 2.15, -1.30]);
    a.tube(body, dark, 0.034, [side * 0.49, 0.66, 0.02], [side * 0.49, 2.15, -0.08]);
    a.tube(body, yellow, 0.025, [side * 0.52, 0.85, -0.01], [side * 0.52, 1.3, -0.12]);
    a.box(body, dark, [0.16, 0.13, 0.1], [side * 0.47, 2.02, 0.015], true);
    a.box(body, light, [0.115, 0.078, 0.012], [side * 0.47, 2.02, 0.072]);
    a.box(body, brake, [0.17, 0.09, 0.025], [side * 0.38, 0.86, -1.927], true);
    a.box(body, reverse, [0.075, 0.065, 0.027], [side * 0.38, 0.72, -1.928]);
    const mirror = a.box(body, dark, [0.17, 0.21, 0.055], [side * 0.66, 1.91, -0.08], true);
    mirror.rotation.y = -side * 0.38;
    a.box(mirror, chrome, [0.78, 0.82, 0.025], [0, 0, -0.515]);
    a.tube(body, dark, 0.012, [side * 0.48, 1.89, -0.08], [side * 0.65, 1.91, -0.08]);
    for (let i = 0; i < 6; i++) a.box(body, black, [0.012, 0.018, 0.33], [side * 0.546, 0.71 + i * 0.042, -1.53]);
    const badge = a.decal(body, a.label('E 25', '#e9a91a'), 0.44, 0.20, [side * 0.555, 0.94, -1.54]);
    badge.rotation.y = side * Math.PI / 2;
  }
  a.box(body, dark, [1.11, 0.07, 1.44], [0, 2.18, -0.70], true);
  for (let i = 0; i < 7; i++) a.box(body, steel, [0.035, 0.035, 1.31], [-0.44 + i * 0.145, 2.226, -0.70]);
  a.box(body, glass, [0.91, 0.76, 0.012], [0, 1.69, -0.055]);
  a.tube(body, black, 0.008, [0.3, 1.33, -0.043], [-0.04, 1.76, -0.043]);
  a.box(body, black, [0.56, 0.15, 0.53], [0, 0.99, -0.91], true);
  const seatBack = a.box(body, black, [0.56, 0.52, 0.13], [0, 1.26, -1.15], true);
  seatBack.rotation.x = -0.09;
  a.box(body, black, [0.49, 0.16, 0.13], [0, 1.6, -1.18], true);
  a.tube(body, dark, 0.035, [0, 0.64, -0.15], [0, 1.39, -0.6]);
  a.box(body, dark, [0.61, 0.16, 0.19], [0, 1.12, -0.10], true);
  a.decal(body, a.label('48 V  |  READY', '#122d31', '#76dbb1'), 0.2, 0.08, [0, 1.16, -0.201]).rotation.y = Math.PI;
  for (const x of [0.3, 0.38]) {
    a.tube(body, steel, 0.009, [x, 0.77, -0.59], [x, 1.04, -0.45]);
    a.box(body, black, [0.04, 0.045, 0.05], [x, 1.04, -0.45], true);
  }
  a.box(body, dark, [0.14, 0.05, 0.25], [0.17, 0.59, -0.21]);
  a.tube(body, black, 0.072, [0.3, 2.2, -1.1], [0.3, 2.27, -1.1]);
  a.tube(body, beacon, 0.065, [0.3, 2.27, -1.1], [0.3, 2.37, -1.1]);
  a.decal(body, a.label('LOGISTICS  /  07', '#273035', '#efeee5'), 0.66, 0.14, [0, 0.91, -1.928]).rotation.y = Math.PI;
  a.batch(body);

  const steeringWheel = new THREE.Group(); root.add(steeringWheel);
  steeringWheel.position.set(0, 1.44, -0.61); steeringWheel.rotation.x = -0.65;
  a.mesh(steeringWheel, a.geometry(new THREE.TorusGeometry(0.17, 0.014, 8, 24)), black, [0, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    a.tube(steeringWheel, dark, 0.008, [0, 0, 0], [Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0]);
  }
  a.batch(steeringWheel);

  const wheels: ForkliftRig['wheels'] = [];
  for (const rear of [false, true]) for (const side of [-1, 1]) {
    const radius = rear ? FORKLIFT.rearRadius : FORKLIFT.frontRadius;
    const swivel = new THREE.Group(); root.add(swivel);
    swivel.position.set(side * 0.52, radius, rear ? -FORKLIFT.wheelbase : 0);
    const spin = new THREE.Group(); swivel.add(spin);
    a.tube(spin, tire, radius, [-0.125, 0, 0], [0.125, 0, 0]);
    const rim = a.geometry(new THREE.TorusGeometry(radius * 0.76, radius * 0.23, 10, 32));
    for (const edge of [-0.105, 0.105]) {
      const shoulder = a.mesh(spin, rim, tire, [edge, 0, 0]); shoulder.rotation.y = Math.PI / 2;
      a.tube(spin, steel, radius * 0.5, [edge, 0, 0], [edge + Math.sign(edge) * 0.012, 0, 0]);
    }
    a.tube(spin, dark, radius * 0.21, [side * 0.13, 0, 0], [side * 0.15, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      a.tube(spin, chrome, 0.017, [side * 0.137, Math.cos(angle) * radius * 0.34, Math.sin(angle) * radius * 0.34],
        [side * 0.15, Math.cos(angle) * radius * 0.34, Math.sin(angle) * radius * 0.34]);
    }
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28;
      const tread = a.box(spin, black, [0.19, 0.008, 0.025], [0, Math.cos(angle) * radius, Math.sin(angle) * radius]);
      tread.rotation.x = angle;
    }
    a.batch(spin); wheels.push({ swivel, spin, rear, side });
  }

  const mast = new THREE.Group(); mast.name = 'ForkliftTiltMast'; mast.position.set(0, 0.35, 0.35); root.add(mast);
  const fixed = new THREE.Group(); mast.add(fixed);
  for (const x of [-0.39, 0.39]) {
    a.box(fixed, dark, [0.09, 2.05, 0.085], [x, 0.83, 0]);
    a.box(fixed, steel, [0.042, 1.99, 0.045], [x - Math.sign(x) * 0.046, 0.85, 0.017]);
    a.box(fixed, dark, [0.05, 1.92, 0.075], [x - Math.sign(x) * 0.098, 0.87, -0.045]);
    a.tube(fixed, steel, 0.055, [x, 1.76, -0.10], [x, 1.76, 0.08]);
    for (let i = 0; i < 26; i++) a.box(fixed, steel, [0.022, 0.026, 0.028], [x * 0.74, 0.12 + i * 0.061, 0.02]);
  }
  a.box(fixed, dark, [0.86, 0.095, 0.15], [0, 1.88, 0]);
  a.box(fixed, dark, [0.86, 0.10, 0.16], [0, -0.14, 0]);
  a.tube(fixed, dark, 0.058, [0, -0.1, -0.09], [0, 0.75, -0.09]);
  a.batch(fixed);
  const piston = a.tube(mast, chrome, 0.026, [0, 0.72, -0.09], [0, 1.51, -0.09]);
  for (const side of [-1, 1]) {
    a.tube(body, dark, 0.045, [side * 0.4, 0.46, -0.3], [side * 0.4, 0.46, 0.10]);
    a.tube(body, chrome, 0.023, [side * 0.4, 0.46, 0.10], [side * 0.4, 0.46, 0.36]);
  }
  const carriage = new THREE.Group(); carriage.name = 'ForkliftLiftCarriage'; mast.add(carriage);
  const moving = new THREE.Group(); carriage.add(moving);
  a.box(moving, dark, [0.95, 0.12, 0.1], [0, 0.34, 0.09]);
  a.box(moving, dark, [0.95, 0.08, 0.10], [0, 0.10, 0.09]);
  a.box(moving, dark, [0.98, 0.045, 0.045], [0, 1.05, 0.1]);
  for (let i = 0; i < 9; i++) a.box(moving, dark, [0.018, 0.96, 0.025], [-0.46 + i * 0.115, 0.58, 0.1]);
  for (const x of [-0.31, 0.31]) {
    a.box(moving, steel, [0.105, 0.49, 0.055], [x, 0.245, 0.14]);
    a.box(moving, steel, [0.105, 0.045, 1.18], [x, -0.0225, 0.755]);
    const tip = a.box(moving, chrome, [0.104, 0.021, 0.11], [x, -0.018, 1.40]);
    tip.rotation.x = -0.12;
  }
  a.batch(moving);
  const cargoAnchor = new THREE.Object3D(); cargoAnchor.position.z = FORKLIFT.cargoZ - mast.position.z;
  carriage.add(cargoAnchor);

  const spotMaterial = a.surface(0x258ffc, { transparent: true, opacity: 0.13, depthWrite: false,
    emissive: 0x007bff, emissiveIntensity: 0.7 });
  const blueSpot = a.mesh(root, a.geometry(new THREE.CircleGeometry(0.38, 32)), spotMaterial, [0, 0.008, -3.1], [1, 1.5, 1]);
  blueSpot.rotation.x = -Math.PI / 2; blueSpot.castShadow = false;
  return { root, mast, carriage, cargoAnchor, wheels, steeringWheel, beacon, brake, reverse, piston, blueSpot };
}

export function updateForklift(rig: ForkliftRig, frame: TrafficFrame, seconds: number, dt: number): void {
  rig.root.position.set(frame.x, 0, frame.z); rig.root.rotation.y = frame.yaw;
  rig.mast.rotation.x = frame.tilt;
  rig.carriage.position.y = FORKLIFT.forkTop - rig.mast.position.y + frame.lift;
  rig.piston.scale.y = 0.79 + frame.lift * 0.5;
  rig.piston.position.y = 0.72 + rig.piston.scale.y / 2;
  for (const wheel of rig.wheels) {
    // Inner/outer rear steering angles share the same instantaneous turn centre.
    const tangent = Math.tan(frame.steering);
    const angle = wheel.rear ? Math.atan(tangent / (1 - wheel.side * 0.52 * tangent / FORKLIFT.wheelbase)) : 0;
    wheel.swivel.rotation.y = THREE.MathUtils.damp(wheel.swivel.rotation.y, angle, 10, dt);
    wheel.spin.rotation.x = frame.wheelDistance / (wheel.rear ? FORKLIFT.rearRadius : FORKLIFT.frontRadius);
  }
  rig.steeringWheel.rotation.z = -frame.steering * 2.3;
  rig.beacon.emissiveIntensity = 0.65 + Math.max(0, Math.sin(seconds * 8)) ** 10 * 3;
  rig.brake.emissiveIntensity = Math.abs(frame.speed) < 0.05 ? 1.5 : 0.25;
  rig.reverse.emissiveIntensity = frame.speed < -0.01 ? 1.7 : 0.05;
  rig.blueSpot.visible = frame.speed < -0.01;
}
