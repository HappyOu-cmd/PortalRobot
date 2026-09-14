import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CellLayout } from '../model/types';
import { getRobotTravelLimits } from '../model/travel';
import { box, cylinder, logicalPosition, mm } from './primitives';
import { createCableChain } from './cableChain';
import { getPortalPostXsMm, getPortalRailClearanceMm, getPortalSupportHeightMm, PORTAL_MEASUREMENTS, PORTAL_MOUNTING } from '../config/portalMeasurements';

const ALUMINIUM = 0xb7bfc5;
const STEEL = 0x737e87;
const DARK = 0x30373e;
const SLOT = 0x515b63;
type XYZ = [number, number, number];

function block(parent: THREE.Object3D, name: string, size: XYZ, position: XYZ, color = ALUMINIUM) {
  const mesh = box(name, new THREE.Vector3(...size), color, new THREE.Vector3(...position), {
    metalness: 0.48, roughness: 0.4,
  });
  parent.add(mesh);
  return mesh;
}

/** Extrusion along local Y; recessed-looking dark slots give the silhouette
 * of an aluminium profile without modelling T-slot internals or fasteners. */
function profile(name: string, width: number, height: number, depth: number) {
  const root = new THREE.Group();
  root.name = name;
  block(root, `${name}_body`, [width, height, depth], [0, 0, 0]);
  for (const side of [-1, 1]) {
    for (const lane of [-1, 1]) {
      block(root, `${name}_slot`, [width * 0.09, height * 0.985, 0.002],
        [lane * width * 0.28, 0, side * (depth / 2 + 0.001)], SLOT);
      block(root, `${name}_side_slot`, [0.002, height * 0.985, depth * 0.08],
        [side * (width / 2 + 0.001), 0, lane * depth * 0.27], SLOT);
    }
  }
  return root;
}

function brace(parent: THREE.Object3D, name: string, start: XYZ, end: XYZ, width: number) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const mesh = block(parent, name, [width, a.distanceTo(b), width], [0, 0, 0], STEEL);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
}

/** Mitred knee: its vertical and horizontal end faces meet the mounting plates.
 * Rotating a square-ended box leaves a gap at one edge of either connection. */
function kneeBrace(parent: THREE.Object3D, position: XYZ, direction: number, support: number, reach: number) {
  const root = new THREE.Group();
  root.name = 'portal_knee_brace';
  root.position.set(...position);
  root.scale.x = direction;
  const plate = 0.014;
  const section = support * 0.6;
  const startX = support / 2 + plate;
  const startY = -0.55;
  const endY = -plate;
  const slope = (endY - startY) / (reach - startX);
  const offset = section / 2 * Math.hypot(1, slope);
  const shape = new THREE.Shape();
  shape.moveTo(startX, startY - offset);
  shape.lineTo(reach + offset / slope, endY);
  shape.lineTo(reach - offset / slope, endY);
  shape.lineTo(startX, startY + offset);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: section, bevelEnabled: false });
  geometry.translate(0, 0, -section / 2);
  const strut = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: STEEL, metalness: 0.48, roughness: 0.4,
  }));
  strut.name = 'portal_knee_strut';
  strut.castShadow = true;
  strut.receiveShadow = true;
  root.add(strut);
  block(root, 'portal_knee_column_plate', [plate, offset * 2 + 0.045, section + 0.045],
    [support / 2 + plate / 2, startY, 0]);
  block(root, 'portal_knee_beam_plate', [offset * 2 / slope + 0.07, plate, section + 0.045],
    [reach, -plate / 2, 0]);
  parent.add(root);
}

/** Side-mounted black ladder shelf, along local X. The inner wall touches
 * the extrusion; the low outer lip does not hide the moving chain. */
function ladderTray(name: string, length: number, width: number, height: number, innerSide: number) {
  const root = new THREE.Group();
  root.name = name;
  const sheet = 0.006;
  block(root, `${name}_mounting_wall`, [length, height, sheet],
    [0, height / 2, innerSide * (width - sheet) / 2], DARK);
  block(root, `${name}_outer_lip`, [length, 0.025, sheet],
    [0, 0.0125, -innerSide * (width - sheet) / 2], DARK);
  const pieces: THREE.BufferGeometry[] = [];
  const count = Math.max(2, Math.ceil(length / 0.11));
  for (let i = 0; i <= count; i++) {
    const rungWidth = 0.027;
    const x = -length / 2 + rungWidth / 2 + i * (length - rungWidth) / count;
    pieces.push(new THREE.BoxGeometry(rungWidth, sheet, width).translate(x, sheet / 2, 0));
  }
  const rungs = new THREE.Mesh(mergeGeometries(pieces)!, new THREE.MeshStandardMaterial({
    color: DARK, metalness: 0.35, roughness: 0.5,
  }));
  pieces.forEach((piece) => piece.dispose());
  rungs.name = `${name}_rungs`;
  rungs.castShadow = true;
  rungs.receiveShadow = true;
  root.add(rungs);
  return root;
}

function servo(parent: THREE.Object3D, name: string, position: XYZ, size = 1) {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(...position);
  root.scale.setScalar(size);
  block(root, `${name}_gearbox`, [0.16, 0.12, 0.16], [0, 0.06, 0]);
  block(root, `${name}_flange`, [0.17, 0.025, 0.17], [0, 0.13, 0]);
  block(root, `${name}_housing`, [0.12, 0.22, 0.12], [0, 0.25, 0], DARK);
  for (const x of [-0.064, 0.064]) {
    block(root, `${name}_rib`, [0.013, 0.22, 0.12], [x, 0.25, 0]);
  }
  root.add(cylinder(`${name}_cap`, 0.068, 0.035, STEEL, new THREE.Vector3(0, 0.375, 0)));
  block(root, `${name}_connector`, [0.055, 0.05, 0.045], [0, 0.32, 0.079], DARK);
  parent.add(root);
  return root;
}

export function createPortalMechanics(layout: CellLayout) {
  const portal = layout.portal;
  const root = new THREE.Group();
  root.name = 'Portal';
  root.position.copy(logicalPosition(portal.position.x, portal.position.y, portal.position.z));
  const length = mm(portal.lengthX);
  const width = mm(portal.widthY);
  const railHeight = mm(portal.frameBottomZ);
  const supportHeight = mm(getPortalSupportHeightMm(portal));
  const frameHeight = mm(portal.frameThicknessZ);
  const depth = mm(portal.frameDepthY);
  const support = mm(portal.supportSize);
  const armHeight = mm(PORTAL_MOUNTING.endArmHeight);
  const columnWidth = mm(layout.robot.zColumnWidth);
  // Layout lengths are also the PLC visual stroke. Add mechanical end space
  // outside that stroke so the ram clears the X rails at both Y limits.
  const railClearance = mm(getPortalRailClearanceMm(portal.frameDepthY, layout.robot.zColumnWidth));
  const frontRail = railClearance;
  const rearRail = -width - railClearance;
  const span = frontRail - rearRail;
  const frameStart = -Math.max(mm(PORTAL_MOUNTING.railEndMarginX), support * 2);
  const frameEnd = length - frameStart;
  const frameLength = frameEnd - frameStart;
  const railTop = railHeight + frameHeight;
  const postXs = getPortalPostXsMm(portal).map(mm);
  const bayCount = postXs.length - 1;
  const endOverhang = Math.max(mm(PORTAL_MOUNTING.endOverhangX), support * 1.8);
  const kneeReach = 0.55;
  const kneeNodeDrop = (reach: number) => 0.55
    + (support / 2 + 0.014) * (0.55 - 0.014) / (reach - support / 2 - 0.014);

  for (const z of [frontRail, rearRail]) {
    const rail = profile(`portal_x_rail_${z}`, frameHeight, frameLength, depth);
    rail.rotation.z = -Math.PI / 2;
    rail.position.set(length / 2, railHeight + frameHeight / 2, z);
    root.add(rail);
    block(root, 'axis_x_linear_guide', [frameLength, 0.025, depth * 0.38], [length / 2, railTop + 0.0125, z], STEEL);
    block(root, 'axis_x_rack', [frameLength, 0.027, 0.018], [length / 2, railTop - 0.025, z + depth / 2], DARK);
    for (let i = 0; i <= bayCount; i++) {
      const endDirection = i === 0 ? 1 : i === bayCount ? -1 : 0;
      const x = postXs[i];
      const railX = x + endDirection * endOverhang;
      block(root, `portal_support_${i}_${z}`, [support, supportHeight, support], [x, supportHeight / 2, z], STEEL);
      block(root, 'portal_foot', [support * 1.9, 0.04, support * 1.9], [x, 0.02, z], DARK);
      if (endDirection !== 0) {
        // End posts stand beyond the rail, carrying it on a braced horizontal arm.
        const armLength = endOverhang + support;
        block(root, 'portal_end_arm', [armLength, armHeight, support],
          [x + endDirection * endOverhang / 2, railHeight - 0.02 - armHeight / 2, z], STEEL);
        block(root, 'portal_support_cap', [support * 1.3, 0.02, support * 1.25],
          [railX, railHeight - 0.01, z]);
        kneeBrace(root, [x, railHeight - 0.02 - armHeight, z], endDirection, support, endOverhang);
      } else {
        block(root, 'portal_support_cap', [support * 1.6, 0.02, support * 1.5], [x, railHeight - 0.01, z]);
        for (const direction of [-1, 1]) kneeBrace(root, [x, railHeight, z], direction, support, kneeReach);
      }
    }
  }
  // Cross ties meet the columns near the projected intersection of the knee braces.
  for (const x of [postXs[0], postXs[bayCount]]) {
    block(root, 'portal_end_tie', [support, support, span - support],
      [x, railHeight - 0.02 - armHeight - kneeNodeDrop(endOverhang), -width / 2], STEEL);
  }
  // Intermediate ties stay below the travelling bridge, as in the reference.
  for (let i = 1; i < bayCount; i++) {
    block(root, 'portal_cross_tie', [support, support, span - support],
      [postXs[i], railHeight - kneeNodeDrop(kneeReach), -width / 2], STEEL);
  }

  const beamHeight = mm(layout.robot.yBeamHeight);
  const beamWidth = mm(layout.robot.yBeamWidthX);
  const yHeight = railTop + beamHeight * 0.72;
  const xAssembly = new THREE.Group();
  xAssembly.name = 'Axis_X';
  root.add(xAssembly);
  const yBridge = new THREE.Group();
  yBridge.name = 'Y_bridge';
  xAssembly.add(yBridge);
  // Two profiles leave a real central passage for the rigid Z ram.
  const beamSide = Math.max(beamWidth * 0.42, columnWidth / 2 + 0.095);
  const yBeamLength = span + depth * 2;
  for (const x of [-beamSide, beamSide]) {
    const beam = profile('axis_y_extrusion', beamWidth * 0.3, yBeamLength, beamHeight);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(x, railTop + beamHeight / 2 + 0.035, -width / 2);
    yBridge.add(beam);
    block(yBridge, 'axis_y_linear_guide', [0.028, 0.023, yBeamLength],
      [x, railTop + beamHeight + 0.0465, -width / 2], STEEL);
  }
  for (const z of [frontRail, rearRail]) {
    block(yBridge, 'axis_x_bearing_shoe', [beamWidth * 1.9, 0.052, depth * 0.78], [0, railTop + 0.052, z], DARK);
    block(yBridge, 'axis_x_carriage_plate', [beamWidth * 2.05, 0.035, depth * 2.1], [0, railTop + 0.095, z]);
    block(yBridge, 'axis_y_end_bracket', [beamSide * 2 + beamWidth * 0.3, beamHeight, 0.026],
      [0, railTop + beamHeight / 2 + 0.035, z + (z === frontRail ? depth : -depth)], DARK);
  }
  servo(yBridge, 'axis_x_servo', [-beamSide - 0.06, railTop + 0.112, rearRail], 0.85);
  servo(yBridge, 'axis_y_servo', [beamSide, railTop + beamHeight + 0.06, frontRail + depth * 0.65], 0.75);

  const yCarriage = new THREE.Group();
  yCarriage.name = 'Axis_Y';
  yCarriage.position.y = yHeight;
  xAssembly.add(yCarriage);
  const plateY = railTop + beamHeight + 0.08 - yHeight;
  // Split saddle surrounds the ram instead of a solid plate through its centre.
  for (const x of [-beamSide, beamSide]) {
    block(yCarriage, 'axis_y_bearing_block', [0.1, 0.05, 0.3], [x, plateY - 0.032, 0], DARK);
    block(yCarriage, 'axis_y_saddle_side', [beamWidth * 0.33, 0.038, 0.4], [x, plateY, 0]);
    block(yCarriage, 'axis_z_guide_block', [0.045, 0.28, columnWidth * 0.85],
      [x > 0 ? columnWidth / 2 + 0.035 : -columnWidth / 2 - 0.035, plateY + 0.13, 0], DARK);
  }
  for (const z of [-0.19, 0.19]) {
    block(yCarriage, 'axis_y_saddle_end', [beamSide * 2, 0.038, 0.05], [0, plateY, z]);
  }
  servo(yCarriage, 'axis_z_servo', [-beamSide - 0.07, plateY + 0.02, 0], 0.82);
  brace(yCarriage, 'axis_z_drive_bracket', [-beamSide - 0.13, plateY, -0.14],
    [-columnWidth / 2 - 0.02, plateY + 0.28, -0.14], 0.035);

  const configuredBaseLength = mm(layout.robot.zBaseLength);
  // Retract the complete ram higher at home, including layouts saved with a 520 mm drop.
  const baseLength = Math.min(configuredBaseLength, 0.2);
  const zTravel = mm(getRobotTravelLimits(layout).z);
  // Measure the extrusion itself; the 120 mm lower attachment is outside that length.
  const mastLength = mm(layout.robot.zProfileLength ?? PORTAL_MEASUREMENTS.zProfileLength) + 0.12;
  const mastTop = mastLength - baseLength;
  const zRam = new THREE.Group();
  zRam.name = 'Axis_Z';
  yCarriage.add(zRam);
  const mast = profile('axis_z_column', columnWidth, mastLength - 0.12, columnWidth * 0.86);
  mast.position.y = (mastTop - baseLength) / 2 + 0.06;
  zRam.add(mast);
  for (const x of [-columnWidth * 0.31, columnWidth * 0.31]) {
    block(zRam, 'axis_z_linear_guide', [0.017, mastLength - 0.16, 0.012],
      [x, (mastTop - baseLength) / 2 + 0.06, columnWidth * 0.43 + 0.005], STEEL);
  }
  block(zRam, 'axis_z_belt_cover', [0.036, mastLength - 0.15, 0.008],
    [0, (mastTop - baseLength) / 2 + 0.06, columnWidth * 0.43 + 0.009], DARK);
  block(zRam, 'axis_z_top_cap', [columnWidth * 1.16, 0.04, columnWidth], [0, mastTop + 0.012, 0], DARK);
  block(zRam, 'axis_z_tool_flange', [columnWidth * 1.6, 0.055, columnWidth * 1.45], [0, -baseLength + 0.105, 0]);
  const gripperMount = new THREE.Group();
  gripperMount.name = 'gripper_mount';
  gripperMount.position.y = -baseLength;
  zRam.add(gripperMount);

  const xChain = createCableChain('cable_chain_x', length / 2, 0.16, 0.18, 0.065);
  const xTrayWidth = 0.22;
  const xTrayFloor = railTop - frameHeight * 0.58;
  const xTray = ladderTray('axis_x_chain_tray', frameLength, xTrayWidth, railTop - xTrayFloor, 1);
  xTray.position.set(length / 2, xTrayFloor, rearRail - depth / 2 - xTrayWidth / 2);
  root.add(xTray);
  // The chain rests just above the rungs. The tray's inner wall is flush with
  // the rail side, not suspended across a gap on a transverse paddle.
  xChain.root.position.set(length / 2, xTrayFloor + 0.006 + 0.18 * 0.12 + 0.004, xTray.position.z);
  root.add(xChain.root);
  block(root, 'axis_x_chain_fixed_terminal', [0.065, 0.032, 0.18],
    [length / 2 - 0.0325, xChain.root.position.y, xChain.root.position.z], DARK);
  const xChainUpper = xChain.root.position.y + xChain.radius * 2;
  const xBridgePlateTop = railTop + 0.1125;
  block(xAssembly, 'axis_x_chain_moving_bracket', [0.065, 0.024, rearRail - xChain.root.position.z + 0.11],
    [-0.0325, xChainUpper - 0.009, (rearRail + xChain.root.position.z) / 2], DARK);
  block(xAssembly, 'axis_x_chain_bracket_upright', [0.065, xChainUpper - xBridgePlateTop, 0.03],
    [-0.0325, (xChainUpper + xBridgePlateTop) / 2, rearRail], DARK);

  const yChain = createCableChain('cable_chain_y', width / 2, 0.105, 0.11, 0.044);
  yChain.root.rotation.y = Math.PI / 2;
  const yTrayWidth = 0.16;
  const yTray = ladderTray('axis_y_chain_tray', yBeamLength - 0.04, yTrayWidth, beamHeight * 0.7, -1);
  yTray.rotation.y = Math.PI / 2;
  yTray.position.set(beamSide + beamWidth * 0.15 + yTrayWidth / 2, railTop + 0.07, -width / 2);
  yBridge.add(yTray);
  yChain.root.position.set(yTray.position.x, yTray.position.y + 0.006 + 0.11 * 0.12 + 0.004, -width / 2);
  xAssembly.add(yChain.root);
  block(yCarriage, 'axis_y_chain_moving_bracket', [yChain.root.position.x - beamSide + 0.07, 0.025, 0.055],
    [(yChain.root.position.x + beamSide) / 2, yChain.root.position.y + yChain.radius * 2 - yHeight - 0.009, 0.0275], DARK);
  block(yBridge, 'axis_y_chain_fixed_terminal', [0.11, 0.025, 0.055],
    [yChain.root.position.x, yChain.root.position.y, -width / 2 + 0.0275], DARK);

  const zChainBase = plateY + 0.17;
  // The shortened mastTop controls chain length, its top bracket and the moving endpoint.
  const zChainTravel = Math.max(Math.abs(mastTop - zChainBase), Math.abs(mastTop - zChainBase - zTravel));
  const zChain = createCableChain('cable_chain_z', zChainTravel, 0.12, 0.095, 0.043);
  zChain.root.rotation.z = Math.PI / 2;
  zChain.root.position.set(columnWidth / 2 + 0.28, zChainBase, columnWidth * 0.43 + 0.08);
  yCarriage.add(zChain.root);
  block(yCarriage, 'axis_z_chain_fixed_bracket', [0.27, 0.035, 0.12],
    [columnWidth / 2 + 0.16, zChainBase, zChain.root.position.z], DARK);
  block(zRam, 'axis_z_chain_top_bracket', [0.07, 0.025, 0.17],
    [zChain.root.position.x - 0.24, mastTop, columnWidth * 0.43 + 0.025], DARK);

  const updateMechanics = (x: number, y: number, z: number) => {
    xAssembly.position.x = x;
    yCarriage.position.z = -y;
    zRam.position.y = -z;
    xChain.update(x - length / 2);
    yChain.update(y - width / 2);
    zChain.update(mastTop - zChainBase - z);
  };
  updateMechanics(0, 0, 0);
  return {
    root, xAssembly, yCarriage, zRam, gripperMount, mastLength, zHomeDrop: baseLength,
    chains: { x: xChain, y: yChain, z: zChain }, updateMechanics,
  };
}
