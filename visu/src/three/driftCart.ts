import * as THREE from 'three';
import { DEFAULT_DRIFT_SETTINGS, type DriftCartStyle, type DriftSettings, type DriftTelemetry } from '../model/easterEggs';
import type { CellLayout } from '../model/types';
import { mm } from './primitives';

const BEST_SCORE_STORAGE_KEY = 'portal-robot.drift-cart-best.v1';
const CART_RADIUS = 0.36;
const MAX_FORWARD_SPEED = 8.8;
const MAX_REVERSE_SPEED = 3.4;
const FRONT_AXLE = 0.43;
const REAR_AXLE = 0.43;
const YAW_INERTIA = 0.72;

interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface SmokeParticle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface DriftCone {
  root: THREE.Group;
  start: THREE.Vector3;
  velocity: THREE.Vector3;
  fallAxis: number;
  fallAngle: number;
  tipped: boolean;
}

export interface DriftCartScene {
  root: THREE.Group;
  controlsCamera: true;
  setDriftSettings: (settings: DriftSettings) => void;
  update: (dt: number, camera: THREE.Camera) => void;
  dispose: () => void;
}

function readBestScore(): number {
  try {
    const value = Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, select, textarea, [contenteditable="true"]'));
}

function normalizedKey(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function createObstacles(layout: CellLayout): Obstacle[] {
  const clearance = 0.05;
  const machines = layout.machine.machines.map(({ position }) => ({
    minX: mm(position.x) - clearance,
    maxX: mm(position.x + layout.machine.sizeX) + clearance,
    minZ: -mm(position.y + layout.machine.sizeY) - clearance,
    maxZ: -mm(position.y) + clearance,
  }));
  const conveyors = layout.indexedConveyors.map((config) => {
    const depth = config.zoneRowsY.reduce((sum, rows) => sum + rows, 0) * config.pitchY;
    const halfWidth = config.slatWidthX / 2;
    return {
      minX: mm(config.position.x - halfWidth) - clearance,
      maxX: mm(config.position.x + halfWidth) + clearance,
      minZ: -mm(config.position.y + depth) - clearance,
      maxZ: -mm(config.position.y) + clearance,
    };
  });
  return [...machines, ...conveyors];
}

function addMesh(
  root: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function createCart(
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
): { root: THREE.Group; wheels: THREE.Group[]; frontPivots: THREE.Group[]; rearWheels: Set<THREE.Group>; setStyle: (style: DriftCartStyle) => void } {
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
  const standard = (color: THREE.ColorRepresentation, options: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.18, ...options });
    materials.add(value);
    return value;
  };
  const root = new THREE.Group();
  root.name = 'PlayableDriftCart';
  const blue = standard(0x087bd4, { metalness: 0.38, roughness: 0.3 });
  const dark = standard(0x17232d, { metalness: 0.48, roughness: 0.42 });
  const steel = standard(0xaab8c2, { metalness: 0.78, roughness: 0.22 });
  const rubber = standard(0x111619, { roughness: 0.86 });
  const yellow = standard(0xffc928, { emissive: 0x5a3900, emissiveIntensity: 0.5 });
  const red = standard(0xe33f36, { emissive: 0x64100d, emissiveIntensity: 1.2 });
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 18));
  const torus = geometry(new THREE.TorusGeometry(0.18, 0.025, 8, 22));

  addMesh(root, box, blue, [0, 0.38, 0], [1.22, 0.16, 0.7]);
  addMesh(root, box, dark, [0.08, 0.49, 0], [0.72, 0.08, 0.55]);
  addMesh(root, box, yellow, [0.61, 0.36, 0], [0.08, 0.2, 0.72]);
  addMesh(root, box, red, [-0.62, 0.4, -0.22], [0.04, 0.12, 0.14]);
  addMesh(root, box, red, [-0.62, 0.4, 0.22], [0.04, 0.12, 0.14]);
  for (const z of [-0.29, 0.29]) {
    addMesh(root, cylinder, steel, [-0.52, 0.82, z], [0.07, 0.72, 0.07]);
  }
  const handleTop = addMesh(root, cylinder, steel, [-0.52, 1.17, 0], [0.07, 0.62, 0.07]);
  handleTop.rotation.x = Math.PI / 2;
  const wheel = addMesh(root, torus, dark, [-0.46, 1.21, 0]);
  wheel.rotation.y = Math.PI / 2;
  const steeringColumn = addMesh(root, cylinder, dark, [-0.32, 0.88, 0], [0.045, 0.28, 0.045]);
  steeringColumn.rotation.z = -0.45;
  addMesh(root, box, steel, [-0.2, 0.92, 0], [0.18, 0.1, 0.34]);

  const wheels: THREE.Group[] = [];
  const frontPivots: THREE.Group[] = [];
  const rearWheels = new Set<THREE.Group>();
  for (const x of [-0.43, 0.43]) for (const z of [-0.29, 0.29]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.2, z);
    const spin = new THREE.Group();
    const tyre = addMesh(spin, cylinder, rubber, [0, 0, 0], [0.27, 0.12, 0.27]);
    tyre.rotation.x = Math.PI / 2;
    const hub = addMesh(spin, cylinder, steel, [0, 0, 0], [0.11, 0.13, 0.11]);
    hub.rotation.x = Math.PI / 2;
    pivot.add(spin);
    root.add(pivot);
    wheels.push(spin);
    if (x > 0) frontPivots.push(pivot);
    else rearWheels.add(spin);
  }
  const setStyle = (style: DriftCartStyle) => {
    const colors = style === 'hazard'
      ? { body: 0xf07818, accent: 0x202b33, emissive: 0x431600 }
      : style === 'night'
        ? { body: 0x6d36c8, accent: 0x45f0a8, emissive: 0x063d27 }
        : { body: 0x087bd4, accent: 0xffc928, emissive: 0x5a3900 };
    blue.color.setHex(colors.body);
    yellow.color.setHex(colors.accent);
    yellow.emissive.setHex(colors.emissive);
    yellow.emissiveIntensity = style === 'night' ? 1.3 : 0.5;
  };
  return { root, wheels, frontPivots, rearWheels, setStyle };
}

function resolveObstacle(position: THREE.Vector3, velocity: THREE.Vector3, obstacle: Obstacle): boolean {
  const minX = obstacle.minX - CART_RADIUS;
  const maxX = obstacle.maxX + CART_RADIUS;
  const minZ = obstacle.minZ - CART_RADIUS;
  const maxZ = obstacle.maxZ + CART_RADIUS;
  if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) return false;
  const sides = [
    { distance: position.x - minX, nx: -1, nz: 0, x: minX, z: position.z },
    { distance: maxX - position.x, nx: 1, nz: 0, x: maxX, z: position.z },
    { distance: position.z - minZ, nx: 0, nz: -1, x: position.x, z: minZ },
    { distance: maxZ - position.z, nx: 0, nz: 1, x: position.x, z: maxZ },
  ].sort((a, b) => a.distance - b.distance);
  const hit = sides[0];
  position.x = hit.x;
  position.z = hit.z;
  const normal = new THREE.Vector3(hit.nx, 0, hit.nz);
  const inwardSpeed = velocity.dot(normal);
  if (inwardSpeed < 0) velocity.addScaledVector(normal, -inwardSpeed * 1.45);
  velocity.multiplyScalar(0.68);
  return true;
}

export function createDriftCartScene(
  layout: CellLayout,
  onTelemetry?: (telemetry: DriftTelemetry) => void,
  initialSettings?: DriftSettings,
): DriftCartScene {
  const root = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const cart = createCart(geometries, materials);
  let settings = initialSettings ?? DEFAULT_DRIFT_SETTINGS;
  cart.setStyle(settings.cartStyle);
  root.add(cart.root);

  const floorLength = mm(layout.floor.lengthX);
  const floorWidth = mm(layout.floor.widthY);
  const arenaMinX = -18;
  const arenaMaxX = floorLength + 20;
  const arenaMinZ = -(floorWidth + 16);
  const arenaMaxZ = 16;
  const arenaWidth = arenaMaxX - arenaMinX;
  const arenaDepth = arenaMaxZ - arenaMinZ;
  const arenaFloorGeometry = new THREE.PlaneGeometry(arenaWidth, arenaDepth);
  const arenaFloorMaterial = new THREE.MeshStandardMaterial({ color: 0xbcc7cd, roughness: 0.94, metalness: 0.02 });
  const barrierGeometry = new THREE.BoxGeometry(1, 1, 1);
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0x24333e, roughness: 0.58, metalness: 0.28 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf4bd24, roughness: 0.5, metalness: 0.12 });
  geometries.add(arenaFloorGeometry);
  geometries.add(barrierGeometry);
  materials.add(arenaFloorMaterial);
  materials.add(barrierMaterial);
  materials.add(stripeMaterial);
  const arenaFloor = new THREE.Mesh(arenaFloorGeometry, arenaFloorMaterial);
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.set((arenaMinX + arenaMaxX) / 2, -0.022, (arenaMinZ + arenaMaxZ) / 2);
  arenaFloor.receiveShadow = true;
  root.add(arenaFloor);
  const arenaCenterX = (arenaMinX + arenaMaxX) / 2;
  const arenaCenterZ = (arenaMinZ + arenaMaxZ) / 2;
  addMesh(root, barrierGeometry, barrierMaterial, [arenaCenterX, 0.09, arenaMinZ], [arenaWidth, 0.18, 0.16]);
  addMesh(root, barrierGeometry, barrierMaterial, [arenaCenterX, 0.09, arenaMaxZ], [arenaWidth, 0.18, 0.16]);
  addMesh(root, barrierGeometry, barrierMaterial, [arenaMinX, 0.09, arenaCenterZ], [0.16, 0.18, arenaDepth]);
  addMesh(root, barrierGeometry, barrierMaterial, [arenaMaxX, 0.09, arenaCenterZ], [0.16, 0.18, arenaDepth]);
  for (let index = 0; index < 9; index += 1) {
    addMesh(root, barrierGeometry, index % 2 === 0 ? stripeMaterial : barrierMaterial, [arenaMinX + 2.5, 0.008, arenaMaxZ - 1.5 - index * 0.42], [0.16, 0.016, 0.38]);
  }

  const coneGeometry = new THREE.ConeGeometry(0.17, 0.52, 14);
  const coneBandGeometry = new THREE.CylinderGeometry(0.095, 0.125, 0.09, 14);
  const coneBaseGeometry = new THREE.BoxGeometry(0.38, 0.055, 0.38);
  const coneOrange = new THREE.MeshStandardMaterial({ color: 0xf36f21, roughness: 0.58 });
  const coneYellow = new THREE.MeshStandardMaterial({ color: 0xf2bc24, roughness: 0.58 });
  const coneBlue = new THREE.MeshStandardMaterial({ color: 0x247bd3, roughness: 0.58 });
  const coneWhite = new THREE.MeshStandardMaterial({ color: 0xf2f5f6, roughness: 0.62 });
  const coneBase = new THREE.MeshStandardMaterial({ color: 0x1e2b34, roughness: 0.72 });
  geometries.add(coneGeometry);
  geometries.add(coneBandGeometry);
  geometries.add(coneBaseGeometry);
  materials.add(coneOrange);
  materials.add(coneYellow);
  materials.add(coneBlue);
  materials.add(coneWhite);
  materials.add(coneBase);
  const cones: DriftCone[] = [];
  const addCone = (x: number, z: number, color: THREE.Material) => {
    const coneRoot = new THREE.Group();
    const body = addMesh(coneRoot, coneGeometry, color, [0, 0.295, 0]);
    const band = addMesh(coneRoot, coneBandGeometry, coneWhite, [0, 0.25, 0]);
    const base = addMesh(coneRoot, coneBaseGeometry, coneBase, [0, 0.027, 0]);
    body.castShadow = band.castShadow = base.castShadow = true;
    coneRoot.position.set(x, 0, z);
    root.add(coneRoot);
    cones.push({ root: coneRoot, start: coneRoot.position.clone(), velocity: new THREE.Vector3(), fallAxis: 0, fallAngle: 0, tipped: false });
  };
  for (let index = 0; index < 14; index += 1) {
    addCone(arenaMinX + 8 + index * 2.6, arenaMaxZ - 6 + (index % 2 === 0 ? -1.5 : 1.5), index % 3 === 0 ? coneYellow : coneOrange);
  }
  const circleCenterX = floorLength + 8;
  const circleCenterZ = 5;
  for (let index = 0; index < 18; index += 1) {
    const angle = index / 18 * Math.PI * 2;
    addCone(circleCenterX + Math.cos(angle) * 6.5, circleCenterZ + Math.sin(angle) * 6.5, index % 2 === 0 ? coneOrange : coneBlue);
  }
  for (let index = 0; index < 12; index += 1) {
    addCone(arenaMinX + 9 + index * 3, arenaMinZ + 6 + (index % 4 < 2 ? -1.7 : 1.7), index % 3 === 1 ? coneBlue : coneYellow);
  }
  const obstacles = createObstacles(layout);
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const localCamera = new THREE.Vector3();
  const localTarget = new THREE.Vector3();
  const pressed = new Set<string>();
  let heading = 0;
  let yawRate = 0;
  let steeringAngle = 0;
  let rearGrip = 1;
  let rearSlip = 0;
  let rearWheelsLocked = false;
  let score = 0;
  let bestScore = readBestScore();
  let combo = 1;
  let driftGrace = 0;
  let impact = 0;
  let cameraReady = false;
  let telemetryElapsed = 0;
  let smokeElapsed = 0;

  const smokeGeometry = new THREE.SphereGeometry(0.5, 8, 6);
  geometries.add(smokeGeometry);
  const smokeParticles: SmokeParticle[] = Array.from({ length: 22 }, () => {
    const material = new THREE.MeshBasicMaterial({ color: 0xdce5e8, transparent: true, opacity: 0, depthWrite: false });
    materials.add(material);
    const mesh = new THREE.Mesh(smokeGeometry, material);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, material, life: 0, maxLife: 1 };
  });
  let smokeCursor = 0;

  const reset = () => {
    position.set(
      arenaMinX + 4,
      0,
      arenaMaxZ - 4,
    );
    velocity.set(0, 0, 0);
    heading = 0;
    yawRate = 0;
    steeringAngle = 0;
    rearGrip = 1;
    rearSlip = 0;
    rearWheelsLocked = false;
    combo = 1;
    driftGrace = 0;
    impact = 0;
    cart.root.position.copy(position);
    cart.root.rotation.set(0, -heading, 0);
    cones.forEach((cone) => {
      cone.root.position.copy(cone.start);
      cone.root.rotation.set(0, 0, 0);
      cone.velocity.set(0, 0, 0);
      cone.fallAxis = 0;
      cone.fallAngle = 0;
      cone.tipped = false;
    });
    cameraReady = false;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const key = normalizedKey(event);
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ', 'r'].includes(key)) return;
    event.preventDefault();
    if (key === 'r' && !event.repeat) reset();
    pressed.add(key);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const key = normalizedKey(event);
    if (pressed.has(key)) event.preventDefault();
    pressed.delete(key);
  };
  const onBlur = () => pressed.clear();
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', onBlur);
  reset();

  const emitSmoke = () => {
    const particle = smokeParticles[smokeCursor];
    smokeCursor = (smokeCursor + 1) % smokeParticles.length;
    const side = smokeCursor % 2 === 0 ? -1 : 1;
    particle.life = particle.maxLife = 0.65 + Math.random() * 0.4;
    particle.mesh.visible = true;
    particle.material.opacity = 0.34;
    particle.mesh.position.copy(position).addScaledVector(forward, -0.43).addScaledVector(right, side * 0.27);
    particle.mesh.position.y = 0.17;
    particle.mesh.scale.setScalar(0.12 + Math.random() * 0.08);
  };

  return {
    root,
    controlsCamera: true,
    setDriftSettings: (nextSettings) => {
      settings = nextSettings;
      cart.setStyle(settings.cartStyle);
    },
    update: (dt, camera) => {
      const throttle = Number(pressed.has('ArrowUp') || pressed.has('w')) - Number(pressed.has('ArrowDown') || pressed.has('s'));
      const steer = Number(pressed.has('ArrowRight') || pressed.has('d')) - Number(pressed.has('ArrowLeft') || pressed.has('a'));
      const handbrake = pressed.has(' ');
      const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
      const step = dt / steps;
      let collided = false;

      for (let index = 0; index < steps; index += 1) {
        forward.set(Math.cos(heading), 0, Math.sin(heading));
        right.set(-forward.z, 0, forward.x);
        const longitudinal = velocity.dot(forward);
        const lateral = velocity.dot(right);
        const speed = velocity.length();
        const speedRatio = Math.min(speed / MAX_FORWARD_SPEED, 1);
        const maxSteeringAngle = THREE.MathUtils.lerp(0.58, 0.34, speedRatio);
        const targetSteering = steer * maxSteeringAngle;
        steeringAngle = THREE.MathUtils.lerp(steeringAngle, targetSteering, 1 - Math.exp(-6.2 * settings.steeringResponse * step));

        const rearGripTarget = handbrake && speed > 1.4
          ? 0.1
          : throttle > 0 && speed > 4
            ? 0.88
            : 1;
        const rearGripResponse = rearGripTarget < rearGrip ? 13 : 1.85;
        rearGrip = THREE.MathUtils.lerp(rearGrip, rearGripTarget, 1 - Math.exp(-rearGripResponse * step));

        const powerToWeight = settings.enginePower / settings.mass;
        if (throttle > 0) velocity.addScaledVector(forward, 5.6 * powerToWeight * step);
        else if (throttle < 0 && longitudinal > 0.45) velocity.addScaledVector(forward, -9.5 / settings.mass * step);
        else if (throttle < 0) velocity.addScaledVector(forward, -3.2 * powerToWeight * step);

        const travelDirection = Math.abs(longitudinal) > 0.15 ? Math.sign(longitudinal) : (throttle < 0 ? -1 : 1);
        const referenceSpeed = Math.max(Math.abs(longitudinal), 0.65);
        const frontSlipAngle = Math.atan2(lateral + FRONT_AXLE * yawRate, referenceSpeed) - steeringAngle * travelDirection;
        const rearSlipAngle = Math.atan2(lateral - REAR_AXLE * yawRate, referenceSpeed);
        const lowSpeedFactor = THREE.MathUtils.clamp(speed / 1.4, 0.24, 1);
        const frontGripLimit = 8.4 * settings.frontGrip * lowSpeedFactor;
        const rearGripLimit = 8.1 * settings.rearGrip * rearGrip * lowSpeedFactor;
        const frontDemand = -frontSlipAngle * 15.5 * settings.frontGrip;
        const rearDemand = -rearSlipAngle * 17.5 * settings.rearGrip;
        const frontLateralAcceleration = THREE.MathUtils.clamp(frontDemand, -frontGripLimit, frontGripLimit);
        const rearLateralAcceleration = THREE.MathUtils.clamp(rearDemand, -rearGripLimit, rearGripLimit);
        velocity.addScaledVector(right, (frontLateralAcceleration + rearLateralAcceleration) * step);

        const yawAcceleration = (
          FRONT_AXLE * frontLateralAcceleration - REAR_AXLE * rearLateralAcceleration
        ) / (YAW_INERTIA * settings.mass);
        yawRate += yawAcceleration * step;
        yawRate *= Math.exp(-(0.34 + rearGrip * 0.42) * step);
        if (speed < 0.55) yawRate *= Math.exp(-5.5 * step);
        heading += yawRate * step;

        const demandOverflow = Math.max(0, Math.abs(rearDemand) - rearGripLimit) / Math.max(2, rearGripLimit);
        const slipAngleFactor = THREE.MathUtils.clamp((Math.abs(rearSlipAngle) - 0.055) / 0.34, 0, 1);
        rearSlip = THREE.MathUtils.clamp(Math.max(demandOverflow, slipAngleFactor, 1 - rearGrip), 0, 1);
        rearWheelsLocked = handbrake && speed > 1.4;
        if (rearWheelsLocked) {
          const rearBrake = 1 - Math.exp(-1.15 * step);
          velocity.addScaledVector(forward, -velocity.dot(forward) * rearBrake);
        }
        velocity.multiplyScalar(Math.exp(-(throttle === 0 ? 0.56 : 0.2) / Math.max(0.55, settings.mass) * step));

        const newLongitudinal = velocity.dot(forward);
        const maxForwardSpeed = MAX_FORWARD_SPEED * THREE.MathUtils.clamp(Math.sqrt(powerToWeight), 0.72, 1.55);
        if (newLongitudinal > maxForwardSpeed) velocity.addScaledVector(forward, maxForwardSpeed - newLongitudinal);
        if (newLongitudinal < -MAX_REVERSE_SPEED) velocity.addScaledVector(forward, -MAX_REVERSE_SPEED - newLongitudinal);
        position.addScaledVector(velocity, step);

        const minX = arenaMinX + CART_RADIUS;
        const maxX = arenaMaxX - CART_RADIUS;
        const minZ = arenaMinZ + CART_RADIUS;
        const maxZ = arenaMaxZ - CART_RADIUS;
        if (position.x < minX || position.x > maxX) {
          position.x = THREE.MathUtils.clamp(position.x, minX, maxX);
          velocity.x *= -0.42;
          collided = true;
        }
        if (position.z < minZ || position.z > maxZ) {
          position.z = THREE.MathUtils.clamp(position.z, minZ, maxZ);
          velocity.z *= -0.42;
          collided = true;
        }
        obstacles.forEach((obstacle) => { collided = resolveObstacle(position, velocity, obstacle) || collided; });
      }

      cones.forEach((cone) => {
        if (!cone.tipped) {
          const offsetX = cone.root.position.x - position.x;
          const offsetZ = cone.root.position.z - position.z;
          if (offsetX * offsetX + offsetZ * offsetZ < 0.48 * 0.48) {
            cone.tipped = true;
            cone.fallAxis = Math.atan2(velocity.z || offsetZ, velocity.x || offsetX);
            cone.velocity.copy(velocity).multiplyScalar(0.28);
            cone.velocity.x += (Math.random() - 0.5) * 0.8;
            cone.velocity.z += (Math.random() - 0.5) * 0.8;
            velocity.multiplyScalar(0.975);
          }
        }
        if (!cone.tipped) return;
        cone.fallAngle = Math.min(Math.PI * 0.48, cone.fallAngle + dt * 5.4);
        cone.root.position.addScaledVector(cone.velocity, dt);
        cone.velocity.multiplyScalar(Math.exp(-2.2 * dt));
        cone.root.rotation.x = Math.cos(cone.fallAxis) * cone.fallAngle;
        cone.root.rotation.z = -Math.sin(cone.fallAxis) * cone.fallAngle;
      });

      forward.set(Math.cos(heading), 0, Math.sin(heading));
      right.set(-forward.z, 0, forward.x);
      const speed = velocity.length();
      const longitudinal = velocity.dot(forward);
      const lateral = velocity.dot(right);
      const driftAngle = THREE.MathUtils.radToDeg(Math.atan2(lateral, Math.max(0.25, Math.abs(longitudinal))));
      const drifting = speed > 2.45 && Math.abs(driftAngle) > 8 && rearSlip > 0.16;

      if (collided) {
        impact = 1;
        combo = 1;
        driftGrace = 0;
        yawRate *= -0.18;
      } else {
        impact = Math.max(0, impact - dt * 2.8);
      }
      if (drifting) {
        driftGrace = 0.9;
        combo = Math.min(5, combo + dt * 0.42);
        score += speed * Math.abs(driftAngle) * (0.55 + rearSlip * 0.75) * combo * dt * 1.75;
      } else if (driftGrace > 0) {
        driftGrace -= dt;
      } else {
        combo = Math.max(1, combo - dt * 1.8);
      }
      bestScore = Math.max(bestScore, Math.floor(score));

      cart.root.position.copy(position);
      cart.root.rotation.set(0, -heading, THREE.MathUtils.clamp(-lateral * 0.018, -0.09, 0.09));
      cart.frontPivots.forEach((pivot) => { pivot.rotation.y = -steeringAngle; });
      const wheelSpin = longitudinal * dt / 0.135;
      cart.wheels.forEach((wheelGroup) => {
        const spinFactor = rearWheelsLocked && cart.rearWheels.has(wheelGroup) ? 0.03 : 1;
        wheelGroup.rotation.z -= wheelSpin * spinFactor;
      });

      smokeElapsed += dt;
      if (drifting && rearSlip > 0.34 && smokeElapsed >= 0.045) {
        smokeElapsed = 0;
        emitSmoke();
      }
      smokeParticles.forEach((particle) => {
        if (particle.life <= 0) return;
        particle.life -= dt;
        if (particle.life <= 0) {
          particle.mesh.visible = false;
          return;
        }
        const progress = 1 - particle.life / particle.maxLife;
        particle.mesh.position.y += dt * 0.18;
        particle.mesh.scale.multiplyScalar(1 + dt * 0.85);
        particle.material.opacity = (1 - progress) * 0.3;
      });

      if (settings.cameraMode === 'chase') {
        localCamera.set(-4.8, 2.75, 0);
        localTarget.set(1.1, 0.58, 0);
      } else if (settings.cameraMode === 'high') {
        localCamera.set(-3.2, 6.8, 0);
        localTarget.set(1.5, 0.16, 0);
      } else {
        localCamera.set(-1.55, 1.55, 0);
        localTarget.set(4.1, 0.72, 0);
      }
      cameraPosition.copy(localCamera).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -heading).add(position);
      cameraTarget.copy(localTarget).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -heading).add(position);
      if (!cameraReady) {
        camera.position.copy(cameraPosition);
        cameraReady = true;
      } else {
        const cameraResponse = settings.cameraMode === 'driver' ? 14 : 7.5;
        camera.position.lerp(cameraPosition, 1 - Math.exp(-cameraResponse * dt));
      }
      camera.lookAt(cameraTarget);
      camera.rotateZ(THREE.MathUtils.clamp(lateral * 0.012 - steer * 0.012, -0.065, 0.065));
      if (camera instanceof THREE.PerspectiveCamera) {
        const baseFov = settings.cameraMode === 'driver' ? 56 : settings.cameraMode === 'chase' ? 50 : 47;
        const targetFov = baseFov + Math.min(speed, MAX_FORWARD_SPEED) * 0.72;
        const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-5 * dt));
        if (Math.abs(nextFov - camera.fov) > 0.01) {
          camera.fov = nextFov;
          camera.updateProjectionMatrix();
        }
      }

      telemetryElapsed += dt;
      if (telemetryElapsed >= 0.08) {
        telemetryElapsed = 0;
        onTelemetry?.({
          score: Math.floor(score),
          bestScore,
          combo,
          speedKmh: Math.round(speed * 3.6),
          driftAngle: Math.round(Math.abs(driftAngle)),
          drifting,
          rearSlip,
          rearWheelsLocked,
          impact,
        });
      }
    },
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      try { localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(bestScore)); } catch { /* Хранилище может быть запрещено политикой браузера. */ }
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
