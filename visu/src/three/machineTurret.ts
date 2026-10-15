import * as THREE from 'three';
import type { MachineState, PartGeometryLayout } from '../model/types';
import { box, COLORS, damp, material, mm } from './primitives';

const DISC_NAME = 'machine_turret_disc';
const ROTOR_METAL_NAME = 'machine_turret_rotor_metal';
const BASE_NAME = 'machine_turret_base';
const BACK_WALL_NAME = 'machine_turret_back_wall';
const DISC_CENTER = new THREE.Vector3(0.1925, 1.1, -0.165);
const TOOL_TIP = new THREE.Vector3(-0.28, 0, 0.345);
const CLEARANCE = 0.032;
const LOOP_SECONDS = 6;
const APPROACH_SECONDS = 1.2;
const RETURN_SECONDS = 5;
const TURRET_SILVER = 0x747c84;

export interface MachineTurretRig {
  slide: THREE.Group;
  head: THREE.Group;
  toolTip: THREE.Vector3;
  spindleCenter: THREE.Vector3;
  startX: number;
  endX: number;
  radius: number;
  elapsed: number;
  processing: boolean;
  returning: boolean;
  lastCycleElapsed: number;
  target: THREE.Vector3;
}

function geometrySubset(source: THREE.BufferGeometry, indices: number[]): THREE.BufferGeometry {
  // toNonIndexed also removes unused vertices, so bounds only cover this part.
  const indexed = source.clone();
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTurretBackWall(base: THREE.BufferGeometry, surface: THREE.Material | THREE.Material[]): THREE.Mesh {
  const positions = base.getAttribute('position');
  const backX = base.boundingBox!.max.x;
  const rim = new Map<string, THREE.Vector3>();
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(positions.getX(i) - backX) > 0.000001) continue;
    const y = positions.getY(i);
    const z = positions.getZ(i);
    rim.set(`${Math.round(y * 1e6)},${Math.round(z * 1e6)}`, new THREE.Vector3(backX, y, z));
  }
  const boundary = [...rim.values()].sort((a, b) =>
    Math.atan2(a.z - DISC_CENTER.z, a.y - DISC_CENTER.y) - Math.atan2(b.z - DISC_CENTER.z, b.y - DISC_CENTER.y));
  const vertices = [backX, DISC_CENTER.y, DISC_CENTER.z, ...boundary.flatMap(point => point.toArray())];
  const indices: number[] = [];
  for (let i = 0; i < boundary.length; i++) indices.push(0, (i + 1) % boundary.length + 1, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const wall = new THREE.Mesh(geometry, surface);
  wall.name = BACK_WALL_NAME;
  return wall;
}

/** Split only the known Headman turret surfaces, once, before cloning the model. */
export function prepareMachineTurret(disc: THREE.Mesh, steel: THREE.Mesh): boolean {
  const positions = steel.geometry.getAttribute('position');
  const index = steel.geometry.getIndex();
  if (!index || !positions) return false;
  const retained: number[] = [];
  const rotor: number[] = [];
  const base: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    // The steel mesh also contains the bed, spindle face and enclosure. Only
    // the isolated cylinder around the disc belongs to the moving assembly.
    const onTurret = triangle.every((vertex) => {
      const x = positions.getX(vertex);
      return x >= 0.13 && x <= 0.705
        && Math.hypot(positions.getY(vertex) - DISC_CENTER.y, positions.getZ(vertex) - DISC_CENTER.z) < 0.32;
    });
    const destination = !onTurret ? retained
      : triangle.every((vertex) => positions.getX(vertex) <= 0.25251) ? rotor : base;
    destination.push(...triangle);
  }
  if (!retained.length || !rotor.length || !base.length || !disc.parent || disc.parent !== steel.parent) return false;

  const source = steel.geometry;
  const rotorMesh = new THREE.Mesh(geometrySubset(source, rotor), steel.material);
  rotorMesh.name = ROTOR_METAL_NAME;
  const baseMesh = new THREE.Mesh(geometrySubset(source, base), steel.material);
  baseMesh.name = BASE_NAME;
  const enclosure = steel.parent.children.find((object) => object instanceof THREE.Mesh
    && object.material instanceof THREE.MeshStandardMaterial && object.material.name === 'whitecarpaint') as THREE.Mesh | undefined;
  // The CAD export left a twelve-sided opening where the original base met
  // the enclosure. Close that opening in the fixed body, behind the moving rig.
  const backWall = createTurretBackWall(baseMesh.geometry, enclosure?.material ?? material(COLORS.white));
  steel.geometry = geometrySubset(source, retained);
  source.dispose();
  disc.name = DISC_NAME;
  steel.parent.add(rotorMesh, baseMesh, backWall);
  return true;
}

function createTurningTool(head: THREE.Group): void {
  head.add(
    box('turret_tool_holder', new THREE.Vector3(0.05, 0.045, 0.095), COLORS.graphite,
      new THREE.Vector3(-0.08, 0, 0.29), { metalness: 0.65, roughness: 0.36 }),
    box('turret_tool_shank', new THREE.Vector3(0.17, 0.022, 0.028), COLORS.steel,
      new THREE.Vector3(-0.187, 0, 0.327), { metalness: 0.8, roughness: 0.3 }),
  );
  const shape = new THREE.Shape();
  shape.moveTo(TOOL_TIP.x, TOOL_TIP.z);
  shape.lineTo(TOOL_TIP.x + 0.016, TOOL_TIP.z - 0.004);
  shape.lineTo(TOOL_TIP.x + 0.022, TOOL_TIP.z - 0.02);
  shape.lineTo(TOOL_TIP.x + 0.006, TOOL_TIP.z - 0.016);
  shape.closePath();
  const insertGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: false });
  insertGeometry.rotateX(Math.PI / 2);
  insertGeometry.translate(0, 0.0035, 0);
  const insert = new THREE.Mesh(insertGeometry, material(COLORS.amber, { metalness: 0.7, roughness: 0.32 }));
  insert.name = 'turret_cutting_insert';
  insert.castShadow = true;
  insert.receiveShadow = true;
  head.add(insert);
}

export function createMachineTurret(
  model: THREE.Group,
  chuck: THREE.Object3D,
  part: THREE.Group,
  geometry: PartGeometryLayout,
): MachineTurretRig | undefined {
  const disc = model.getObjectByName(DISC_NAME);
  const rotor = model.getObjectByName(ROTOR_METAL_NAME);
  const base = model.getObjectByName(BASE_NAME);
  if (!disc || !rotor || !base || !disc.parent) return undefined;

  const slide = new THREE.Group();
  slide.name = 'machine_turret_slide';
  disc.parent.add(slide);
  const head = new THREE.Group();
  head.name = 'machine_turret_head';
  head.position.copy(DISC_CENTER);
  slide.add(head, base);
  head.add(disc, rotor);
  // All source vertices are in enclosure coordinates. Move their origin to
  // the disc centre without changing their original position in the machine.
  disc.position.sub(DISC_CENTER);
  rotor.position.sub(DISC_CENTER);
  for (const surface of [disc, rotor, base]) {
    surface.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const entry of materials) {
        if (!(entry instanceof THREE.MeshStandardMaterial)) continue;
        entry.color.setHex(TURRET_SILVER);
        entry.metalness = 0.65;
        entry.roughness = 0.4;
      }
    });
  }
  createTurningTool(head);

  const spindleCenter = chuck.position.clone().add(part.position);
  const length = mm(geometry.length);
  const startX = spindleCenter.x + length / 2 - 0.001;
  // Keep the working point in front of the chuck jaws, even for short stock.
  const endX = Math.min(startX, Math.max(spindleCenter.x - length / 2, chuck.position.x + 0.159));
  return {
    slide, head, toolTip: TOOL_TIP.clone(), spindleCenter, startX, endX, radius: mm(geometry.diameter) / 2,
    elapsed: 0, processing: false, returning: false, lastCycleElapsed: 0, target: new THREE.Vector3(),
  };
}

function toolTarget(rig: MachineTurretRig, x: number, clearance: number): void {
  rig.target.set(
    x - DISC_CENTER.x - TOOL_TIP.x,
    rig.spindleCenter.y - DISC_CENTER.y,
    rig.spindleCenter.z - rig.radius - clearance - DISC_CENTER.z - TOOL_TIP.z,
  );
}

export function updateMachineTurret(rig: MachineTurretRig, state: MachineState, dt: number, response: number): void {
  const frameTime = Math.min(Math.max(dt, 0), 0.1);
  // An alarm freezes the visual mechanism; it must not invent a return move.
  if (state.mode === 'error' || state.alarm || state.activeErrors.length > 0) return;
  const processing = state.mode === 'processing' && state.partPresent;
  const newCycle = processing && (!rig.processing || state.cycleElapsedS < rig.lastCycleElapsed - 0.1);
  if (newCycle) {
    rig.elapsed = 0;
    rig.returning = false;
  }
  rig.processing = processing;
  rig.lastCycleElapsed = state.cycleElapsedS;

  if (processing && (state.chuckOpen || !state.chuckClosed || state.doorOpen || state.hatchOpen)) return;

  const returnWindow = state.cycleExpectedS > 0 ? Math.min(RETURN_SECONDS, state.cycleExpectedS * 0.2) : RETURN_SECONDS;
  if (processing && state.cycleExpectedS > 0 && state.cycleRemainingS <= returnWindow) rig.returning = true;

  if (processing && !rig.returning) {
    rig.elapsed += frameTime;
    const phase = Math.max(0, rig.elapsed - APPROACH_SECONDS) % LOOP_SECONDS;
    let x = rig.startX;
    let clearance = CLEARANCE;
    if (phase < 0.8) clearance = CLEARANCE * (1 - THREE.MathUtils.smoothstep(phase, 0, 0.8));
    else if (phase < 3.8) {
      clearance = 0;
      x = THREE.MathUtils.lerp(rig.startX, rig.endX, (phase - 0.8) / 3);
    } else if (phase < 4.6) {
      x = rig.endX;
      clearance = CLEARANCE * THREE.MathUtils.smoothstep(phase, 3.8, 4.6);
    } else x = THREE.MathUtils.lerp(rig.endX, rig.startX, THREE.MathUtils.smoothstep(phase, 4.6, LOOP_SECONDS));
    if (rig.elapsed < APPROACH_SECONDS) clearance = CLEARANCE;
    toolTarget(rig, x, clearance);
    rig.target.multiplyScalar(THREE.MathUtils.smoothstep(rig.elapsed, 0, APPROACH_SECONDS));
  } else {
    rig.target.set(0, 0, 0);
    // Retract radially before traversing back, so the return does not drag
    // the cutter through the workpiece or the chuck.
    const tipZ = rig.slide.position.z + DISC_CENTER.z + TOOL_TIP.z;
    if (tipZ > rig.spindleCenter.z - rig.radius - CLEARANCE) {
      rig.target.x = rig.slide.position.x;
      rig.target.y = rig.slide.position.y;
    }
  }
  const speed = Math.max(6, response);
  rig.slide.position.x = damp(rig.slide.position.x, rig.target.x, speed, frameTime);
  rig.slide.position.y = damp(rig.slide.position.y, rig.target.y, speed, frameTime);
  rig.slide.position.z = damp(rig.slide.position.z, rig.target.z, speed, frameTime);
}
