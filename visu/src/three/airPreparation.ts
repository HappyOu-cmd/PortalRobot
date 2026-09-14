import * as THREE from 'three';
import { addButtonCylinder } from './buttonParts';
import { createEmergencyIndicator, type EmergencyIndicatorRig } from './emergencyIndicator';
import { material } from './primitives';

type XYZ = [number, number, number];

export interface AirPreparationRig {
  root: THREE.Group;
  alarm: EmergencyIndicatorRig;
}

function block(parent: THREE.Object3D, name: string, size: XYZ, position: XYZ, surface: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, name: string, radius: number, height: number, position: XYZ, surface: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function tube(parent: THREE.Group, name: string, points: XYZ[], surface: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0035, 8, false), surface);
  mesh.name = name;
  parent.add(mesh);
}

/** Simplified pneumatic panel, with its mounting brackets at Z=0 and its face toward +Z. */
export function createAirPreparation(support: number): AirPreparationRig {
  const root = new THREE.Group();
  root.name = 'rear_air_preparation_panel';
  const backing = material(0x97a5ac, { roughness: 0.58, metalness: 0.28 });
  const steel = material(0xb5c3ca, { roughness: 0.4, metalness: 0.55 });
  const blue = material(0x167bbc, { roughness: 0.4, metalness: 0.15 });
  const bowls = material(0x819ba6, { roughness: 0.28, metalness: 0.3 });
  const hose = material(0x0871b8, { roughness: 0.5 });
  const dark = material(0x24343e, { roughness: 0.6 });
  const white = material(0xe5eceb, { roughness: 0.7 });

  for (const y of [-0.12, 0.12]) {
    block(root, 'pneumatic_mounting_bracket', [support + 0.04, 0.03, 0.22], [0, y, 0.11], dark);
  }
  block(root, 'pneumatic_backing_plate', [0.51, 0.36, 0.012], [0, 0, 0.226], backing);
  for (const x of [-0.232, 0.232]) for (const y of [-0.155, 0.155]) {
    const screw = addButtonCylinder(root, 'pneumatic_mount_screw', 0.006, 0.003, 0.234, dark);
    screw.position.set(x, y, 0.234);
  }

  // Regulator/filter pair: large silhouettes, without small threads or internal parts.
  for (const x of [-0.165, -0.070]) {
    block(root, 'filter_head', [0.077, 0.060, 0.056], [x, 0.064, 0.268], steel);
    cylinder(root, 'filter_bowl', 0.032, 0.137, [x, -0.040, 0.272], bowls);
    for (const y of [-0.115, 0.027]) cylinder(root, 'filter_bowl_collar', 0.035, 0.014, [x, y, 0.272], steel);
    block(root, 'filter_level_window', [0.010, 0.087, 0.004], [x, -0.04, 0.305], white);
    cylinder(root, 'filter_drain', 0.010, 0.022, [x, -0.133, 0.272], dark);
  }
  block(root, 'filter_link', [0.026, 0.032, 0.035], [-0.117, 0.064, 0.27], dark);
  cylinder(root, 'pressure_adjustment_collar', 0.032, 0.010, [-0.165, 0.10, 0.268], dark);
  cylinder(root, 'pressure_adjustment_knob', 0.029, 0.055, [-0.165, 0.132, 0.268], blue);
  cylinder(root, 'lubricator_cap', 0.019, 0.027, [-0.070, 0.108, 0.268], steel);

  const gauge = new THREE.Group();
  gauge.name = 'air_pressure_gauge';
  gauge.position.set(-0.165, 0.064, 0.303);
  root.add(gauge);
  addButtonCylinder(gauge, 'gauge_bezel', 0.043, 0.012, 0.006, dark);
  addButtonCylinder(gauge, 'gauge_dial', 0.036, 0.002, 0.013, white);
  for (let i = 0; i < 9; i++) {
    const angle = THREE.MathUtils.degToRad(-130 + i * 32.5);
    const tick = block(gauge, 'gauge_tick', [0.0015, 0.005, 0.001],
      [Math.sin(angle) * 0.03, Math.cos(angle) * 0.03, 0.015], dark);
    tick.rotation.z = -angle;
  }
  const needle = block(gauge, 'gauge_needle', [0.0018, 0.028, 0.001], [0.006, 0.009, 0.017], dark);
  needle.rotation.z = -0.6;
  addButtonCylinder(gauge, 'gauge_pivot', 0.003, 0.002, 0.018, dark);

  // A common manifold feeds three simple valve modules.
  block(root, 'valve_manifold', [0.038, 0.183, 0.040], [0.141, -0.010, 0.264], steel);
  for (const y of [-0.070, -0.010, 0.050]) {
    block(root, 'pneumatic_valve', [0.104, 0.043, 0.056], [0.075, y, 0.275], blue);
    block(root, 'valve_solenoid', [0.036, 0.031, 0.046], [0.005, y, 0.273], dark);
    const indicator = addButtonCylinder(root, 'valve_manual_override', 0.005, 0.003, 0.305, steel);
    indicator.position.set(0.09, y, 0.305);
  }
  block(root, 'air_pressure_switch', [0.037, 0.057, 0.043], [0.199, 0.091, 0.269], blue);
  block(root, 'pressure_switch_connector', [0.025, 0.018, 0.026], [0.199, 0.129, 0.269], dark);

  // Supply from below, regulator to manifold, and three outgoing lines returning behind the support.
  tube(root, 'air_supply_hose', [
    [-0.035, -0.59, 0.015], [-0.28, -0.48, 0.27], [-0.29, -0.02, 0.28], [-0.26, 0.064, 0.27], [-0.204, 0.064, 0.268],
  ], hose);
  tube(root, 'regulated_air_to_manifold', [
    [-0.031, 0.064, 0.268], [-0.012, 0.10, 0.31], [0.044, 0.144, 0.30], [0.141, 0.13, 0.28], [0.141, 0.082, 0.264],
  ], hose);
  tube(root, 'manifold_pressure_feedback', [
    [0.16, 0.050, 0.264], [0.192, 0.047, 0.28], [0.199, 0.063, 0.269],
  ], hose);
  [-0.070, -0.010, 0.050].forEach((y, index) => {
    const outsideX = 0.266 + index * 0.017;
    tube(root, `pneumatic_outlet_${index + 1}`, [
      [0.127, y, 0.298], [0.21, y - 0.015, 0.32], [outsideX, y - 0.04, 0.31],
      [outsideX, -0.20 - index * 0.026, 0.27], [0.09, -0.29 - index * 0.026, 0.12],
      [0.025 - index * 0.025, -0.33 - index * 0.026, 0],
    ], hose);
  });

  const alarm = createEmergencyIndicator(root, [backing, steel, blue, bowls, hose], 0.72, 0.54, 0.345);
  return { root, alarm };
}
