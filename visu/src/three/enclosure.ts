import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getPortalPostXsMm, getPortalRailClearanceMm } from '../config/portalMeasurements';
import { ENCLOSURE_DOORS, isEnclosureDoorUnsecured } from '../model/enclosure';
import { DEFAULT_BUTTON_STATION_STATE, type ButtonStationStates } from '../model/buttonStations';
import type { CellLayout, EnclosureDoorId, EnclosureDoorStates } from '../model/types';
import { damp, logicalPosition, material, mm } from './primitives';
import { createButtonStation, updateButtonStation, type ButtonStationRig } from './buttonStation';

const YELLOW = 0xe5c51d;
const WIRE = 0x727342;
const PALE_RED = new THREE.Color(0xffa19b);
const RED = new THREE.Color(0xef181d);
const FRAME = 0.03;
const DEPTH = 0.03;
const DOOR_WIDTH = 0.9; // Dimension shown in «Доп скриношты 3».
const GAP = 0.008;
const BODY_OVERLAP = 0.04;
const PALLET_OVERLAP = 0.02;
type XYZ = [number, number, number];

interface DoorRig {
  id: EnclosureDoorId;
  pivot: THREE.Group;
  openAngle: number;
  frame: THREE.MeshStandardMaterial;
  wire: THREE.MeshStandardMaterial;
  magnetIndicator: THREE.MeshStandardMaterial;
  sensorIndicator: THREE.MeshStandardMaterial;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

export interface EnclosureRig {
  root: THREE.Group;
  doors: DoorRig[];
  buttonStations: { id: EnclosureDoorId; rig: ButtonStationRig }[];
  materials: THREE.MeshStandardMaterial[];
  elapsed: number;
  reducedMotion: MediaQueryList;
}

function cuboid(size: XYZ, position: XYZ): THREE.BoxGeometry {
  return new THREE.BoxGeometry(...size).translate(...position);
}

function addPieces(parent: THREE.Object3D, name: string, pieces: THREE.BufferGeometry[], surface: THREE.Material) {
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function block(parent: THREE.Object3D, name: string, size: XYZ, position: XYZ, surface: THREE.Material) {
  return addPieces(parent, name, [cuboid(size, position)], surface);
}

/** A welded grid is one mesh per panel, rather than hundreds of draw calls. */
function panel(parent: THREE.Object3D, name: string, width: number, height: number,
  x: number, y: number, frame: THREE.MeshStandardMaterial, wire: THREE.MeshStandardMaterial) {
  if (width <= FRAME * 2 || height <= FRAME * 2) return;
  addPieces(parent, `${name}_frame`, [
    cuboid([width, FRAME, DEPTH], [x, y - (height - FRAME) / 2, 0]),
    cuboid([width, FRAME, DEPTH], [x, y + (height - FRAME) / 2, 0]),
    cuboid([FRAME, height - FRAME * 2, DEPTH], [x - (width - FRAME) / 2, y, 0]),
    cuboid([FRAME, height - FRAME * 2, DEPTH], [x + (width - FRAME) / 2, y, 0]),
  ], frame);
  const innerWidth = width - FRAME * 2;
  const innerHeight = height - FRAME * 2;
  const columns = Math.max(1, Math.round(innerWidth / 0.05));
  const rows = Math.max(1, Math.round(innerHeight / 0.05));
  const wires: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= columns; i++) {
    wires.push(cuboid([0.004, innerHeight, 0.004], [x - innerWidth / 2 + i * innerWidth / columns, y, 0]));
  }
  for (let i = 0; i <= rows; i++) {
    wires.push(cuboid([innerWidth, 0.004, 0.004], [x, y - innerHeight / 2 + i * innerHeight / rows, 0.004]));
  }
  const grid = addPieces(parent, `${name}_mesh`, wires, wire);
  grid.castShadow = false;
}

/** Soft red wash through the mesh plus a feathered halo outside the leaf.
 * No full-scene bloom pass: the effect remains visible on the light HMI floor. */
function createDoorGlow(width: number, height: number) {
  const margin = 0.12;
  const surface = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      time: { value: 0 },
      pulse: { value: 0 },
      size: { value: new THREE.Vector2(width + margin * 2, height + margin * 2) },
      halfLeaf: { value: new THREE.Vector2(width / 2, height / 2) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float pulse;
      uniform vec2 size;
      uniform vec2 halfLeaf;
      void main() {
        vec2 edge = abs((vUv - 0.5) * size) - halfLeaf;
        float outside = length(max(edge, 0.0));
        float halo = 1.0 - smoothstep(0.0, 0.12, outside);
        float inside = 1.0 - step(0.0, max(edge.x, edge.y));
        float flow = 0.5 + 0.5 * sin(vUv.y * 4.0 - time);
        vec3 red = mix(vec3(1.0, 0.48, 0.43), vec3(1.0, 0.025, 0.045),
          clamp(pulse * 0.7 + flow * 0.3, 0.0, 1.0));
        float alpha = halo * mix(0.12 + pulse * 0.20, 0.10 + pulse * 0.26, inside);
        gl_FragColor = vec4(red, alpha);
      }
    `,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(width + margin * 2, height + margin * 2), surface);
  glow.name = 'door_warning_gradient';
  glow.visible = false;
  return glow;
}

function createDoor(parent: THREE.Group, id: EnclosureDoorId, left: number, bottom: number,
  width: number, height: number, front: boolean): DoorRig {
  const frame = material(YELLOW, { roughness: 0.44, metalness: 0.28 });
  const wire = material(WIRE, { roughness: 0.58, metalness: 0.32 });
  const dark = material(0x292e34, { roughness: 0.4, metalness: 0.4 });
  const steel = material(0xa6b1ba, { roughness: 0.3, metalness: 0.72 });
  const magnetIndicator = material(0x32d779, { emissive: 0x32d779, emissiveIntensity: 0.65 });
  const sensorIndicator = material(0x32d779, { emissive: 0x32d779, emissiveIntensity: 0.4 });
  // Front/rear leaves share the magazine's X opening. Viewed from the rear,
  // the same hinge/latch arrangement naturally appears mirrored.
  const direction = 1;
  const outward = front ? 1 : -1;
  const pivot = new THREE.Group();
  pivot.name = `enclosure_door_${id}`;
  pivot.position.set(left, bottom, 0);
  parent.add(pivot);
  panel(pivot, 'door_leaf', width, height, direction * width / 2, height / 2, frame, wire);

  for (const y of [height * 0.19, height * 0.81]) {
    block(pivot, 'door_hinge', [0.06, 0.075, 0.045], [0, y, outward * 0.024], dark);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.09, 12), steel);
    pin.name = 'door_hinge_pin';
    pin.position.set(0, y, outward * 0.035);
    pivot.add(pin);
  }
  const latchX = direction * (width - 0.03);
  const latchY = height * 0.52;
  block(pivot, 'magnet_armature_plate', [0.052, 0.19, 0.022], [latchX, latchY, outward * 0.025], steel);
  const handleX = direction * (width - 0.11);
  for (const offset of [-0.07, 0.07]) {
    block(pivot, 'door_handle_mount', [0.035, 0.026, 0.072], [handleX, latchY + offset, outward * 0.05], dark);
  }
  block(pivot, 'door_handle', [0.026, 0.17, 0.026], [handleX, latchY, outward * 0.086], dark);

  const magnetX = pivot.position.x + direction * (width + GAP + FRAME / 2);
  block(parent, 'electromagnetic_lock_body', [0.07, 0.23, 0.075],
    [magnetX, bottom + latchY, outward * 0.023], dark);
  block(parent, 'electromagnetic_lock_face', [0.074, 0.17, 0.012],
    [magnetX, bottom + latchY, outward * 0.067], steel);
  block(parent, 'electromagnetic_lock_indicator', [0.035, 0.11, 0.014],
    [magnetX, bottom + latchY, outward * 0.078], magnetIndicator);
  block(parent, 'door_limit_switch', [0.045, 0.06, 0.035],
    [magnetX, bottom + height - 0.08, outward * 0.025], dark);
  block(parent, 'door_limit_switch_indicator', [0.018, 0.016, 0.008],
    [magnetX, bottom + height - 0.08, outward * 0.047], sensorIndicator);
  block(pivot, 'door_limit_switch_target', [0.032, 0.045, 0.02],
    [latchX, height - 0.08, outward * 0.025], steel);

  const glow = createDoorGlow(width, height);
  glow.position.set(direction * width / 2, height / 2, -outward * 0.007);
  pivot.add(glow);
  return { id, pivot, openAngle: front ? -Math.PI / 2 : Math.PI / 2, frame, wire, magnetIndicator, sensorIndicator, glow };
}

export function createEnclosure(layout: CellLayout): EnclosureRig {
  const root = new THREE.Group();
  root.name = 'Cell_enclosure';
  const { portal } = layout;
  root.position.copy(logicalPosition(portal.position.x, portal.position.y, portal.position.z));
  const postXs = getPortalPostXsMm(portal).map(mm);
  const support = mm(portal.supportSize);
  const railClearance = mm(getPortalRailClearanceMm(portal.frameDepthY, layout.robot.zColumnWidth));
  const frontZ = railClearance + support / 2 + DEPTH / 2;
  const rearZ = -mm(portal.widthY) - railClearance - support / 2 - DEPTH / 2;
  const top = mm(portal.frameBottomZ) - 0.015;
  // Extend the upper band to the machine roofs, including saved layouts with
  // a taller portal. A fixed 430 mm band leaves an open gap above the machines.
  const machineRoof = Math.min(...layout.machine.machines.map((machine) =>
    mm(machine.position.z + layout.machine.sizeZ - portal.position.z)));
  const headerHeight = Math.max(0.43, top - machineRoof + BODY_OVERLAP);
  const headerBottom = top - headerHeight;
  const lowerTop = headerBottom;
  // The bottom of each moving leaf reaches its pallet instead of deriving
  // its elevation from an arbitrary fixed door height.
  const magazineBottoms = layout.staticMagazines.map((magazine) =>
    mm(magazine.position.z + magazine.workingHeight - portal.position.z)
      - FRAME - GAP - PALLET_OVERLAP);
  const sideBottom = magazineBottoms.length ? Math.min(...magazineBottoms) : lowerTop - 0.9;
  const fixedFrame = material(YELLOW, { roughness: 0.52, metalness: 0.24 });
  const fixedWire = material(WIRE, { roughness: 0.65, metalness: 0.3 });
  const brackets = material(0x77828b, { metalness: 0.55 });
  const doors: DoorRig[] = [];
  const buttonStations: EnclosureRig['buttonStations'] = [];
  // Match each magazine to the nearest structural bay; never use a separate
  // hard-coded set of fence coordinates that can drift away from the columns.
  const magazineBays = layout.staticMagazines.map((magazine) => {
    const x = mm(magazine.position.x - portal.position.x);
    let closest = 0;
    for (let i = 1; i < postXs.length - 1; i++) {
      if (Math.abs((postXs[i] + postXs[i + 1]) / 2 - x)
        < Math.abs((postXs[closest] + postXs[closest + 1]) / 2 - x)) closest = i;
    }
    return closest;
  });

  for (const side of ['front', 'rear'] as const) {
    const front = side === 'front';
    const face = new THREE.Group();
    face.name = `enclosure_${side}`;
    face.position.z = front ? frontZ : rearZ;
    root.add(face);
    for (const x of postXs) {
      block(face, 'fence_post_cover', [support + 0.04, headerHeight, 0.015],
        [x, top - headerHeight / 2, 0], fixedFrame);
      for (const y of [top - 0.055, sideBottom + 0.07]) {
        block(face, 'fence_support_bracket', [support + 0.065, 0.035, 0.075],
          [x, y, front ? -0.038 : 0.038], brackets);
      }
    }
    for (let bay = 0; bay < postXs.length - 1; bay++) {
      const left = postXs[bay] + support / 2;
      const right = postXs[bay + 1] - support / 2;
      const width = right - left;
      const middle = (left + right) / 2;
      const shoulder = Math.min(0.36, width * 0.2);
      panel(face, 'upper_fence', width, headerHeight, middle, top - headerHeight / 2, fixedFrame, fixedWire);
      for (const x of [left + shoulder / 2, right - shoulder / 2]) {
        block(face, 'upper_fence_sheet', [shoulder, headerHeight, 0.016],
          [x, top - headerHeight / 2, front ? 0.012 : -0.012], fixedFrame);
      }
      const magazineIndex = magazineBays.indexOf(bay);
      const lowerBottom = magazineBottoms[magazineIndex] ?? sideBottom;
      const doorConfig = ENCLOSURE_DOORS.find((entry) => entry.magazine === magazineIndex && entry.side === side);
      if (!doorConfig) {
        // Machine bodies fill these bays; retain the hanging strips beside posts.
        for (const x of [left + 0.10, right - 0.10]) {
          panel(face, 'machine_side_fence', 0.20, lowerTop - lowerBottom, x,
            (lowerTop + lowerBottom) / 2, fixedFrame, fixedWire);
        }
        continue;
      }
      const doorWidth = Math.min(DOOR_WIDTH, width * 0.48);
      const doorHeight = lowerTop - lowerBottom - FRAME * 2 - GAP * 2;
      const doorLeft = right - FRAME - GAP - doorWidth;
      const openingLeft = doorLeft - GAP - FRAME;
      const openingRight = doorLeft + doorWidth + GAP + FRAME;
      // Outer jambs/header stay fixed when the separate leaf swings away.
      addPieces(face, 'door_jamb', [
        cuboid([FRAME, lowerTop - lowerBottom, DEPTH], [openingLeft + FRAME / 2, (lowerTop + lowerBottom) / 2, 0]),
        cuboid([FRAME, lowerTop - lowerBottom, DEPTH], [openingRight - FRAME / 2, (lowerTop + lowerBottom) / 2, 0]),
        cuboid([openingRight - openingLeft, FRAME, DEPTH], [(openingLeft + openingRight) / 2, lowerTop - FRAME / 2, 0]),
        cuboid([openingRight - openingLeft, FRAME, DEPTH], [(openingLeft + openingRight) / 2, lowerBottom + FRAME / 2, 0]),
      ], fixedFrame);
      const fixedLeft = left;
      const fixedRight = openingLeft;
      panel(face, 'magazine_fixed_fence', fixedRight - fixedLeft, lowerTop - lowerBottom,
        (fixedLeft + fixedRight) / 2, (lowerTop + lowerBottom) / 2, fixedFrame, fixedWire);
      doors.push(createDoor(face, doorConfig.id, doorLeft, lowerBottom + FRAME + GAP, doorWidth, doorHeight, front));
      const station = createButtonStation();
      station.root.name = `button_station_${doorConfig.id}`;
      // Fixed structural post immediately below the lock, as marked in the photos.
      station.root.position.set(postXs[bay + 1], lowerBottom + FRAME + GAP + doorHeight * 0.52 - 0.225,
        front ? -DEPTH / 2 : DEPTH / 2);
      station.root.rotation.y = front ? 0 : Math.PI;
      face.add(station.root);
      buttonStations.push({ id: doorConfig.id, rig: station });
    }
  }
  // Upper end returns connect the two rows without covering machine access.
  for (const x of [postXs[0], postXs[postXs.length - 1]]) {
    const end = new THREE.Group();
    end.name = 'enclosure_end_return';
    end.position.set(x, 0, (frontZ + rearZ) / 2);
    end.rotation.y = Math.PI / 2;
    panel(end, 'end_fence', frontZ - rearZ, headerHeight, 0, top - headerHeight / 2, fixedFrame, fixedWire);
    root.add(end);
  }
  const materials = [fixedFrame, fixedWire, ...doors.flatMap((door) => [door.frame, door.wire])];
  return { root, doors, buttonStations, materials, elapsed: 0, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)') };
}

export function updateEnclosure(rig: EnclosureRig, states: EnclosureDoorStates, dt: number, response: number, opacity = 1,
  buttonStates?: ButtonStationStates, magazineEnabled: readonly boolean[] = []): void {
  rig.elapsed += dt;
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0.1, 1);
  rig.materials.forEach((surface) => {
    if (Math.abs(surface.opacity - normalizedOpacity) < 0.0001) return;
    surface.opacity = normalizedOpacity;
    surface.transparent = normalizedOpacity < 0.999;
    surface.depthWrite = normalizedOpacity > 0.82;
    surface.needsUpdate = true;
  });
  const reducedMotion = rig.reducedMotion.matches;
  for (const station of rig.buttonStations) {
    updateButtonStation(station.rig, buttonStates?.[station.id] ?? DEFAULT_BUTTON_STATION_STATE,
      rig.elapsed, reducedMotion);
  }
  const phase = reducedMotion ? 0 : rig.elapsed * Math.PI; // One gentle cycle every two seconds.
  const pulse = reducedMotion ? 0.55 : (1 - Math.cos(phase)) / 2;
  for (let doorIndex = 0; doorIndex < rig.doors.length; doorIndex += 1) {
    const door = rig.doors[doorIndex];
    const state = states[door.id];
    const angle = state.closed ? 0 : door.openAngle;
    door.pivot.rotation.y = reducedMotion ? angle : damp(door.pivot.rotation.y, angle, response, dt);
    const warning = isEnclosureDoorUnsecured(state, Boolean(magazineEnabled[ENCLOSURE_DOORS[doorIndex].magazine]));
    if (warning) {
      door.frame.color.lerpColors(PALE_RED, RED, pulse);
      door.wire.color.copy(door.frame.color);
      door.frame.emissive.set(0xff1218);
      door.wire.emissive.set(0xff1218);
      door.frame.emissiveIntensity = 0.18 + pulse * 0.7;
      door.wire.emissiveIntensity = 0.12 + pulse * 0.55;
    } else {
      door.frame.color.set(YELLOW);
      door.wire.color.set(WIRE);
      door.frame.emissiveIntensity = 0;
      door.wire.emissiveIntensity = 0;
    }
    door.glow.visible = warning;
    door.glow.material.uniforms.time.value = phase;
    door.glow.material.uniforms.pulse.value = pulse;
    const magnetColor = state.locked ? 0x32d779 : 0xffa52c;
    door.magnetIndicator.color.set(magnetColor);
    door.magnetIndicator.emissive.set(magnetColor);
    const sensorColor = state.closed ? 0x32d779 : 0xffa52c;
    door.sensorIndicator.color.set(sensorColor);
    door.sensorIndicator.emissive.set(sensorColor);
  }
}
