import type { PalletInventory } from '../model/twoPalletControl';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CellLayout, PartMaterialLayout } from '../model/types';
import type { TwoPalletPose, TwoPalletPreviewController } from '../model/twoPalletPreview';
import { INSPECTION_BELT_SPAN, INSPECTION_SAMPLE_SPAN } from '../model/twoPalletPreview';
import { createCableChain, type CableChain } from './cableChain';
import { COLORS, mm } from './primitives';

// Photo reconstruction, metres. Reference: all ten images in «2 итерация».
// These dimensions describe the local preview, not PLC positions or a fabrication drawing.
const ORIGINAL_LOW_RAIL_TOP = 0.855;
const ORIGINAL_HIGH_RAIL_TOP = 1.079;
const ORIGINAL_PALLET_TOP = 1.14;
const ORIGINAL_LIFT = 0.18;
const RAIL_TOP = mm(662);
const REAR_RAIL_TOP = mm(842);
// Shift the rail-driven assemblies to the measured heights without deforming the pallets.
const LOW_RAIL_SHIFT = RAIL_TOP - ORIGINAL_LOW_RAIL_TOP;
const HIGH_RAIL_SHIFT = REAR_RAIL_TOP - ORIGINAL_HIGH_RAIL_TOP;
const PALLET_GRID = { columns: 8, rows: 12, pitchX: 0.06, pitchY: 0.06 };
export const TWO_PALLET_DIMENSIONS = {
  length: 2.08, depth: 0.88,
  top: ORIGINAL_PALLET_TOP + HIGH_RAIL_SHIFT,
  lift: ORIGINAL_LIFT + HIGH_RAIL_SHIFT - LOW_RAIL_SHIFT,
  travel: 1.02,
  palletLength: PALLET_GRID.rows * PALLET_GRID.pitchX,
  palletDepth: PALLET_GRID.columns * PALLET_GRID.pitchY,
  ...PALLET_GRID,
};
const D = TWO_PALLET_DIMENSIONS;
const PALLET_END_X = D.palletLength / 2 + 0.003;
const PALLET_COUPLING_X = -(D.palletLength / 2 - 0.055);
const OPERATOR_X = -D.travel / 2;
const ROBOT_X = D.travel / 2;
const LOW = D.top - D.lift;
const BELT_Z = -0.473;
const BELT_RADIUS = 0.027;
const BELT_AXIS_Y = ORIGINAL_PALLET_TOP - 0.01;
const BELT_TOP = BELT_AXIS_Y + BELT_RADIUS;
const CONVEYOR_SHIFT = mm(899) - BELT_TOP;
const BELT_HALF = INSPECTION_BELT_SPAN / 2;
const LIFT_ROD_BOTTOM = 0.844;
type XYZ = [number, number, number];
const matrix = new THREE.Matrix4();
type ProductMeshes = { blank: THREE.InstancedMesh[]; detail: THREE.InstancedMesh[] };
const slotPosition = (slot: number): [number, number] => {
  const column = slot % D.columns;
  const row = Math.floor(slot / D.columns);
  // The magazine root is rotated +90° around Y: local Z maps to world X,
  // so each row's eight consecutive slots must advance along local Z.
  return [
    (row - (D.rows - 1) / 2) * D.pitchX,
    (column - (D.columns - 1) / 2) * D.pitchY,
  ];
};

export interface TwoPalletMagazineRig {
  root: THREE.Group;
  pallets: [THREE.Group, THREE.Group];
  carriage: THREE.Group;
  liftBase: THREE.Group;
  liftRods: THREE.Mesh[];
  lock: THREE.Group;
  stop: THREE.Group;
  chain: CableChain;
  beltMarks: THREE.InstancedMesh;
  driveTeeth: THREE.InstancedMesh;
  driveRollers: THREE.Group[];
  rollers: THREE.Group[];
  sample: THREE.Mesh;
  sampleHeight: number;
  productMeshes: ProductMeshes[];
  inventorySources: (PalletInventory | undefined)[];
  inventorySignatures: string[];
  lastDriveX: number;
  lastP2X: number;
  lastBeltPhase: number;
}

function roundedRect(path: THREE.Shape | THREE.Path, x: number, y: number, w: number, h: number, r: number) {
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  path.closePath();
}

function plate(shape: THREE.Shape, thickness: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

/** Batch fixed details inside EACH moving group; piston rods/instances stay independent.
 * Hardware can be detailed without a separate draw call for every screw and profile slot. */
function batchDetails(root: THREE.Group) {
  const parents: THREE.Object3D[] = [];
  const oldGeometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => { if (object.children.length) parents.push(object); });
  for (const parent of parents) {
    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || child.userData.animated) continue;
      if (Array.isArray(child.material)) continue;
      const bucket = buckets.get(child.material) ?? [];
      bucket.push(child); buckets.set(child.material, bucket);
    }
    for (const [material, meshes] of buckets) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map((mesh) => {
        mesh.updateMatrix();
        oldGeometries.add(mesh.geometry);
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(pieces)!;
      pieces.forEach((piece) => piece.dispose());
      const merged = new THREE.Mesh(geometry, material);
      merged.name = `${parent.name}_${material.name}`;
      merged.castShadow = true; merged.receiveShadow = true;
      parent.remove(...meshes); parent.add(merged);
    }
  }
  const retained = new Set<THREE.BufferGeometry>();
  root.traverse((object) => { if (object instanceof THREE.Mesh) retained.add(object.geometry); });
  oldGeometries.forEach((geometry) => { if (!retained.has(geometry)) geometry.dispose(); });
}

export function createTwoPalletMagazine(layout: CellLayout, magazineIndex: number): TwoPalletMagazineRig {
  const root = new THREE.Group();
  root.name = 'TwoPalletMagazine_local_preview';
  root.position.set(mm(layout.floor.lengthX) * 0.56, 0, 0.8);
  const legRise = mm(layout.twoPalletMagazines[magazineIndex].legHeightMm - 735);
  const material = (name: string, color: number, metalness = 0.48, roughness = 0.42) => {
    const result = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    result.name = name; return result;
  };
  const m = {
    frame: material('frame_silver', 0xc6cbcd), aluminium: material('machined_aluminium', 0xaeb8bf),
    steel: material('support_plates', 0x4c555c), dark: material('black_end_caps', 0x252c31, 0.18, 0.6),
    slot: material('profile_recesses', 0x59636b), chrome: material('guide_rods', 0xd6dee3, 0.7, 0.28),
    yellow: material('yellow_sensor_heads', 0xe0db51, 0.12, 0.54),
    pallet: material('fence_yellow_pallets', COLORS.fenceFrame, 0.28, 0.44), pink: material('pink_runner_seals', 0xe7a2af, 0.15),
    blue: material('blue_conveyor_belt', 0x087fcf, 0.05, 0.63), blueSteel: material('blue_gearbox', 0x0867bd, 0.35),
    blueLight: material('pneumatic_fittings', 0x3dadd3, 0.25), green: material('green_timing_belt', 0x79cd1f, 0.05, 0.6),
    brass: material('fitting_brass', 0xb4a77e), cabinet: material('cabinet_paint', 0xa8afb3, 0.2, 0.6),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const round = new THREE.CylinderGeometry(1, 1, 1, 20);
  const hexagon = new THREE.CylinderGeometry(1, 1, 1, 6);
  const group = (parent: THREE.Object3D, name: string, position: XYZ = [0, 0, 0]) => {
    const result = new THREE.Group(); result.name = name; result.position.set(...position); parent.add(result); return result;
  };
  const mesh = (parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry,
    mat: THREE.Material, position: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1]) => {
    const result = new THREE.Mesh(geometry, mat);
    result.name = name; result.position.set(...position); result.scale.set(...scale);
    result.castShadow = true; result.receiveShadow = true; parent.add(result); return result;
  };
  const box = (parent: THREE.Object3D, name: string, size: XYZ, position: XYZ, mat = m.aluminium) =>
    mesh(parent, name, cube, mat, position, size);
  const cylinder = (parent: THREE.Object3D, name: string, radius: number, length: number, position: XYZ, mat = m.chrome, axis: 'x' | 'y' | 'z' = 'y') => {
    const result = mesh(parent, name, round, mat, position, [radius, length, radius]);
    if (axis === 'z') result.rotation.x = Math.PI / 2;
    if (axis === 'x') result.rotation.z = -Math.PI / 2;
    return result;
  };
  const bolt = (parent: THREE.Object3D, position: XYZ, axis: 'x' | 'y' | 'z' = 'y', radius = 0.004) => {
    cylinder(parent, 'washer', radius * 1.45, 0.0015, position, m.steel, axis);
    const cap = mesh(parent, 'socket_screw', hexagon, m.chrome, position, [radius, 0.005, radius]);
    if (axis === 'z') cap.rotation.x = Math.PI / 2;
    if (axis === 'x') cap.rotation.z = Math.PI / 2;
    const offset: XYZ = [...position]; offset[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] += 0.003;
    cylinder(parent, 'socket_recess', radius * 0.42, 0.001, offset, m.dark, axis);
  };
  const fitting = (parent: THREE.Object3D, position: XYZ) => {
    cylinder(parent, 'air_port_thread', 0.007, 0.014, position, m.brass, 'z');
    box(parent, 'air_elbow', [0.014, 0.019, 0.012], [position[0], position[1] + 0.005, position[2] - 0.012], m.blueSteel);
    cylinder(parent, 'push_in_collar', 0.007, 0.007, [position[0], position[1] + 0.016, position[2] - 0.014], m.blueLight);
  };
  const profile = (parent: THREE.Object3D, name: string, length: number, w: number, h: number, position: XYZ) => {
    box(parent, name, [length, h, w], position);
    for (const side of [-1, 1]) {
      for (const offset of [-0.24, 0.24]) {
        box(parent, 'extrusion_side_slot', [length - 0.009, 0.003, 0.0015],
          [position[0], position[1] + offset * h, position[2] + side * (w / 2 + 0.0005)], m.slot);
        box(parent, 'extrusion_top_slot', [length - 0.009, 0.0015, 0.003],
          [position[0], position[1] + side * h / 2, position[2] + offset * w], m.slot);
      }
      box(parent, 'extrusion_end_cap', [0.004, h, w], [position[0] + side * length / 2, position[1], position[2]], m.dark);
    }
  };
  const rail = (parent: THREE.Group, name: string, z: number, top: number, width = 0.055) => {
    profile(parent, `${name}_extrusion`, 1.94, width, 0.055, [0, top - 0.0415, z]);
    box(parent, `${name}_track`, [1.91, 0.014, 0.018], [0, top - 0.007, z], m.chrome);
    for (const side of [-1, 1]) box(parent, 'rail_ground_shoulder', [1.9, 0.003, 0.003], [0, top - 0.009, z + side * 0.01], m.steel);
    for (let i = 0; i < 25; i++) bolt(parent, [-0.9 + i * 0.075, top + 0.001, z], 'y', 0.0028);
  };
  const runner = (parent: THREE.Group, x: number, y: number, z: number) => {
    box(parent, 'linear_runner_body', [0.067, 0.024, 0.043], [x, y, z], m.chrome);
    for (const end of [-1, 1]) {
      box(parent, 'pink_runner_end_seal', [0.008, 0.029, 0.047], [x + end * 0.037, y, z], m.pink);
      for (const side of [-1, 1]) bolt(parent, [x + end * 0.02, y + 0.014, z + side * 0.014], 'y', 0.0028);
    }
    cylinder(parent, 'runner_grease_nipple', 0.003, 0.011, [x - 0.045, y, z], m.brass, 'x');
  };

  // Thin square-tube stand with an unobstructed lower bay, as in the end views.
  const frame = group(root, 'Square_tube_stand');
  for (const x of [-1.01, 1.01]) {
    for (const z of [-0.38, 0.38]) {
      box(frame, 'upright_tube', [0.04, 0.735 + legRise, 0.04], [x, 0.4525 + legRise / 2, z], m.frame);
      box(frame, 'upright_black_cap', [0.041, 0.004, 0.041], [x, 0.822 + legRise, z], m.dark);
      cylinder(frame, 'levelling_foot_stem', 0.0055, 0.065, [x, 0.062, z]);
      mesh(frame, 'levelling_locknut', hexagon, m.steel, [x, 0.077, z], [0.011, 0.007, 0.011]);
      cylinder(frame, 'round_rubber_foot', 0.037, 0.012, [x, 0.018, z], m.dark);
      cylinder(frame, 'foot_metal_disc', 0.03, 0.006, [x, 0.027, z], m.steel);
    }
    for (const y of [0.115, 0.752 + legRise]) box(frame, 'end_cross_tube', [0.04, 0.04, 0.72], [x, y, 0], m.frame);
  }
  for (const z of [-0.38, 0.38]) {
    for (const y of [0.115, 0.752 + legRise]) box(frame, 'long_frame_tube', [1.98, 0.04, 0.04], [0, y, z], m.frame);
  }
  for (const x of [-0.93, 0.93]) {
    box(frame, 'guide_end_crossmember', [0.045, 0.045, 0.72], [x, 0.72 + legRise, 0], m.frame);
    const lowSupportX = Math.sign(x) * 0.955;
    for (const z of [0.336, 0.265, -0.265]) {
      box(frame, 'low_rail_support', [0.035, 0.18, 0.035], [lowSupportX, 0.65 + legRise, z], m.frame);
      box(frame, 'low_rail_mount_pad', [0.095, 0.009, 0.07], [lowSupportX, 0.59 + legRise, z], m.steel);
    }
    box(frame, 'high_rail_mount_pad', [0.095, 0.009, 0.07], [x, 0.756 + legRise, -0.337], m.steel);
  }

  // Поднимаем корпус целиком, сохраняя нижние опоры и регулируемые пятки на полу.
  const elevated = group(root, 'Elevated_magazine_assembly', [0, legRise, 0]);
  // The cabinet faces out of the short end; it is not a door across the long side.
  const cabinet = group(elevated, 'End_mounted_electrical_cabinet', [0.875, 0.30, 0]);
  cabinet.rotation.y = Math.PI / 2;
  box(cabinet, 'enclosure', [0.53, 0.48, 0.22], [0, 0, 0], m.cabinet);
  box(cabinet, 'door_gasket', [0.498, 0.452, 0.006], [0, 0, 0.112], m.dark);
  box(cabinet, 'door_folded_front', [0.488, 0.442, 0.014], [0, 0, 0.123], m.cabinet);
  for (const y of [-0.15, 0.15]) {
    box(cabinet, 'door_hinge', [0.013, 0.035, 0.017], [-0.249, y, 0.126], m.steel);
    cylinder(cabinet, 'hinge_pin', 0.003, 0.043, [-0.253, y, 0.13]);
  }
  cylinder(cabinet, 'quarter_turn_lock', 0.011, 0.008, [0.19, 0, 0.135], m.chrome, 'z');
  box(cabinet, 'lock_slot', [0.002, 0.012, 0.002], [0.19, 0, 0.141], m.dark);
  for (const x of [-0.19, 0.19]) for (const y of [-0.26, 0.26]) {
    box(cabinet, 'mounting_ear', [0.045, 0.046, 0.007], [x, y, -0.11], m.steel);
    bolt(cabinet, [x, y, -0.104], 'z');
  }
  for (const x of [-0.16, -0.09]) cylinder(cabinet, 'cable_gland', 0.012, 0.027, [x, 0.253, -0.025], m.dark);

  const guides = group(elevated, 'Asymmetric_linear_guideways');
  // P1 has one LOW outside rail and one HIGH rail beside the conveyor.
  // P2 uses the inside pair below it, allowing the two trolleys to overlap.
  rail(guides, 'P1_front_low', 0.336, RAIL_TOP);
  rail(guides, 'P2_front_low', 0.265, RAIL_TOP, 0.05);
  rail(guides, 'P2_rear_low', -0.265, RAIL_TOP, 0.05);
  rail(guides, 'P1_rear_high', -0.337, REAR_RAIL_TOP);
  for (const x of [-0.94, 0.94]) {
    box(guides, 'high_rail_upright', [0.035, 0.055, 0.04], [x, 0.755, -0.337], m.frame);
    box(guides, 'high_rail_bracket', [0.095, 0.01, 0.067], [x, 0.771, -0.337], m.steel);
    for (const dx of [-0.03, 0.03]) bolt(guides, [x + dx, 0.778, -0.337]);
  }

  // Pallets: 12 rows x 8 columns; each row advances along world X.
  const palletShape = new THREE.Shape();
  roundedRect(palletShape, -D.palletLength / 2, -D.palletDepth / 2, D.palletLength, D.palletDepth, 0.008);
  for (let slot = 0; slot < D.rows * D.columns; slot++) {
    const [x, z] = slotPosition(slot);
    const hole = new THREE.Path();
    hole.absarc(x, -z, 0.013, 0, Math.PI * 2, true);
    palletShape.holes.push(hole);
  }
  const palletGeometry = plate(palletShape, 0.022); palletGeometry.rotateX(-Math.PI / 2);
  const pallets: [THREE.Group, THREE.Group] = [group(elevated, 'P1_upper_pallet'), group(elevated, 'P2_lifting_pallet')];
  const partHeight = mm(layout.partGeometry.length);
  const partGeometry = new THREE.CylinderGeometry(mm(layout.partGeometry.diameter) / 2, mm(layout.partGeometry.diameter) / 2, partHeight, 16);
  const productMaterial = (appearance: PartMaterialLayout) => new THREE.MeshStandardMaterial({
    color: appearance.color, metalness: 0.2, roughness: 0.36,
    opacity: appearance.opacity, transparent: appearance.opacity < 1,
    depthWrite: appearance.opacity >= 0.98,
  });
  const productMeshes = pallets.map((pallet, index) => {
    mesh(pallet, 'fence_color_drilled_plate', palletGeometry, m.pallet, [0, 0.011, 0]);
    box(pallet, 'pallet_front_rim', [D.palletLength + 0.034, 0.012, 0.03], [0, -0.006, 0.28], m.steel);
    box(pallet, 'pallet_rear_rim', [D.palletLength + 0.034, 0.012, 0.055], [0, -0.006, -0.292], m.steel);
    for (const x of [-PALLET_END_X, PALLET_END_X]) {
      box(pallet, 'pallet_end_frame', [0.022, 0.018, 0.54], [x, -0.009, 0], m.steel);
      for (const z of [-0.259, 0.259]) bolt(pallet, [x, 0.004, z], 'y', 0.003);
    }
    const createProducts = (kind: 'blank' | 'detail') => layout.productPartMaterials.map((appearance, type) => {
      const mesh = new THREE.InstancedMesh(partGeometry, productMaterial(appearance[kind]), D.rows * D.columns);
      mesh.name = `P${index + 1}_${kind}_type_${type + 1}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = true;
      mesh.count = 0; pallet.add(mesh); return mesh;
    });
    return { blank: createProducts('blank'), detail: createProducts('detail') };
  });

  const sideShape = new THREE.Shape();
  const sideTopHalf = D.palletLength / 2 + 0.023;
  const sideBottomHalf = sideTopHalf - 0.1;
  sideShape.moveTo(-sideTopHalf, -0.013); sideShape.lineTo(sideTopHalf, -0.013);
  sideShape.lineTo(sideBottomHalf, -0.262); sideShape.lineTo(-sideBottomHalf, -0.262); sideShape.closePath();
  for (const x of [-sideBottomHalf + 0.02, 0.065]) {
    const opening = new THREE.Path(); roundedRect(opening, x, -0.17, sideBottomHalf - 0.085, 0.063, 0.009); sideShape.holes.push(opening);
  }
  for (const x of [-sideBottomHalf + 0.034, sideBottomHalf - 0.034]) {
    const hole = new THREE.Path(); hole.absarc(x, -0.233, 0.005, 0, Math.PI * 2, true); sideShape.holes.push(hole);
  }
  mesh(pallets[0], 'P1_trapezoid_side_with_two_windows', plate(sideShape, 0.012), m.steel, [0, 0, 0.315]);
  box(pallets[0], 'P1_lower_fold', [D.palletLength - 0.15, 0.009, 0.054], [0, -0.259, 0.325], m.steel);
  box(pallets[0], 'P1_high_rear_flange', [D.palletLength + 0.02, 0.011, 0.09], [0, -0.017, -0.315], m.steel);
  for (const x of [-(D.palletLength / 2 - 0.14), D.palletLength / 2 - 0.14]) {
    runner(pallets[0], x, RAIL_TOP + 0.014 - D.top, 0.336);
    runner(pallets[0], x, REAR_RAIL_TOP + 0.014 - D.top, -0.337);
    box(pallets[0], 'P1_rear_runner_spacer', [0.095, 0.016, 0.055], [x, -0.028, -0.337], m.steel);
    bolt(pallets[0], [x, -0.231, 0.323], 'z');
  }

  // P2: lower runner frame, one pneumatic cylinder and four sliding guide columns.
  const liftBase = group(elevated, 'P2_lower_runner_frame', [0, LOW_RAIL_SHIFT, 0]);
  for (const z of [-0.265, 0.265]) {
    box(liftBase, 'P2_long_base_strip', [D.palletLength - 0.16, 0.013, 0.055], [0, 0.889, z], m.steel);
    for (const x of [-(D.palletLength / 2 - 0.15), D.palletLength / 2 - 0.15]) runner(liftBase, x, ORIGINAL_LOW_RAIL_TOP + 0.014, z);
  }
  for (const x of [-(D.palletLength / 2 - 0.19), D.palletLength / 2 - 0.19]) {
    box(liftBase, 'P2_base_crosspiece', [0.055, 0.018, 0.56], [x, 0.89, 0], m.steel);
    box(pallets[1], 'P2_lift_crosspiece', [0.052, 0.026, 0.54], [x, -0.025, 0], m.steel);
    for (const z of [-0.207, 0.207]) {
      cylinder(liftBase, 'guide_bearing_body', 0.022, 0.049, [x, 0.881, z], m.aluminium);
      cylinder(liftBase, 'blue_guide_wiper', 0.021, 0.014, [x, 0.914, z], m.blueLight);
      cylinder(pallets[1], 'P2_sliding_guide_column', 0.01, 0.265, [x, -0.155, z]);
      cylinder(pallets[1], 'guide_column_shoulder', 0.016, 0.019, [x, -0.026, z], m.chrome);
    }
  }
  const stiffener = new THREE.Shape();
  stiffener.moveTo(-0.23, -0.035); stiffener.lineTo(0.23, -0.035);
  stiffener.lineTo(0.23, -0.07); stiffener.lineTo(0.062, -0.07);
  stiffener.lineTo(0.032, -0.205); stiffener.lineTo(-0.032, -0.205);
  stiffener.lineTo(-0.062, -0.07); stiffener.lineTo(-0.23, -0.07); stiffener.closePath();
  const stiffenerGeometry = plate(stiffener, 0.012); stiffenerGeometry.rotateY(Math.PI / 2);
  for (const x of [-(D.palletLength / 2 - 0.1), D.palletLength / 2 - 0.1]) mesh(pallets[1], 'P2_T_shaped_end_stiffener', stiffenerGeometry, m.steel, [x, 0, 0]);
  box(liftBase, 'lift_cylinder_mount', [0.13, 0.014, 0.15], [0, 0.834, 0], m.steel);
  box(liftBase, 'lift_cylinder_barrel', [0.07, 0.185, 0.07], [0, 0.7335, 0], m.aluminium);
  for (const y of [0.633, 0.834]) {
    box(liftBase, 'lift_end_cap', [0.082, 0.018, 0.082], [0, y, 0], m.aluminium);
    for (const x of [-0.029, 0.029]) for (const z of [-0.029, 0.029]) bolt(liftBase, [x, y + 0.01, z], 'y', 0.003);
    fitting(liftBase, [0, y, -0.045]);
  }
  for (const x of [-0.029, 0.029]) for (const z of [-0.029, 0.029]) cylinder(liftBase, 'lift_tie_rod', 0.0028, 0.183, [x, 0.7335, z], m.steel);
  for (const y of [0.66, 0.806]) {
    box(liftBase, 'lift_reed_switch', [0.013, 0.027, 0.008], [0.025, y, -0.04], m.dark);
    box(liftBase, 'reed_indicator', [0.006, 0.007, 0.002], [0.025, y + 0.007, -0.045], m.green);
  }
  const piston = cylinder(liftBase, 'lift_piston_rod', 0.013, 1, [0, 0, 0]); piston.userData.animated = true;
  cylinder(pallets[1], 'lift_rod_locknut', 0.021, 0.017, [0, -0.028, 0], m.steel);
  box(pallets[1], 'lift_top_plate', [0.16, 0.018, 0.14], [0, -0.01, 0], m.steel);

  // Outboard timing drive underneath the inspection conveyor.
  const drive = group(elevated, 'Carriage_timing_drive', [0, LOW_RAIL_SHIFT, 0]);
  const driveZ = -0.414;
  const driveY = 0.863;
  const driveRadius = 0.025;
  profile(drive, 'drive_side_beam', 1.9, 0.06, 0.082, [0, 0.81, driveZ + 0.018]);
  for (const sign of [-1, 1]) {
    box(drive, 'green_belt_run', [1.88, 0.004, 0.024], [0, driveY + sign * driveRadius, driveZ], m.green);
    box(drive, 'pulley_end_plate', [0.096, 0.1, 0.012], [sign * 0.94, driveY - 0.013, driveZ + 0.028], m.aluminium);
    for (const dx of [-0.033, 0.033]) for (const dy of [-0.043, 0.019]) bolt(drive, [sign * 0.94 + dx, driveY + dy, driveZ + 0.036], 'z', 0.0035);
  }
  const driveRollers = [-0.94, 0.94].map((x) => {
    const pulley = group(drive, 'Timing_pulley', [x, driveY, driveZ]);
    cylinder(pulley, 'green_belt_around_pulley', driveRadius, 0.026, [0, 0, 0], m.green, 'z');
    cylinder(pulley, 'pulley_front_flange', 0.028, 0.003, [0, 0, -0.017], m.chrome, 'z');
    cylinder(pulley, 'pulley_bearing', 0.009, 0.008, [0, 0, -0.022], m.steel, 'z');
    for (const dx of [-0.018, 0.018]) bolt(pulley, [dx, 0, -0.022], 'z', 0.0025);
    return pulley;
  });
  box(drive, 'axis_motor_gearcase', [0.09, 0.093, 0.09], [0.94, driveY, -0.333], m.aluminium);
  box(drive, 'axis_motor_square_flange', [0.095, 0.095, 0.016], [0.94, driveY, -0.28], m.dark);
  box(drive, 'axis_motor_body', [0.07, 0.07, 0.14], [0.94, driveY, -0.204], m.aluminium);
  box(drive, 'axis_motor_back_cap', [0.073, 0.073, 0.02], [0.94, driveY, -0.124], m.dark);
  for (const offset of [-0.024, -0.012, 0, 0.012, 0.024]) box(drive, 'motor_longitudinal_rib', [0.003, 0.004, 0.12], [0.94 + offset, driveY + 0.037, -0.204], m.steel);
  box(drive, 'motor_cable_connector', [0.027, 0.025, 0.034], [0.987, driveY + 0.015, -0.16], m.dark);
  for (const x of [-0.91, 0, 0.91]) {
    box(drive, 'carriage_sensor_bracket', [0.029, 0.038, 0.025], [x, 0.878, -0.371], m.steel);
    cylinder(drive, 'carriage_position_sensor', 0.007, 0.023, [x, 0.908, -0.371], m.brass);
    cylinder(drive, 'yellow_sensor_head', 0.0075, 0.008, [x, 0.924, -0.371], m.yellow);
  }
  const driveTeeth = new THREE.InstancedMesh(cube, m.steel, 240);
  driveTeeth.name = 'Animated_timing_belt_teeth'; driveTeeth.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  driveTeeth.frustumCulled = false; drive.add(driveTeeth);

  const carriage = group(elevated, 'Driven_carriage', [0, LOW_RAIL_SHIFT, 0]);
  box(carriage, 'common_carriage_crossbar', [0.07, 0.026, 0.72], [0, 0.806, -0.033], m.steel);
  box(carriage, 'belt_carriage_plate', [0.11, 0.084, 0.019], [0, 0.862, -0.391], m.steel);
  box(carriage, 'toothed_belt_clamp', [0.075, 0.017, 0.033], [0, 0.891, driveZ], m.aluminium);
  for (const x of [-0.024, 0.024]) bolt(carriage, [x, 0.902, driveZ]);
  const selectorCylinder = (parent: THREE.Group, name: string, position: XYZ) => {
    const body = group(parent, name, position);
    box(body, 'compact_cylinder_body', [0.046, 0.034, 0.068], [0, 0, 0], m.aluminium);
    for (const z of [-0.035, 0.035]) {
      box(body, 'cylinder_end_plate', [0.05, 0.038, 0.008], [0, 0, z], m.steel);
      for (const x of [-0.016, 0.016]) bolt(body, [x, 0.011, z + 0.005], 'z', 0.0025);
    }
    for (const z of [-0.024, 0.024]) {
      box(body, 'cylinder_reed_switch', [0.01, 0.01, 0.018], [-0.019, 0.023, z], m.dark);
      fitting(body, [0.021, 0.012, z]);
    }
    const moving = group(body, 'Selector_piston_and_fork');
    cylinder(moving, 'selector_rod', 0.006, 0.046, [0, 0, 0.051], m.chrome, 'z');
    box(moving, 'fork_crosshead', [0.049, 0.019, 0.014], [0, 0, 0.078], m.steel);
    for (const x of [-0.019, 0.019]) box(moving, 'fork_finger', [0.011, 0.047, 0.018], [x, 0.019, 0.078], m.steel);
    return moving;
  };
  const lock = selectorCylinder(carriage, 'Moving_lock_cylinder', [0, 0.918, -0.404]);
  const stop = selectorCylinder(elevated, 'Fixed_operator_stop_cylinder', [OPERATOR_X + PALLET_COUPLING_X, 0.918 + LOW_RAIL_SHIFT, -0.404]);
  box(elevated, 'fixed_stop_mount', [0.08, 0.018, 0.096], [OPERATOR_X + PALLET_COUPLING_X, 0.891 + LOW_RAIL_SHIFT, -0.386], m.steel);
  for (const pallet of pallets) box(pallet, 'pallet_coupling_lug', [0.055, 0.035, 0.043], [PALLET_COUPLING_X, -0.043, -0.305], m.steel);

  // Same open-link, constant-length chain used on the portal robot.
  const chain = createCableChain('P2_air_and_sensor_cable_chain', D.travel / 2, 0.045, 0.047, 0.017);
  chain.root.position.set(0.015, 0.775 + LOW_RAIL_SHIFT, -0.487);
  chain.root.rotation.y = Math.PI;
  elevated.add(chain.root);
  const tray = group(elevated, 'Cable_chain_ladder_tray', [0, LOW_RAIL_SHIFT, 0]);
  box(tray, 'tray_back', [1.48, 0.038, 0.005], [-0.21, 0.777, -0.456], m.dark);
  box(tray, 'tray_outer_lip', [1.48, 0.012, 0.004], [-0.21, 0.764, -0.519], m.dark);
  for (let i = 0; i < 19; i++) box(tray, 'tray_rung', [0.023, 0.005, 0.067], [-0.91 + i * 0.078, 0.757, -0.487], m.dark);
  box(liftBase, 'chain_moving_attachment', [0.063, 0.025, 0.08], [0.015, 0.863, -0.446], m.steel);

  // Slim blue conveyor, separate side plates, rounded belt returns and gearmotor.
  const conveyor = group(elevated, 'Inspection_conveyor', [0, CONVEYOR_SHIFT, 0]);
  for (const x of [-0.85, 0.85]) {
    box(conveyor, 'conveyor_mount_post', [0.031, 0.236, 0.034], [x, 0.989, BELT_Z], m.frame);
    box(conveyor, 'conveyor_mount_foot', [0.09, 0.011, 0.084], [x, 0.876, BELT_Z + 0.015], m.steel);
    box(conveyor, 'conveyor_saddle', [0.095, 0.009, 0.11], [x, 1.107, BELT_Z], m.steel);
    for (const dx of [-0.029, 0.029]) bolt(conveyor, [x + dx, 0.884, BELT_Z + 0.015]);
  }
  profile(conveyor, 'conveyor_underframe', 1.92, 0.065, 0.036, [0, 1.091, BELT_Z]);
  const beltShape = new THREE.Shape();
  roundedRect(beltShape, -BELT_HALF - BELT_RADIUS, -BELT_RADIUS, INSPECTION_BELT_SPAN + 2 * BELT_RADIUS, BELT_RADIUS * 2, BELT_RADIUS);
  const beltInside = new THREE.Path();
  roundedRect(beltInside, -BELT_HALF - BELT_RADIUS + 0.003, -BELT_RADIUS + 0.003,
    INSPECTION_BELT_SPAN + 2 * BELT_RADIUS - 0.006, BELT_RADIUS * 2 - 0.006, BELT_RADIUS - 0.003);
  beltShape.holes.push(beltInside);
  mesh(conveyor, 'continuous_blue_belt_loop', plate(beltShape, 0.094), m.blue, [0, BELT_AXIS_Y, BELT_Z]);
  const sideShapeConveyor = new THREE.Shape();
  roundedRect(sideShapeConveyor, -BELT_HALF - 0.019, -0.02, INSPECTION_BELT_SPAN + 0.038, 0.04, 0.019);
  for (const x of [-BELT_HALF, BELT_HALF]) {
    const axle = new THREE.Path(); axle.absarc(x, 0, 0.006, 0, Math.PI * 2, true); sideShapeConveyor.holes.push(axle);
  }
  const conveyorSideGeometry = plate(sideShapeConveyor, 0.006);
  for (const sign of [-1, 1]) {
    mesh(conveyor, 'rounded_conveyor_side_plate', conveyorSideGeometry, m.aluminium, [0, BELT_AXIS_Y, BELT_Z + sign * 0.052]);
    for (const x of [-0.9, -0.865, 0.865, 0.9]) bolt(conveyor, [x, BELT_AXIS_Y, BELT_Z + sign * 0.057], 'z', 0.003);
    box(conveyor, 'tension_adjuster', [0.036, 0.012, 0.013], [0.928, BELT_AXIS_Y - 0.002, BELT_Z + sign * 0.06], m.steel);
  }
  const rollers = [-BELT_HALF, BELT_HALF].map((x) => {
    const roller = group(conveyor, 'Conveyor_end_drum', [x, BELT_AXIS_Y, BELT_Z]);
    cylinder(roller, 'roller_drum', 0.023, 0.092, [0, 0, 0], m.chrome, 'z');
    cylinder(roller, 'roller_axle', 0.0055, 0.13, [0, 0, 0], m.chrome, 'z');
    cylinder(roller, 'roller_hub', 0.01, 0.006, [0, 0, 0.061], m.brass, 'z');
    return roller;
  });
  const gearmotor = group(conveyor, 'Blue_worm_gearbox_and_vertical_motor', [-BELT_HALF, BELT_AXIS_Y, BELT_Z - 0.114]);
  box(gearmotor, 'worm_gearcase', [0.083, 0.085, 0.069], [0, 0, 0], m.blueSteel);
  for (const x of [-0.033, 0.033]) box(gearmotor, 'gearcase_rib', [0.009, 0.093, 0.077], [x, 0, 0], m.blueSteel);
  for (const z of [-0.041, 0.041]) {
    cylinder(gearmotor, 'output_flange', 0.03, 0.012, [0, 0, z], m.blueSteel, 'z');
    cylinder(gearmotor, 'output_bearing_seal', 0.02, 0.014, [0, 0, z * 1.12], m.dark, 'z');
    cylinder(gearmotor, 'output_shaft', 0.012, 0.023, [0, 0, z * 1.25], m.chrome, 'z');
    for (const x of [-0.027, 0.027]) for (const y of [-0.029, 0.029]) bolt(gearmotor, [x, y, z], 'z', 0.003);
  }
  cylinder(gearmotor, 'motor_adapter_flange', 0.048, 0.017, [0, -0.054, 0], m.blueSteel);
  cylinder(gearmotor, 'vertical_motor_casing', 0.041, 0.151, [0, -0.138, 0], m.steel);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const fin = box(gearmotor, 'vertical_cooling_fin', [0.006, 0.12, 0.009], [Math.cos(a) * 0.043, -0.13, Math.sin(a) * 0.043], m.steel);
    fin.rotation.y = -a;
  }
  cylinder(gearmotor, 'motor_fan_cover', 0.046, 0.031, [0, -0.223, 0], m.dark);
  mesh(gearmotor, 'motor_rounded_tail', new THREE.CylinderGeometry(0.045, 0.032, 0.022, 20), m.dark, [0, -0.249, 0]);
  for (let i = -2; i <= 2; i++) box(gearmotor, 'fan_cover_vent', [0.005, 0.017, 0.002], [i * 0.012, -0.224, 0.044], m.slot);
  box(gearmotor, 'motor_terminal_box', [0.043, 0.058, 0.024], [0.043, -0.116, 0], m.dark);
  cylinder(gearmotor, 'motor_cable_gland', 0.008, 0.019, [0.065, -0.098, 0], m.dark, 'x');

  const beltMarks = new THREE.InstancedMesh(cube, m.blueSteel, 30);
  beltMarks.name = 'Subtle_conveyor_belt_motion_lines'; beltMarks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beltMarks.frustumCulled = false; conveyor.add(beltMarks);
  const sample = mesh(conveyor, 'Inspection_sample', partGeometry, m.chrome);
  sample.visible = false; sample.userData.animated = true;
  batchDetails(root);
  return { root, pallets, carriage, liftBase, liftRods: [piston], lock, stop, chain,
    beltMarks, driveTeeth, driveRollers, rollers, sample, sampleHeight: partHeight / 2,
    productMeshes, inventorySources: [undefined, undefined], inventorySignatures: ['', ''],
    lastDriveX: Number.NaN, lastP2X: Number.NaN, lastBeltPhase: Number.NaN };
}

export function updateTwoPalletMagazine(rig: TwoPalletMagazineRig, controller: TwoPalletPreviewController, inventory?: PalletInventory[], configurationKnown = true, pose?: TwoPalletPose): void {
  const p = pose ?? controller.pose;
  const x = (t: number) => OPERATOR_X + (ROBOT_X - OPERATOR_X) * t;
  rig.pallets[0].position.set(x(p.p1), D.top, 0);
  rig.pallets[1].position.set(x(p.p2), LOW + p.lift * D.lift, 0);
  rig.carriage.position.x = x(p.carriage);
  rig.liftBase.position.x = x(p.p2);
  const rodTop = LOW + p.lift * D.lift - 0.028 - rig.liftBase.position.y;
  rig.liftRods.forEach((rod) => {
    rod.scale.y = rodTop - LIFT_ROD_BOTTOM;
    rod.position.y = (LIFT_ROD_BOTTOM + rodTop) / 2;
  });
  rig.lock.position.z = p.selector * 0.022;
  rig.stop.position.z = (1 - p.selector) * 0.022;
  rig.productMeshes.forEach((sets, pallet) => {
    const source = inventory?.[pallet];
    const demo = !source && controller.showParts;
    if (source === rig.inventorySources[pallet] && (source || rig.inventorySignatures[pallet] === (demo ? 'demo' : 'empty'))) return;
    rig.inventorySources[pallet] = source;
    const signature = source
      ? source.slots.map((slot, index) => `${slot[0]}${source.productTypes[index] ?? 1}`).join('')
      : demo ? 'demo' : 'empty';
    if (signature === rig.inventorySignatures[pallet]) return;
    rig.inventorySignatures[pallet] = signature;
    const counts = { blank: [0, 0, 0], detail: [0, 0, 0] };
    for (let slot = 0; slot < D.rows * D.columns; slot++) {
      const content = source?.slots[slot] ?? (demo ? 'blank' : 'empty');
      if (content !== 'blank' && content !== 'detail') continue;
      const type = Math.min(3, Math.max(1, source?.productTypes[slot] ?? 1)) - 1;
      const [localX, localZ] = slotPosition(slot);
      matrix.makeTranslation(localX, rig.sampleHeight + 0.002, localZ);
      sets[content][type].setMatrixAt(counts[content][type]++, matrix);
    }
    for (const kind of ['blank', 'detail'] as const) sets[kind].forEach((mesh, type) => {
      mesh.count = counts[kind][type];
      if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
    });
  });
  const p2X = x(p.p2);
  if (Math.abs(p2X - rig.lastP2X) > 0.00001 || Number.isNaN(rig.lastP2X)) {
    rig.chain.update(-p2X);
    rig.lastP2X = p2X;
  }
  const driveOffset = x(p.carriage);
  if (Math.abs(driveOffset - rig.lastDriveX) > 0.00001 || Number.isNaN(rig.lastDriveX)) {
    for (let i = 0; i < 120; i++) {
      const t = ((i / 120 + driveOffset / 1.88) % 1 + 1) % 1;
      matrix.makeScale(0.005, 0.003, 0.023);
      matrix.setPosition(-0.94 + t * 1.88, 0.884, -0.414); rig.driveTeeth.setMatrixAt(i, matrix);
      matrix.setPosition(0.94 - t * 1.88, 0.842, -0.414); rig.driveTeeth.setMatrixAt(i + 120, matrix);
    }
    rig.driveTeeth.instanceMatrix.needsUpdate = true;
    rig.driveRollers.forEach((roller) => { roller.rotation.z = -driveOffset / 0.025; });
    rig.lastDriveX = driveOffset;
  }
  if (controller.beltPhase !== rig.lastBeltPhase) {
    for (let i = 0; i < rig.beltMarks.count; i++) {
      const phase = (i / rig.beltMarks.count + controller.beltPhase) % 1;
      matrix.makeScale(0.001, 0.0005, 0.09);
      matrix.setPosition(-BELT_HALF + phase * INSPECTION_BELT_SPAN, BELT_TOP + 0.0006, BELT_Z);
      rig.beltMarks.setMatrixAt(i, matrix);
    }
    rig.beltMarks.instanceMatrix.needsUpdate = true;
    rig.rollers.forEach((roller) => { roller.rotation.z = -controller.beltTravel / (BELT_RADIUS - 0.003); });
    rig.lastBeltPhase = controller.beltPhase;
  }
  rig.sample.visible = controller.sample !== null;
  if (controller.sample !== null) rig.sample.position.set(
    (controller.sample - 0.5) * INSPECTION_SAMPLE_SPAN, BELT_TOP + rig.sampleHeight, BELT_Z,
  );
  rig.pallets.forEach((pallet) => { pallet.visible = configurationKnown; });
  rig.carriage.visible = configurationKnown;
  rig.liftBase.visible = configurationKnown;
  rig.chain.root.visible = configurationKnown;
}
