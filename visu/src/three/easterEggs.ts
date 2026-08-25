import * as THREE from 'three';
import type { DriftSettings, DriftTelemetry, EasterEggMode, EasterEggScene } from '../model/easterEggs';
import { DEFAULT_DRIFT_SETTINGS, EASTER_EGG_SCENES } from '../model/easterEggs';
import type { CellLayout } from '../model/types';
import { logicalPosition, mm } from './primitives';
import { createDriftCartScene } from './driftCart';
import { RiggedWorker, type WorkerClip } from './riggedWorkers';

const RANDOM_SCENE_SECONDS = 35;

interface WorkerRig {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  helmet: THREE.Group;
  leftUpperArm: THREE.Group;
  leftLowerArm: THREE.Group;
  leftHand: THREE.Group;
  rightUpperArm: THREE.Group;
  rightLowerArm: THREE.Group;
  rightHand: THREE.Group;
  leftUpperLeg: THREE.Group;
  leftLowerLeg: THREE.Group;
  rightUpperLeg: THREE.Group;
  rightLowerLeg: THREE.Group;
}

interface ComedyScene {
  root: THREE.Group;
  controlsCamera?: boolean;
  setDriftSettings?: (settings: DriftSettings) => void;
  update: (dt: number, camera: THREE.Camera) => void;
  dispose: () => void;
}

class SceneAssets {
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  readonly boxGeometry = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  readonly cylinderGeometry = this.geometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
  readonly sphereGeometry = this.geometry(new THREE.SphereGeometry(0.5, 14, 10));
  readonly workerBlue = this.standard(0x1f6fae, { roughness: 0.68 });
  readonly workerOrange = this.standard(0xe27b24, { roughness: 0.7 });
  readonly workerGreen = this.standard(0x3c8058, { roughness: 0.72 });
  readonly skin = this.standard(0xd5a071, { roughness: 0.82 });
  readonly dark = this.standard(0x26323a, { roughness: 0.62 });
  readonly boot = this.standard(0x171c20, { roughness: 0.76 });
  readonly helmetYellow = this.standard(0xf0ba27, { roughness: 0.48 });
  readonly helmetWhite = this.standard(0xe7edf0, { roughness: 0.5 });
  readonly steel = this.standard(0x8e9ba3, { roughness: 0.3, metalness: 0.72 });
  readonly paper = this.standard(0xeaf2f5, { roughness: 0.9 });
  readonly wood = this.standard(0x91623b, { roughness: 0.88 });
  readonly red = this.standard(0xc73e3e, { roughness: 0.58 });
  readonly green = this.standard(0x28ac61, { roughness: 0.34, emissive: 0x082d16, emissiveIntensity: 0.5 });

  geometry<T extends THREE.BufferGeometry>(value: T): T {
    this.geometries.add(value);
    return value;
  }

  standard(color: THREE.ColorRepresentation, options: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.05, ...options });
    this.materials.add(value);
    return value;
  }

  mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    scale: [number, number, number],
    position: [number, number, number] = [0, 0, 0],
    name = '',
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  box(scale: [number, number, number], position: [number, number, number], material: THREE.Material = this.dark, name = ''): THREE.Mesh {
    return this.mesh(this.boxGeometry, material, scale, position, name);
  }

  cylinder(scale: [number, number, number], position: [number, number, number], material: THREE.Material = this.steel, name = ''): THREE.Mesh {
    return this.mesh(this.cylinderGeometry, material, scale, position, name);
  }

  sphere(scale: [number, number, number], position: [number, number, number], material: THREE.Material = this.skin, name = ''): THREE.Mesh {
    return this.mesh(this.sphereGeometry, material, scale, position, name);
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}

function limb(assets: SceneAssets, length: number, radius: number, material: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(assets.cylinder([radius * 2, length, radius * 2], [0, -length / 2, 0], material));
  return pivot;
}

function createWorker(assets: SceneAssets, suit: THREE.Material, helmetMaterial: THREE.Material): WorkerRig {
  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 1.04;
  torso.add(assets.box([0.47, 0.58, 0.25], [0, 0, 0], suit, 'worker_torso'));
  torso.add(assets.box([0.06, 0.54, 0.264], [0, 0, 0.005], assets.paper, 'reflective_stripe'));
  root.add(torso);
  root.add(assets.box([0.38, 0.24, 0.23], [0, 0.69, 0], assets.dark, 'worker_waist'));

  const head = new THREE.Group();
  head.position.y = 1.53;
  head.add(assets.sphere([0.31, 0.36, 0.3], [0, 0, 0], assets.skin, 'worker_head'));
  head.add(assets.sphere([0.055, 0.045, 0.035], [-0.075, 0.035, 0.148], assets.dark, 'worker_eye_left'));
  head.add(assets.sphere([0.055, 0.045, 0.035], [0.075, 0.035, 0.148], assets.dark, 'worker_eye_right'));
  head.add(assets.box([0.11, 0.035, 0.025], [0, -0.075, 0.153], assets.dark, 'worker_mouth'));
  const helmet = new THREE.Group();
  helmet.position.y = 0.13;
  helmet.add(assets.sphere([0.37, 0.19, 0.36], [0, 0.03, 0], helmetMaterial, 'worker_helmet'));
  helmet.add(assets.cylinder([0.48, 0.045, 0.48], [0, -0.045, 0.015], helmetMaterial, 'worker_helmet_brim'));
  head.add(helmet);
  root.add(head);

  const leftUpperArm = limb(assets, 0.43, 0.085, suit);
  const rightUpperArm = limb(assets, 0.43, 0.085, suit);
  leftUpperArm.position.set(-0.3, 1.31, 0);
  rightUpperArm.position.set(0.3, 1.31, 0);
  const leftLowerArm = limb(assets, 0.38, 0.072, assets.skin);
  const rightLowerArm = limb(assets, 0.38, 0.072, assets.skin);
  leftLowerArm.position.y = -0.43;
  rightLowerArm.position.y = -0.43;
  const leftHand = new THREE.Group();
  const rightHand = new THREE.Group();
  leftHand.position.y = -0.38;
  rightHand.position.y = -0.38;
  leftHand.add(assets.sphere([0.14, 0.14, 0.14], [0, 0, 0], assets.skin, 'worker_hand'));
  rightHand.add(assets.sphere([0.14, 0.14, 0.14], [0, 0, 0], assets.skin, 'worker_hand'));
  leftLowerArm.add(leftHand);
  rightLowerArm.add(rightHand);
  leftUpperArm.add(leftLowerArm);
  rightUpperArm.add(rightLowerArm);
  root.add(leftUpperArm, rightUpperArm);

  const leftUpperLeg = limb(assets, 0.46, 0.105, suit);
  const rightUpperLeg = limb(assets, 0.46, 0.105, suit);
  leftUpperLeg.position.set(-0.13, 0.69, 0);
  rightUpperLeg.position.set(0.13, 0.69, 0);
  const leftLowerLeg = limb(assets, 0.45, 0.09, assets.dark);
  const rightLowerLeg = limb(assets, 0.45, 0.09, assets.dark);
  leftLowerLeg.position.y = -0.46;
  rightLowerLeg.position.y = -0.46;
  leftLowerLeg.add(assets.box([0.18, 0.12, 0.33], [0, -0.43, 0.09], assets.boot, 'worker_boot'));
  rightLowerLeg.add(assets.box([0.18, 0.12, 0.33], [0, -0.43, 0.09], assets.boot, 'worker_boot'));
  leftUpperLeg.add(leftLowerLeg);
  rightUpperLeg.add(rightLowerLeg);
  root.add(leftUpperLeg, rightUpperLeg);

  return {
    root, torso, head, helmet,
    leftUpperArm, leftLowerArm, leftHand,
    rightUpperArm, rightLowerArm, rightHand,
    leftUpperLeg, leftLowerLeg, rightUpperLeg, rightLowerLeg,
  };
}

function resetWorker(worker: WorkerRig): void {
  [
    worker.torso, worker.head, worker.helmet,
    worker.leftUpperArm, worker.leftLowerArm, worker.leftHand,
    worker.rightUpperArm, worker.rightLowerArm, worker.rightHand,
    worker.leftUpperLeg, worker.leftLowerLeg, worker.rightUpperLeg, worker.rightLowerLeg,
  ].forEach((part) => part.rotation.set(0, 0, 0));
  worker.torso.position.set(0, 1.04, 0);
  worker.head.position.set(0, 1.53, 0);
  worker.helmet.position.set(0, 0.13, 0);
}

function animateWalk(worker: WorkerRig, phase: number, amount = 1): void {
  const swing = Math.sin(phase) * 0.72 * amount;
  worker.leftUpperLeg.rotation.x = swing;
  worker.rightUpperLeg.rotation.x = -swing;
  worker.leftLowerLeg.rotation.x = Math.max(0, -swing) * 0.65;
  worker.rightLowerLeg.rotation.x = Math.max(0, swing) * 0.65;
  worker.leftUpperArm.rotation.x = -swing * 0.7;
  worker.rightUpperArm.rotation.x = swing * 0.7;
}

function createWrench(assets: SceneAssets): THREE.Group {
  const root = new THREE.Group();
  root.add(assets.box([0.075, 0.58, 0.06], [0, -0.2, 0], assets.dark, 'wrench_handle'));
  root.add(assets.box([0.1, 0.23, 0.075], [0, 0.1, 0], assets.red, 'wrench_grip'));
  const jawGeometry = assets.geometry(new THREE.TorusGeometry(0.14, 0.043, 6, 10, Math.PI * 1.42));
  const jaw = assets.mesh(jawGeometry, assets.dark, [1, 1, 1], [0, -0.55, 0], 'wrench_jaw');
  jaw.rotation.z = Math.PI * 0.78;
  root.add(jaw);
  return root;
}

function createHammer(assets: SceneAssets): THREE.Group {
  const root = new THREE.Group();
  root.add(assets.box([0.045, 0.45, 0.045], [0, -0.2, 0], assets.wood, 'hammer_handle'));
  root.add(assets.box([0.28, 0.12, 0.13], [0, -0.45, 0], assets.steel, 'hammer_head'));
  return root;
}

function createClipboard(assets: SceneAssets): THREE.Group {
  const root = new THREE.Group();
  root.add(assets.box([0.42, 0.56, 0.035], [0, 0, 0], assets.wood, 'clipboard'));
  root.add(assets.box([0.35, 0.47, 0.012], [0, 0.015, 0.025], assets.paper, 'clipboard_paper'));
  root.add(assets.box([0.15, 0.055, 0.03], [0, 0.27, 0.035], assets.steel, 'clipboard_clip'));
  return root;
}

function createCart(assets: SceneAssets): THREE.Group {
  const root = new THREE.Group();
  root.add(assets.box([1.18, 0.14, 0.68], [0, 0.42, 0], assets.workerBlue, 'cart_platform'));
  root.add(assets.box([0.06, 0.75, 0.06], [-0.55, 0.83, -0.26], assets.steel, 'cart_handle'));
  root.add(assets.box([0.06, 0.75, 0.06], [-0.55, 0.83, 0.26], assets.steel, 'cart_handle'));
  root.add(assets.box([0.06, 0.06, 0.58], [-0.55, 1.19, 0], assets.steel, 'cart_handle_top'));
  for (const x of [-0.42, 0.42]) for (const z of [-0.25, 0.25]) {
    const wheel = assets.cylinder([0.25, 0.11, 0.25], [x, 0.2, z], assets.boot, 'cart_wheel');
    wheel.rotation.x = Math.PI / 2;
    root.add(wheel);
  }
  return root;
}

function observedFromRear(camera: THREE.Camera, target: THREE.Object3D): boolean {
  const position = target.getWorldPosition(new THREE.Vector3());
  if (camera.position.z > position.z - 0.45) return false;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const toTarget = position.sub(camera.position).normalize();
  return direction.dot(toTarget) > 0.82;
}

function smooth(value: number, start: number, end: number): number {
  return THREE.MathUtils.smoothstep(value, start, end);
}

function pulse(value: number, start: number, peak: number, end: number): number {
  return smooth(value, start, peak) * (1 - smooth(value, peak, end));
}

function triangle(value: number): number {
  return 1 - Math.abs((value % 2) - 1);
}

function setupFight(assets: SceneAssets, caughtMode: boolean): ComedyScene {
  const root = new THREE.Group();
  const left = createWorker(assets, assets.workerBlue, assets.helmetYellow);
  const right = createWorker(assets, assets.workerOrange, assets.helmetWhite);
  const wrench = createWrench(assets);
  wrench.rotation.z = Math.PI;
  left.rightHand.add(wrench);

  const toolbox = new THREE.Group();
  toolbox.position.set(-1.38, 0, 0.48);
  toolbox.rotation.y = -0.22;
  toolbox.add(assets.box([0.72, 0.24, 0.42], [0, 0.12, 0], assets.red, 'fight_toolbox'));
  const toolboxLid = assets.box([0.72, 0.08, 0.42], [0, 0.4, 0.15], assets.red, 'fight_toolbox_lid');
  toolboxLid.rotation.x = -0.72;
  toolbox.add(toolboxLid);

  const nutGeometry = assets.geometry(new THREE.TorusGeometry(0.07, 0.026, 6, 6));
  const looseNuts = [
    [-0.78, 0.035, -0.48, 0.2],
    [-0.45, 0.035, -0.57, -0.45],
    [0.2, 0.035, -0.5, 0.7],
  ].map(([x, y, z, rotation]) => {
    const nut = assets.mesh(nutGeometry, assets.steel, [1, 1, 1], [x, y, z], 'fight_loose_nut');
    nut.rotation.x = Math.PI / 2;
    nut.rotation.z = rotation;
    return nut;
  });

  const impactBurst = new THREE.Group();
  impactBurst.position.set(0, 1.36, -0.28);
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    const ray = assets.box([0.22, 0.045, 0.035], [Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0], assets.helmetYellow, 'fight_impact_ray');
    ray.rotation.z = angle;
    impactBurst.add(ray);
  }

  const clipboard = createClipboard(assets);
  clipboard.visible = false;
  clipboard.position.set(0, 1.13, -0.31);
  clipboard.rotation.x = -0.18;
  clipboard.rotation.y = Math.PI;
  root.add(left.root, right.root, toolbox, ...looseNuts, impactBurst, clipboard);
  let elapsed = 0;
  let observed = 0;

  const updateFight = (time: number) => {
    resetWorker(left);
    resetWorker(right);
    const cycle = time % 10.8;
    const footwork = Math.sin(time * 3.4);
    const bounce = Math.abs(Math.sin(time * 3.4)) * 0.025;
    left.root.position.set(-0.9 + Math.sin(time * 0.72) * 0.035, bounce, Math.sin(time * 0.72) * 0.08);
    right.root.position.set(0.9 - Math.sin(time * 0.72) * 0.035, 0.025 - bounce, -Math.sin(time * 0.72) * 0.08);
    left.root.rotation.set(0, Math.PI / 2, 0);
    right.root.rotation.set(0, -Math.PI / 2, 0);

    // Базовая боксёрская стойка: плечи работают в локальной X-плоскости,
    // поэтому после разворота персонажей руки направлены к противнику, а не в стороны.
    left.leftUpperArm.rotation.set(-1.02, 0, -0.12);
    left.leftLowerArm.rotation.x = -1.08;
    left.rightUpperArm.rotation.set(-1.08, 0, 0.14);
    left.rightLowerArm.rotation.x = -1.02;
    right.leftUpperArm.rotation.set(-1.05, 0, -0.14);
    right.leftLowerArm.rotation.x = -1.05;
    right.rightUpperArm.rotation.set(-1.02, 0, 0.12);
    right.rightLowerArm.rotation.x = -1.08;
    left.leftUpperLeg.rotation.x = footwork * 0.08;
    left.rightUpperLeg.rotation.x = -footwork * 0.08;
    right.leftUpperLeg.rotation.x = -footwork * 0.08;
    right.rightUpperLeg.rotation.x = footwork * 0.08;
    left.head.rotation.y = Math.sin(time * 1.1) * 0.08;
    right.head.rotation.y = -Math.sin(time * 1.1) * 0.08;

    const wrenchWindup = pulse(cycle, 1.05, 1.68, 2.08);
    const wrenchStrike = pulse(cycle, 1.92, 2.27, 2.82);
    left.rightUpperArm.rotation.x = THREE.MathUtils.lerp(left.rightUpperArm.rotation.x, -2.48, wrenchWindup);
    left.rightLowerArm.rotation.x = THREE.MathUtils.lerp(left.rightLowerArm.rotation.x, -0.28, wrenchWindup);
    left.rightUpperArm.rotation.x = THREE.MathUtils.lerp(left.rightUpperArm.rotation.x, -1.52, wrenchStrike);
    left.rightLowerArm.rotation.x = THREE.MathUtils.lerp(left.rightLowerArm.rotation.x, 0.04, wrenchStrike);
    left.torso.rotation.z = -0.2 * wrenchWindup + 0.24 * wrenchStrike;
    left.root.position.x += wrenchStrike * 0.2;
    right.leftUpperArm.rotation.x = THREE.MathUtils.lerp(right.leftUpperArm.rotation.x, -1.62, wrenchStrike);
    right.leftLowerArm.rotation.x = THREE.MathUtils.lerp(right.leftLowerArm.rotation.x, -0.08, wrenchStrike);
    right.rightUpperArm.rotation.x = THREE.MathUtils.lerp(right.rightUpperArm.rotation.x, -1.42, wrenchStrike);
    right.rightLowerArm.rotation.x = THREE.MathUtils.lerp(right.rightLowerArm.rotation.x, -0.22, wrenchStrike);
    right.root.position.x += wrenchStrike * 0.16;
    right.root.rotation.z = -0.22 * wrenchStrike;
    right.head.rotation.z = 0.34 * wrenchStrike;

    const shove = pulse(cycle, 3.18, 3.72, 4.4);
    right.leftUpperArm.rotation.x = THREE.MathUtils.lerp(right.leftUpperArm.rotation.x, -1.54, shove);
    right.leftLowerArm.rotation.x = THREE.MathUtils.lerp(right.leftLowerArm.rotation.x, 0.02, shove);
    right.rightUpperArm.rotation.x = THREE.MathUtils.lerp(right.rightUpperArm.rotation.x, -1.54, shove);
    right.rightLowerArm.rotation.x = THREE.MathUtils.lerp(right.rightLowerArm.rotation.x, 0.02, shove);
    right.root.position.x -= shove * 0.32;
    left.root.position.x -= shove * 0.22;
    left.root.rotation.z = shove * 0.28;
    left.head.rotation.z = -shove * 0.22;

    const jab = pulse(cycle, 5.15, 5.56, 6.14);
    right.rightUpperArm.rotation.x = THREE.MathUtils.lerp(right.rightUpperArm.rotation.x, -1.58, jab);
    right.rightLowerArm.rotation.x = THREE.MathUtils.lerp(right.rightLowerArm.rotation.x, 0.02, jab);
    right.torso.rotation.z = -0.18 * jab;
    right.root.position.x -= jab * 0.18;
    left.root.position.y -= jab * 0.22;
    left.torso.rotation.z = -0.46 * jab;
    left.head.rotation.z = 0.42 * jab;
    left.leftUpperArm.rotation.x = THREE.MathUtils.lerp(left.leftUpperArm.rotation.x, -1.7, jab);
    left.leftLowerArm.rotation.x = THREE.MathUtils.lerp(left.leftLowerArm.rotation.x, -0.2, jab);

    const counter = pulse(cycle, 6.75, 7.32, 8.02);
    left.rightUpperArm.rotation.x = THREE.MathUtils.lerp(left.rightUpperArm.rotation.x, -1.52, counter);
    left.rightLowerArm.rotation.x = THREE.MathUtils.lerp(left.rightLowerArm.rotation.x, 0.04, counter);
    left.rightUpperArm.rotation.z += counter * 0.28;
    left.root.position.x += counter * 0.2;
    right.root.position.x += counter * 0.34;
    right.root.rotation.z = -counter * 0.34;
    right.torso.rotation.z = -counter * 0.22;
    right.head.rotation.z = counter * 0.5;

    const helmetTime = THREE.MathUtils.clamp((cycle - 7.25) / 1.65, 0, 1);
    const helmetFlight = Math.sin(helmetTime * Math.PI);
    right.helmet.position.set(-0.56 * helmetTime, 0.13 + helmetFlight * 0.82 - helmetTime * 1.48, -0.3 * helmetTime);
    right.helmet.rotation.set(helmetTime * 2.4, helmetTime * 1.7, helmetTime * 4.2);

    const impact = Math.max(wrenchStrike, shove * 0.75, jab * 0.65, counter);
    impactBurst.visible = impact > 0.62;
    impactBurst.scale.setScalar(0.72 + impact * 0.48);
    impactBurst.rotation.z = time * 0.7;
    impactBurst.position.x = jab > counter ? -0.18 : counter > wrenchStrike ? 0.22 : 0;
  };

  return {
    root,
    update: (dt, camera) => {
      elapsed += dt;
      updateFight(elapsed);
      if (!caughtMode) return;
      const seen = elapsed > 3 && observedFromRear(camera, root);
      observed = THREE.MathUtils.clamp(observed + dt * (seen ? 1 : -0.55), 0, 3);
      const caught = smooth(observed, 1.65, 2.3);
      if (caught <= 0) {
        clipboard.visible = false;
        wrench.visible = true;
        return;
      }
      clipboard.visible = true;
      wrench.visible = caught < 0.55;
      impactBurst.visible = false;
      clipboard.scale.setScalar(caught);
      left.root.position.lerp(new THREE.Vector3(-0.34, 0, 0), caught);
      right.root.position.lerp(new THREE.Vector3(0.34, 0, 0), caught);
      left.root.rotation.y = THREE.MathUtils.lerp(left.root.rotation.y, Math.PI, caught);
      right.root.rotation.y = THREE.MathUtils.lerp(right.root.rotation.y, Math.PI, caught);
      left.root.rotation.z *= 1 - caught;
      right.root.rotation.z *= 1 - caught;
      left.leftUpperArm.rotation.x = THREE.MathUtils.lerp(left.leftUpperArm.rotation.x, -1.18, caught);
      left.leftLowerArm.rotation.x = THREE.MathUtils.lerp(left.leftLowerArm.rotation.x, -0.92, caught);
      left.rightUpperArm.rotation.x = THREE.MathUtils.lerp(left.rightUpperArm.rotation.x, -0.6, caught);
      left.rightLowerArm.rotation.x = THREE.MathUtils.lerp(left.rightLowerArm.rotation.x, -0.5, caught);
      right.rightUpperArm.rotation.x = THREE.MathUtils.lerp(right.rightUpperArm.rotation.x, -1.18, caught);
      right.rightLowerArm.rotation.x = THREE.MathUtils.lerp(right.rightLowerArm.rotation.x, -0.92, caught);
      right.leftUpperArm.rotation.x = THREE.MathUtils.lerp(right.leftUpperArm.rotation.x, -0.6, caught);
      right.leftLowerArm.rotation.x = THREE.MathUtils.lerp(right.leftLowerArm.rotation.x, -0.5, caught);
      left.head.rotation.x = -0.18 * caught;
      right.head.rotation.x = -0.18 * caught;
      left.head.rotation.y = -0.16 * caught;
      right.head.rotation.y = 0.16 * caught;
    },
    dispose: () => assets.dispose(),
  };
}

function setupRunaway(assets: SceneAssets): ComedyScene {
  const root = new THREE.Group();
  const worker = createWorker(assets, assets.workerOrange, assets.helmetYellow);
  const part = assets.cylinder([0.42, 0.48, 0.42], [0, 0.21, 0], assets.steel, 'runaway_part');
  part.rotation.z = Math.PI / 2;
  root.add(worker.root, part);
  let elapsed = 0;
  return {
    root,
    update: (dt) => {
      elapsed += dt;
      resetWorker(worker);
      const travel = triangle(elapsed / 5.2) * 4.6 - 2.3;
      const direction = Math.floor(elapsed / 5.2) % 2 === 0 ? 1 : -1;
      part.position.x = travel;
      part.rotation.x += dt * 7.5 * direction;
      worker.root.position.set(travel - direction * 0.72, Math.abs(Math.sin(elapsed * 7.5)) * 0.035, 0.08);
      worker.root.rotation.set(0, direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      animateWalk(worker, elapsed * 8.2 * direction, 1.15);
      worker.torso.rotation.x = -0.24;
      const trip = Math.max(0, Math.sin((elapsed % 5.2) / 5.2 * Math.PI * 5) - 0.72) / 0.28;
      worker.root.rotation.z = -direction * trip * 0.5;
      worker.leftUpperArm.rotation.z -= 0.75 * trip;
      worker.rightUpperArm.rotation.z += 0.75 * trip;
    },
    dispose: () => assets.dispose(),
  };
}

function setupTea(assets: SceneAssets): ComedyScene {
  const root = new THREE.Group();
  const worker = createWorker(assets, assets.workerGreen, assets.helmetWhite);
  const crate = assets.box([0.82, 0.58, 0.7], [0, 0.29, 0], assets.wood, 'tea_crate');
  const mug = new THREE.Group();
  mug.add(assets.cylinder([0.22, 0.27, 0.22], [0, -0.08, 0], assets.paper, 'tea_mug'));
  mug.add(assets.mesh(assets.geometry(new THREE.TorusGeometry(0.105, 0.028, 6, 12)), assets.paper, [1, 1, 1], [0.13, -0.07, 0], 'tea_mug_handle'));
  worker.rightHand.add(mug);
  const wrench = createWrench(assets);
  wrench.visible = false;
  worker.leftHand.add(wrench);
  const steamMaterial = assets.standard(0xffffff, { transparent: true, opacity: 0.42, roughness: 1 });
  const steam = [0, 1, 2].map((index) => assets.sphere([0.07, 0.1, 0.07], [0, 0, 0], steamMaterial, `tea_steam_${index}`));
  steam.forEach((puff) => root.add(puff));
  root.add(crate, worker.root);
  let elapsed = 0;
  let observed = 0;
  return {
    root,
    update: (dt, camera) => {
      elapsed += dt;
      const seen = elapsed > 2.5 && observedFromRear(camera, root);
      observed = THREE.MathUtils.clamp(observed + dt * (seen ? 1 : -0.5), 0, 2.5);
      const caught = smooth(observed, 1.25, 1.9);
      resetWorker(worker);
      worker.root.position.set(0, 0.48 * (1 - caught), 0);
      worker.root.rotation.y = Math.PI;
      worker.leftUpperLeg.rotation.x = THREE.MathUtils.lerp(-1.4, 0, caught);
      worker.rightUpperLeg.rotation.x = THREE.MathUtils.lerp(-1.4, 0, caught);
      worker.leftLowerLeg.rotation.x = THREE.MathUtils.lerp(1.25, 0, caught);
      worker.rightLowerLeg.rotation.x = THREE.MathUtils.lerp(1.25, 0, caught);
      worker.rightUpperArm.rotation.x = THREE.MathUtils.lerp(-1.75 + Math.sin(elapsed * 1.4) * 0.08, 0.2, caught);
      worker.rightLowerArm.rotation.x = THREE.MathUtils.lerp(-1.45, 0.15, caught);
      worker.leftUpperArm.rotation.z = -0.4 * (1 - caught);
      worker.torso.rotation.x = THREE.MathUtils.lerp(-0.08, 0.18, caught);
      worker.head.rotation.y = Math.sin(elapsed * 0.7) * 0.18 * (1 - caught);
      mug.visible = caught < 0.72;
      wrench.visible = caught > 0.28;
      steam.forEach((puff, index) => {
        const rise = (elapsed * 0.22 + index / steam.length) % 0.7;
        puff.visible = mug.visible;
        puff.position.set(0.23 + Math.sin(elapsed * 1.7 + index) * 0.035, 1.12 + rise, 0.24);
        puff.scale.setScalar(0.55 + rise * 0.8);
      });
    },
    dispose: () => assets.dispose(),
  };
}

function setupRobotArgument(assets: SceneAssets): ComedyScene {
  const root = new THREE.Group();
  const worker = createWorker(assets, assets.workerOrange, assets.helmetYellow);
  const wrench = createWrench(assets);
  worker.rightHand.add(wrench);
  const toolHead = new THREE.Group();
  toolHead.add(assets.box([0.34, 0.68, 0.34], [0, 0.34, 0], assets.dark, 'comic_robot_column'));
  toolHead.add(assets.box([0.62, 0.3, 0.48], [0, 0, 0], assets.workerBlue, 'comic_robot_head'));
  const eyeMaterial = assets.standard(0x42d5ff, { emissive: 0x1479a0, emissiveIntensity: 2.2, roughness: 0.2 });
  toolHead.add(assets.sphere([0.14, 0.12, 0.08], [0, 0.03, 0.25], eyeMaterial, 'comic_robot_eye'));
  toolHead.add(assets.box([0.09, 0.38, 0.09], [-0.2, -0.29, 0], assets.steel, 'comic_robot_claw_left'));
  toolHead.add(assets.box([0.09, 0.38, 0.09], [0.2, -0.29, 0], assets.steel, 'comic_robot_claw_right'));
  root.add(worker.root, toolHead);
  let elapsed = 0;
  return {
    root,
    update: (dt) => {
      elapsed += dt;
      resetWorker(worker);
      const threat = (Math.sin(elapsed * 1.35) + 1) / 2;
      toolHead.position.set(0.95 + Math.sin(elapsed * 0.8) * 0.12, 1.75 + threat * 0.2, 0);
      toolHead.rotation.y = Math.sin(elapsed * 1.15) * 0.12;
      worker.root.position.set(-0.65 - threat * 0.38, 0, 0);
      worker.root.rotation.y = Math.PI / 2;
      worker.torso.rotation.z = -0.18 * threat;
      worker.rightUpperArm.rotation.z = -1.2 - Math.sin(elapsed * 3.2) * 0.55;
      worker.rightLowerArm.rotation.z = -0.55;
      worker.leftUpperArm.rotation.z = -0.7 * threat;
      worker.head.rotation.z = 0.14 * threat;
      wrench.rotation.z = Math.PI + Math.sin(elapsed * 3.2) * 0.35;
      eyeMaterial.emissiveIntensity = 1.4 + threat * 2.6;
    },
    dispose: () => assets.dispose(),
  };
}

function setupRitual(assets: SceneAssets): ComedyScene {
  const root = new THREE.Group();
  const left = createWorker(assets, assets.workerBlue, assets.helmetYellow);
  const right = createWorker(assets, assets.workerGreen, assets.helmetWhite);
  const hammer = createHammer(assets);
  left.rightHand.add(hammer);
  const altar = assets.box([0.75, 0.62, 0.75], [0, 0.31, 0], assets.wood, 'ritual_crate');
  const part = assets.cylinder([0.48, 0.5, 0.48], [0, 0.78, 0], assets.steel, 'ritual_part');
  part.rotation.z = Math.PI / 2;
  const beaconMaterial = assets.green.clone();
  assets.materials.add(beaconMaterial);
  const beacon = assets.cylinder([0.22, 0.3, 0.22], [0, 1.02, -0.2], beaconMaterial, 'ritual_beacon');
  root.add(left.root, right.root, altar, part, beacon);
  let elapsed = 0;
  return {
    root,
    update: (dt) => {
      elapsed += dt;
      resetWorker(left);
      resetWorker(right);
      left.root.position.set(-0.88, 0, 0);
      right.root.position.set(0.88, 0, 0);
      left.root.rotation.y = Math.PI / 2;
      right.root.rotation.y = -Math.PI / 2;
      const cycle = elapsed % 4.2;
      const lift = smooth(cycle, 0.35, 1.4) - smooth(cycle, 1.55, 1.82);
      const impact = Math.exp(-Math.pow((cycle - 1.84) * 12, 2));
      left.rightUpperArm.rotation.z = -0.45 - lift * 2.2 + impact * 1.6;
      left.rightLowerArm.rotation.z = -0.3 - lift * 0.75;
      left.torso.rotation.z = -0.16 + impact * 0.25;
      right.leftUpperArm.rotation.z = 0.9 + Math.sin(elapsed * 2.2) * 0.3;
      right.rightUpperArm.rotation.z = -0.9 - Math.sin(elapsed * 2.2) * 0.3;
      right.head.rotation.z = Math.sin(elapsed * 1.1) * 0.16;
      part.position.y = 0.78 + impact * 0.08;
      beaconMaterial.emissive.setHex(impact > 0.08 ? 0x27ff7b : 0x082d16);
      beaconMaterial.emissiveIntensity = 0.4 + impact * 5;
    },
    dispose: () => assets.dispose(),
  };
}

function setupCartRide(assets: SceneAssets): ComedyScene {
  const root = new THREE.Group();
  const cart = createCart(assets);
  const driver = createWorker(assets, assets.workerBlue, assets.helmetWhite);
  const passenger = createWorker(assets, assets.workerOrange, assets.helmetYellow);
  cart.add(passenger.root);
  root.add(cart, driver.root);
  let elapsed = 0;
  return {
    root,
    update: (dt) => {
      elapsed += dt;
      resetWorker(driver);
      resetWorker(passenger);
      const halfCycle = 5.8;
      const direction = Math.floor(elapsed / halfCycle) % 2 === 0 ? 1 : -1;
      const travel = triangle(elapsed / halfCycle) * 4.2 - 2.1;
      const crashPhase = (elapsed % halfCycle) / halfCycle;
      const crash = smooth(crashPhase, 0.82, 0.92);
      cart.position.set(travel, 0, 0);
      cart.rotation.y = direction > 0 ? 0 : Math.PI;
      cart.rotation.z = direction * crash * 0.15;
      passenger.root.position.set(0.05, 0.52, 0);
      passenger.root.rotation.set(0, direction > 0 ? Math.PI / 2 : -Math.PI / 2, -direction * crash * 0.52);
      passenger.leftUpperLeg.rotation.x = -1.42;
      passenger.rightUpperLeg.rotation.x = -1.42;
      passenger.leftLowerLeg.rotation.x = 1.25;
      passenger.rightLowerLeg.rotation.x = 1.25;
      passenger.leftUpperArm.rotation.z = -1.15 - Math.sin(elapsed * 3) * 0.35;
      passenger.rightUpperArm.rotation.z = 1.15 + Math.sin(elapsed * 3) * 0.35;
      driver.root.position.set(travel - direction * 1.02, 0, 0);
      driver.root.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      animateWalk(driver, elapsed * 7.2 * direction, 0.95);
      driver.torso.rotation.x = -0.24 - crash * 0.18;
      driver.leftUpperArm.rotation.x = -1.05;
      driver.rightUpperArm.rotation.x = -1.05;
    },
    dispose: () => assets.dispose(),
  };
}

function setupBoss(assets: SceneAssets): ComedyScene {
  const root = new THREE.Group();
  const worker = createWorker(assets, assets.workerGreen, assets.helmetYellow);
  const wrench = createWrench(assets);
  worker.rightHand.add(wrench);
  const nutGeometry = assets.geometry(new THREE.TorusGeometry(0.48, 0.19, 6, 6));
  const nut = assets.mesh(nutGeometry, assets.steel, [1, 1, 1], [0.85, 0.55, 0], 'boss_nut');
  const healthRoot = new THREE.Group();
  healthRoot.position.set(0.85, 1.55, 0);
  healthRoot.add(assets.box([1.48, 0.22, 0.08], [0, 0, 0], assets.dark, 'boss_health_frame'));
  const healthSegments = Array.from({ length: 7 }, (_, index) => {
    const segment = assets.box([0.17, 0.12, 0.095], [-0.57 + index * 0.19, 0, 0.01], index > 1 ? assets.green : assets.red, `boss_health_${index}`);
    healthRoot.add(segment);
    return segment;
  });
  root.add(worker.root, nut, healthRoot);
  let elapsed = 0;
  return {
    root,
    update: (dt) => {
      elapsed += dt;
      resetWorker(worker);
      const cycle = elapsed % 7;
      const attack = Math.sin(smooth(cycle, 0.6, 1.4) * Math.PI) * (cycle < 1.4 ? 1 : 0);
      const retaliation = Math.sin(smooth(cycle, 3.4, 4.5) * Math.PI) * (cycle > 3.4 && cycle < 4.5 ? 1 : 0);
      worker.root.position.set(-0.7 - retaliation * 0.55, 0, 0);
      worker.root.rotation.set(0, Math.PI / 2, -retaliation * 0.38);
      worker.rightUpperArm.rotation.z = -0.4 - attack * 2.25;
      worker.rightLowerArm.rotation.z = -0.45 - attack * 0.6;
      worker.leftUpperArm.rotation.z = -0.65 - retaliation * 0.6;
      worker.torso.rotation.z = -attack * 0.22;
      nut.position.x = 0.85 + attack * 0.14 - retaliation * 0.3;
      nut.position.y = 0.55 + Math.abs(Math.sin(elapsed * 2.4)) * 0.05 + retaliation * 0.25;
      nut.rotation.z += dt * (0.35 + retaliation * 5);
      const health = cycle < 2.1 ? 7 - Math.floor(cycle / 0.32) : cycle < 5.4 ? 2 : Math.floor(smooth(cycle, 5.4, 6.8) * 5) + 2;
      healthSegments.forEach((segment, index) => { segment.visible = index < health; });
      healthRoot.position.y = 1.55 + Math.sin(elapsed * 2) * 0.035;
    },
    dispose: () => assets.dispose(),
  };
}

function setWorkerAction(worker: RiggedWorker, clip: WorkerClip, loop = true, speed = 1): void {
  worker.play(clip, { loop, speed, fadeSeconds: 0.14 });
}

function setupRiggedFight(caughtMode: boolean): ComedyScene {
  const root = new THREE.Group();
  const fallback = setupFight(new SceneAssets(), caughtMode);
  const assets = new SceneAssets();
  const clipboard = createClipboard(assets);
  clipboard.position.set(0, 1.15, -0.32);
  clipboard.rotation.set(-0.16, Math.PI, 0);
  clipboard.visible = false;
  const toolbox = new THREE.Group();
  toolbox.position.set(-1.42, 0, 0.48);
  toolbox.add(assets.box([0.72, 0.24, 0.42], [0, 0.12, 0], assets.red, 'rigged_fight_toolbox'));
  const lid = assets.box([0.72, 0.08, 0.42], [0, 0.4, 0.15], assets.red, 'rigged_fight_toolbox_lid');
  lid.rotation.x = -0.72;
  toolbox.add(lid);
  root.add(fallback.root);
  let fallbackActive = true;
  let workers: [RiggedWorker, RiggedWorker] | undefined;
  let disposed = false;
  let elapsed = 0;
  let observed = 0;

  void Promise.all([
    RiggedWorker.create({ suitColor: 0x176fb0, pantsColor: 0x203b52, helmetColor: 0xf0ba27, withWrench: true }),
    RiggedWorker.create({ suitColor: 0xe27b24, pantsColor: 0x3d464d, helmetColor: 0xf0f2f3 }),
  ]).then(([left, right]) => {
    if (disposed) {
      left.dispose();
      right.dispose();
      return;
    }
    workers = [left, right];
    root.remove(fallback.root);
    fallback.dispose();
    fallbackActive = false;
    root.add(toolbox, clipboard, left.root, right.root);
  }).catch((error) => {
    console.warn('Не удалось загрузить ригованных слесарей, используется процедурный резерв.', error);
  });

  return {
    root,
    update: (dt, camera) => {
      elapsed += dt;
      if (!workers) {
        fallback.update(dt, camera);
        return;
      }
      const [left, right] = workers;
      const seen = caughtMode && elapsed > 3 && observedFromRear(camera, root);
      observed = THREE.MathUtils.clamp(observed + dt * (seen ? 1 : -0.58), 0, 3);
      const caught = caughtMode ? smooth(observed, 1.55, 2.2) : 0;
      const cycle = elapsed % 9.4;
      let leftClip: WorkerClip = 'idle';
      let rightClip: WorkerClip = 'idle';
      let leftLoop = true;
      let rightLoop = true;
      if (cycle >= 1.15 && cycle < 2.25) {
        leftClip = 'punch';
        leftLoop = false;
        rightClip = 'standing';
      } else if (cycle >= 2.25 && cycle < 3.35) {
        leftClip = 'standing';
        rightClip = 'punch';
        rightLoop = false;
      } else if (cycle >= 3.35 && cycle < 4.65) {
        leftClip = 'slash';
        leftLoop = false;
        rightClip = 'jump';
        rightLoop = false;
      } else if (cycle >= 4.65 && cycle < 6.9) {
        leftClip = 'clapping';
        rightClip = 'death';
        rightLoop = false;
      } else if (cycle >= 6.9) {
        leftClip = 'standing';
        rightClip = 'standing';
      }

      const response = 1 - Math.exp(-dt * 7);
      const leftTarget = caught ? new THREE.Vector3(-0.34, 0, 0) : new THREE.Vector3(-0.78, 0, 0.05);
      const rightTarget = caught ? new THREE.Vector3(0.34, 0, 0) : new THREE.Vector3(0.78, 0, -0.05);
      left.root.position.lerp(leftTarget, response);
      right.root.position.lerp(rightTarget, response);
      const leftRotation = caught ? Math.PI : Math.PI / 2;
      const rightRotation = caught ? Math.PI : -Math.PI / 2;
      left.root.rotation.y = THREE.MathUtils.lerp(left.root.rotation.y, leftRotation, response);
      right.root.rotation.y = THREE.MathUtils.lerp(right.root.rotation.y, rightRotation, response);
      clipboard.visible = caught > 0.08;
      clipboard.scale.setScalar(caught);
      left.setWrenchVisible(caught < 0.55);
      if (caught > 0.35) {
        setWorkerAction(left, 'idle');
        setWorkerAction(right, 'idle');
      } else {
        setWorkerAction(left, leftClip, leftLoop, leftClip === 'clapping' ? 1.35 : 1);
        setWorkerAction(right, rightClip, rightLoop);
      }
      left.update(dt);
      right.update(dt);
    },
    dispose: () => {
      disposed = true;
      if (fallbackActive) fallback.dispose();
      workers?.forEach((worker) => worker.dispose());
      assets.dispose();
    },
  };
}

function setupRiggedCartRide(): ComedyScene {
  const root = new THREE.Group();
  const fallback = setupCartRide(new SceneAssets());
  const assets = new SceneAssets();
  const cart = createCart(assets);
  root.add(fallback.root);
  let fallbackActive = true;
  let workers: [RiggedWorker, RiggedWorker] | undefined;
  let disposed = false;
  let elapsed = 0;

  void Promise.all([
    RiggedWorker.create({ suitColor: 0x176fb0, pantsColor: 0x203b52, helmetColor: 0xf0f2f3 }),
    RiggedWorker.create({ suitColor: 0xe27b24, pantsColor: 0x3d464d, helmetColor: 0xf0ba27 }),
  ]).then(([pusher, passenger]) => {
    if (disposed) {
      pusher.dispose();
      passenger.dispose();
      return;
    }
    workers = [pusher, passenger];
    root.remove(fallback.root);
    fallback.dispose();
    fallbackActive = false;
    cart.add(passenger.root);
    root.add(cart, pusher.root);
    setWorkerAction(pusher, 'run', true, 1.25);
    setWorkerAction(passenger, 'sitting');
  }).catch((error) => {
    console.warn('Не удалось загрузить ригованных гонщиков, используется процедурный резерв.', error);
  });

  return {
    root,
    update: (dt, camera) => {
      elapsed += dt;
      if (!workers) {
        fallback.update(dt, camera);
        return;
      }
      const [pusher, passenger] = workers;
      const halfCycle = 5.8;
      const direction = Math.floor(elapsed / halfCycle) % 2 === 0 ? 1 : -1;
      const travel = triangle(elapsed / halfCycle) * 4.2 - 2.1;
      const crashPhase = (elapsed % halfCycle) / halfCycle;
      const drift = pulse(crashPhase, 0.68, 0.86, 1);
      cart.position.set(travel, 0, 0);
      cart.rotation.set(0, direction > 0 ? 0 : Math.PI, direction * drift * 0.17);
      passenger.root.position.set(0.02, 0.48, 0);
      passenger.root.rotation.set(0, direction > 0 ? Math.PI / 2 : -Math.PI / 2, -direction * drift * 0.28);
      pusher.root.position.set(travel - direction * 1.03, 0, 0);
      pusher.root.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      pusher.root.rotation.z = -direction * drift * 0.12;
      pusher.update(dt);
      passenger.update(dt);
    },
    dispose: () => {
      disposed = true;
      if (fallbackActive) fallback.dispose();
      workers?.forEach((worker) => worker.dispose());
      assets.dispose();
    },
  };
}

function setupRiggedDisco(): ComedyScene {
  const root = new THREE.Group();
  const fallback = setupRitual(new SceneAssets());
  const assets = new SceneAssets();
  const floorMaterials = Array.from({ length: 9 }, (_, index) => assets.standard(
    new THREE.Color().setHSL(index / 9, 0.72, 0.5),
    { emissive: new THREE.Color().setHSL(index / 9, 0.8, 0.24), emissiveIntensity: 0.9, roughness: 0.42 },
  ));
  const danceFloor = new THREE.Group();
  floorMaterials.forEach((floorMaterial, index) => {
    const x = index % 3 - 1;
    const z = Math.floor(index / 3) - 1;
    danceFloor.add(assets.box([0.56, 0.035, 0.56], [x * 0.58, 0.018, z * 0.58], floorMaterial, 'disco_tile'));
  });
  const discoBallMaterial = assets.standard(0xd7eef4, { metalness: 0.85, roughness: 0.16, emissive: 0x194c68, emissiveIntensity: 0.7 });
  const discoBall = assets.sphere([0.42, 0.42, 0.42], [0, 2.45, 0], discoBallMaterial, 'disco_ball');
  const partyLight = new THREE.PointLight(0x49b7ff, 2.4, 5.5, 2);
  partyLight.position.set(0, 2.25, 0);
  root.add(fallback.root);
  let fallbackActive = true;
  let workers: [RiggedWorker, RiggedWorker, RiggedWorker] | undefined;
  let disposed = false;
  let elapsed = 0;

  void Promise.all([
    RiggedWorker.create({ suitColor: 0x176fb0, pantsColor: 0x203b52, helmetColor: 0xf0ba27 }),
    RiggedWorker.create({ suitColor: 0xe27b24, pantsColor: 0x3d464d, helmetColor: 0xf0f2f3 }),
    RiggedWorker.create({ suitColor: 0x3c8058, pantsColor: 0x24362d, helmetColor: 0xf0ba27 }),
  ]).then(([left, center, right]) => {
    if (disposed) {
      left.dispose(); center.dispose(); right.dispose();
      return;
    }
    workers = [left, center, right];
    root.remove(fallback.root);
    fallback.dispose();
    fallbackActive = false;
    left.root.position.set(-0.72, 0.04, 0);
    center.root.position.set(0, 0.04, 0.12);
    right.root.position.set(0.72, 0.04, 0);
    [left, center, right].forEach((worker) => { worker.root.rotation.y = Math.PI; });
    setWorkerAction(left, 'clapping', true, 1.45);
    setWorkerAction(center, 'runningJump', true, 0.92);
    setWorkerAction(right, 'jump', true, 1.18);
    root.add(danceFloor, discoBall, partyLight, left.root, center.root, right.root);
  }).catch((error) => {
    console.warn('Не удалось загрузить ригованную дискотеку, используется процедурный резерв.', error);
  });

  return {
    root,
    update: (dt, camera) => {
      elapsed += dt;
      if (!workers) {
        fallback.update(dt, camera);
        return;
      }
      discoBall.rotation.y += dt * 2.8;
      const hue = (elapsed * 0.16) % 1;
      partyLight.color.setHSL(hue, 0.86, 0.58);
      partyLight.intensity = 1.7 + Math.max(0, Math.sin(elapsed * 7.5)) * 2.4;
      floorMaterials.forEach((floorMaterial, index) => {
        floorMaterial.emissiveIntensity = 0.35 + Math.max(0, Math.sin(elapsed * 5.2 + index * 0.8)) * 1.55;
      });
      workers.forEach((worker, index) => {
        worker.root.rotation.y = Math.PI + Math.sin(elapsed * 1.25 + index * 1.9) * 0.28;
        worker.update(dt);
      });
    },
    dispose: () => {
      disposed = true;
      if (fallbackActive) fallback.dispose();
      workers?.forEach((worker) => worker.dispose());
      partyLight.removeFromParent();
      assets.dispose();
    },
  };
}

function setupRiggedForeman(): ComedyScene {
  const root = new THREE.Group();
  const fallback = setupFight(new SceneAssets(), true);
  const assets = new SceneAssets();
  const clipboard = createClipboard(assets);
  root.add(fallback.root);
  let fallbackActive = true;
  let workers: [RiggedWorker, RiggedWorker, RiggedWorker] | undefined;
  let disposed = false;
  let elapsed = 0;

  void Promise.all([
    RiggedWorker.create({ suitColor: 0x176fb0, pantsColor: 0x203b52, helmetColor: 0xf0ba27, withWrench: true }),
    RiggedWorker.create({ suitColor: 0xe27b24, pantsColor: 0x3d464d, helmetColor: 0xf0ba27 }),
    RiggedWorker.create({ suitColor: 0x687985, pantsColor: 0x222b31, helmetColor: 0xf0f2f3, withWrench: false }),
  ]).then(([left, right, foreman]) => {
    if (disposed) {
      left.dispose(); right.dispose(); foreman.dispose();
      return;
    }
    workers = [left, right, foreman];
    root.remove(fallback.root);
    fallback.dispose();
    fallbackActive = false;
    clipboard.position.set(0, 1.18, 0.28);
    clipboard.rotation.x = -0.2;
    foreman.root.add(clipboard);
    root.add(left.root, right.root, foreman.root);
  }).catch((error) => {
    console.warn('Не удалось загрузить мастера и бригаду, используется процедурный резерв.', error);
  });

  return {
    root,
    update: (dt, camera) => {
      elapsed += dt;
      if (!workers) {
        fallback.update(dt, camera);
        return;
      }
      const [left, right, foreman] = workers;
      const cycle = elapsed % 14;
      const arriving = smooth(cycle, 4.5, 7.2);
      const leaving = smooth(cycle, 11.2, 13.7);
      const inspection = arriving * (1 - leaving);
      left.root.position.set(-0.55, 0, 0);
      right.root.position.set(0.55, 0, 0);
      left.root.rotation.y = THREE.MathUtils.lerp(Math.PI / 2, Math.PI, inspection);
      right.root.rotation.y = THREE.MathUtils.lerp(-Math.PI / 2, Math.PI, inspection);
      left.setWrenchVisible(inspection < 0.42);
      if (inspection > 0.35) {
        setWorkerAction(left, 'standing');
        setWorkerAction(right, 'idle');
      } else {
        setWorkerAction(left, 'slash', true, 0.88);
        setWorkerAction(right, 'clapping', true, 1.3);
      }
      const foremanX = THREE.MathUtils.lerp(2.4, 0.95, arriving * (1 - leaving));
      foreman.root.position.set(foremanX, 0, -0.12);
      foreman.root.rotation.y = -Math.PI / 2;
      setWorkerAction(foreman, inspection > 0.92 ? 'idle' : 'walk', true, 0.9);
      left.update(dt);
      right.update(dt);
      foreman.update(dt);
    },
    dispose: () => {
      disposed = true;
      if (fallbackActive) fallback.dispose();
      workers?.forEach((worker) => worker.dispose());
      assets.dispose();
    },
  };
}

function createScene(
  kind: EasterEggScene,
  layout: CellLayout,
  onDriftTelemetry?: (telemetry: DriftTelemetry) => void,
  driftSettings: DriftSettings = DEFAULT_DRIFT_SETTINGS,
): ComedyScene {
  let scene: ComedyScene;
  if (kind === 'fight') scene = setupRiggedFight(false);
  else if (kind === 'caught') scene = setupRiggedFight(true);
  else if (kind === 'cart') scene = setupRiggedCartRide();
  else if (kind === 'drift') scene = createDriftCartScene(layout, onDriftTelemetry, driftSettings);
  else if (kind === 'disco') scene = setupRiggedDisco();
  else if (kind === 'foreman') scene = setupRiggedForeman();
  else {
    const assets = new SceneAssets();
    if (kind === 'runaway') scene = setupRunaway(assets);
    else if (kind === 'tea') scene = setupTea(assets);
    else if (kind === 'robot') scene = setupRobotArgument(assets);
    else if (kind === 'ritual') scene = setupRitual(assets);
    else scene = setupBoss(assets);
  }

  if (kind === 'drift') {
    scene.root.name = 'EasterEgg_drift';
    return scene;
  }

  const isWideScene = kind === 'runaway' || kind === 'cart';
  const fightGapCenter = layout.machine.machines.length > 1
    ? (layout.machine.machines[0].position.x + layout.machine.sizeX + layout.machine.machines[1].position.x) / 2
    : layout.floor.lengthX * 0.32;
  const x = kind === 'fight' || kind === 'caught' || kind === 'disco' || kind === 'foreman'
    ? THREE.MathUtils.clamp(fightGapCenter, 1600, layout.floor.lengthX - 1600)
    : isWideScene
    ? THREE.MathUtils.clamp(layout.floor.lengthX * 0.5, 3000, layout.floor.lengthX - 3000)
    : kind === 'robot'
      ? THREE.MathUtils.clamp(layout.portal.position.x + layout.portal.lengthX - 950, 1300, layout.floor.lengthX - 900)
      : THREE.MathUtils.clamp(layout.floor.lengthX * 0.63, 1800, layout.floor.lengthX - 1800);
  const y = THREE.MathUtils.clamp(layout.floor.widthY - 430, 1000, layout.floor.widthY - 260);
  scene.root.position.copy(logicalPosition(x, y, 0));
  scene.root.name = `EasterEgg_${kind}`;
  const maxWorkerScale = Math.min(1, mm(layout.floor.widthY) / 3.4);
  scene.root.scale.setScalar(Math.max(0.74, maxWorkerScale));
  return scene;
}

export class EasterEggController {
  readonly root = new THREE.Group();
  private active?: ComedyScene;
  private activeKind?: EasterEggScene;
  private mode: EasterEggMode = 'off';
  private revision = -1;
  private randomElapsed = 0;

  constructor(
    private layout: CellLayout,
    private readonly onDriftTelemetry?: (telemetry: DriftTelemetry) => void,
    private driftSettings: DriftSettings = DEFAULT_DRIFT_SETTINGS,
  ) {
    this.root.name = 'EasterEggs';
  }

  get controlsCamera(): boolean {
    return this.active?.controlsCamera === true;
  }

  setDriftSettings(settings: DriftSettings): void {
    this.driftSettings = settings;
    this.active?.setDriftSettings?.(settings);
  }

  setMode(mode: EasterEggMode, revision = 0): void {
    if (mode === this.mode && revision === this.revision) return;
    const modeChanged = mode !== this.mode;
    this.mode = mode;
    this.revision = revision;
    this.randomElapsed = 0;
    if (mode === 'off') {
      this.clearActive();
      return;
    }
    if (mode === 'random') {
      this.activate(this.pickRandom(modeChanged ? undefined : this.activeKind));
      return;
    }
    this.activate(mode);
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.mode === 'random') {
      this.randomElapsed += dt;
      if (this.randomElapsed >= RANDOM_SCENE_SECONDS) {
        this.randomElapsed = 0;
        this.activate(this.pickRandom(this.activeKind));
      }
    }
    this.active?.update(dt, camera);
  }

  rebuild(layout: CellLayout): void {
    this.layout = layout;
    const kind = this.activeKind;
    this.clearActive();
    if (this.mode === 'random') this.activate(kind ?? this.pickRandom());
    else if (this.mode !== 'off') this.activate(this.mode);
  }

  dispose(): void {
    this.clearActive();
    this.root.removeFromParent();
  }

  private pickRandom(exclude?: EasterEggScene): EasterEggScene {
    const available = EASTER_EGG_SCENES.filter((kind) => kind !== exclude && kind !== 'drift');
    return available[Math.floor(Math.random() * available.length)];
  }

  private activate(kind: EasterEggScene): void {
    if (kind === this.activeKind && this.active) return;
    this.clearActive();
    this.active = createScene(kind, this.layout, this.onDriftTelemetry, this.driftSettings);
    this.activeKind = kind;
    this.root.add(this.active.root);
  }

  private clearActive(): void {
    if (!this.active) return;
    this.root.remove(this.active.root);
    this.active.dispose();
    this.active = undefined;
    this.activeKind = undefined;
  }
}
