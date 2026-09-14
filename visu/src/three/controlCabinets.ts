import * as THREE from 'three';
import { getPortalPostXsMm, getPortalRailClearanceMm } from '../config/portalMeasurements';
import { DEFAULT_CONTROL_CABINETS, type ControlCabinetStates } from '../model/controlCabinets';
import type { CellLayout } from '../model/types';
import { logicalPosition, material, mm } from './primitives';
import { createCabinetScreen, updateCabinetScreen, type CabinetScreenRig } from './cabinetScreen';
import { createEmergencyStopButton, updateEmergencyStopButton, type EmergencyStopButtonRig } from './emergencyStopButton';
import { createIlluminatedPushButton, updateIlluminatedPushButton, type IlluminatedPushButtonRig } from './illuminatedPushButton';
import { createAirPreparation, type AirPreparationRig } from './airPreparation';
import { createEmergencyIndicator, updateEmergencyIndicator, type EmergencyIndicatorRig } from './emergencyIndicator';

type XYZ = [number, number, number];
type ControlButtonKey = 'startPressed' | 'stopPressed' | 'resetPressed';

export interface ControlCabinetsRig {
  root: THREE.Group;
  screen: CabinetScreenRig;
  frontEmergencyStop: EmergencyStopButtonRig;
  rearEmergencyStop: EmergencyStopButtonRig;
  electricalAlarm: EmergencyIndicatorRig;
  airPreparation: AirPreparationRig;
  buttons: { signal: ControlButtonKey; rig: IlluminatedPushButtonRig }[];
  textures: THREE.Texture[];
  elapsed: number;
  reducedMotion: MediaQueryList;
}

function block(parent: THREE.Object3D, name: string, size: XYZ, position: XYZ, surface: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Back at Z=0, mounting brackets attach to the column; the door faces local +Z. */
function createHousing(name: string, width: number, height: number, depth: number, support: number) {
  const root = new THREE.Group();
  root.name = name;
  const shell = material(0x78838b, { roughness: 0.5, metalness: 0.35 });
  const door = material(0xb7bfc4, { roughness: 0.48, metalness: 0.22 });
  const dark = material(0x262e34, { roughness: 0.55, metalness: 0.2 });
  const steel = material(0xa0acb5, { roughness: 0.34, metalness: 0.7 });
  const mountDepth = 0.040;
  const faceZ = mountDepth + depth + 0.014;
  for (const y of [-height * 0.32, height * 0.32]) {
    block(root, 'cabinet_mounting_bracket', [support + 0.08, 0.055, mountDepth], [0, y, mountDepth / 2], steel);
  }
  block(root, 'cabinet_steel_body', [width, height, depth], [0, 0, mountDepth + depth / 2], shell);
  block(root, 'cabinet_door_gasket', [width - 0.012, height - 0.012, 0.007], [0, 0, faceZ - 0.012], dark);
  block(root, 'cabinet_front_door', [width - 0.025, height - 0.025, 0.014], [0, 0, faceZ - 0.007], door);
  for (const y of [-height * 0.32, height * 0.32]) {
    block(root, 'cabinet_door_hinge', [0.018, 0.063, 0.024], [-width / 2 + 0.018, y, faceZ - 0.007], steel);
  }
  block(root, 'cabinet_door_lock', [0.018, 0.09, 0.014], [width / 2 - 0.029, 0, faceZ + 0.007], dark);
  for (let i = 0; i < 7; i++) {
    block(root, 'cabinet_side_vent', [0.002, 0.009, depth * 0.54],
      [width / 2 + 0.001, -height * 0.3 + i * 0.019, mountDepth + depth / 2], dark);
  }
  return { root, faceZ, dark, steel };
}

function createControlLabels(): { mesh: THREE.Mesh; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#aeb9c0';
  ctx.fillRect(0, 0, 768, 80);
  ctx.fillStyle = '#243743';
  ctx.textAlign = 'center';
  ctx.font = '600 22px "Segoe UI", sans-serif';
  const names = ['АВАРИЙНЫЙ', 'СТАРТ', 'СТОП', 'СБРОС'];
  [-0.22, -0.07, 0.075, 0.22].forEach((x, index) => ctx.fillText(names[index], (x / 0.6 + 0.5) * 768, 45));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.0625),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65 }));
  mesh.name = 'cabinet_control_labels';
  return { mesh, texture };
}

function addElectricalMark(parent: THREE.Group, z: number): EmergencyIndicatorRig {
  const root = new THREE.Group();
  root.name = 'rear_cabinet_phase_relay_warning';
  root.position.set(0, 0.1, z);
  root.scale.setScalar(2.5);
  parent.add(root);
  const triangle = new THREE.Shape();
  triangle.moveTo(0, 0.04);
  triangle.lineTo(-0.04, -0.03);
  triangle.lineTo(0.04, -0.03);
  triangle.closePath();
  const signSurface = material(0xd7b83b, { roughness: 0.3, metalness: 0.08 });
  const sign = new THREE.Mesh(new THREE.ShapeGeometry(triangle), signSurface);
  root.add(sign);
  const bolt = new THREE.Shape();
  bolt.moveTo(0.003, 0.027);
  bolt.lineTo(-0.014, 0);
  bolt.lineTo(-0.003, 0);
  bolt.lineTo(-0.008, -0.019);
  bolt.lineTo(0.017, 0.009);
  bolt.lineTo(0.004, 0.009);
  bolt.closePath();
  const symbol = new THREE.Mesh(new THREE.ShapeGeometry(bolt),
    new THREE.MeshBasicMaterial({ color: 0x29333a, toneMapped: false }));
  symbol.position.z = 0.001;
  root.add(symbol);
  return createEmergencyIndicator(root, [signSurface], 0.16, 0.16, 0.002);
}

export function createControlCabinets(layout: CellLayout): ControlCabinetsRig {
  const root = new THREE.Group();
  root.name = 'Cell_control_cabinets';
  const { portal } = layout;
  root.position.copy(logicalPosition(portal.position.x, portal.position.y, portal.position.z));
  const posts = getPortalPostXsMm(portal);
  const x = mm(posts[Math.min(3, posts.length - 1)]);
  const support = mm(portal.supportSize);
  const clearance = mm(getPortalRailClearanceMm(portal.frameDepthY, layout.robot.zColumnWidth));

  const front = createHousing('front_operator_cabinet_post_4', 0.64, 0.66, 0.26, support);
  front.root.position.set(x, 1.35, clearance + support / 2);
  root.add(front.root);
  block(front.root, 'operator_panel_steel_frame', [0.522, 0.324, 0.016], [0, 0.11, front.faceZ + 0.008], front.steel);
  block(front.root, 'operator_panel_black_bezel', [0.504, 0.306, 0.020], [0, 0.11, front.faceZ + 0.019], front.dark);
  const screen = createCabinetScreen(0.464, 0.261);
  screen.mesh.position.set(0, 0.11, front.faceZ + 0.030);
  front.root.add(screen.mesh);

  const frontEmergencyStop = createEmergencyStopButton();
  frontEmergencyStop.root.position.set(-0.22, -0.15, front.faceZ + 0.002);
  front.root.add(frontEmergencyStop.root);
  const buttons = [
    { signal: 'startPressed' as const, rig: createIlluminatedPushButton('green'), x: -0.07 },
    { signal: 'stopPressed' as const, rig: createIlluminatedPushButton('red'), x: 0.075 },
    { signal: 'resetPressed' as const, rig: createIlluminatedPushButton('yellow'), x: 0.22 },
  ];
  for (const button of buttons) {
    button.rig.root.name = `cabinet_${button.signal}`;
    button.rig.root.position.set(button.x, -0.15, front.faceZ + 0.002);
    front.root.add(button.rig.root);
  }
  const labels = createControlLabels();
  labels.mesh.position.set(0, -0.225, front.faceZ + 0.001);
  front.root.add(labels.mesh);
  // Keep the panel proportions while reducing the front cabinet width and height by 20%.
  front.root.scale.set(0.8, 0.8, 1);

  const rearHeight = 0.88;
  const rear = createHousing('rear_control_cabinet_post_4', 0.76, rearHeight, 0.32, support);
  rear.root.position.set(x, 1.30, -mm(portal.widthY) - clearance - support / 2);
  rear.root.rotation.y = Math.PI;
  // The rear cabinet is the compact enclosure shown in the reference view:
  // reduce its width and height by 30% while keeping depth and mounting point.
  rear.root.scale.set(0.7, 0.7, 1);
  root.add(rear.root);
  const rearEmergencyStop = createEmergencyStopButton();
  // One third of the door height measured from its bottom edge.
  rearEmergencyStop.root.position.set(0, -rearHeight / 2 + rearHeight / 3, rear.faceZ + 0.002);
  rear.root.add(rearEmergencyStop.root);
  const electricalAlarm = addElectricalMark(rear.root, rear.faceZ + 0.001);
  const airPreparation = createAirPreparation(support);
  airPreparation.root.position.copy(rear.root.position);
  // Place the 360 mm panel below the scaled cabinet with a 55 mm gap.
  airPreparation.root.position.y -= rearHeight * rear.root.scale.y / 2 + 0.055 + 0.18;
  airPreparation.root.rotation.y = Math.PI;
  root.add(airPreparation.root);

  return {
    root, screen, frontEmergencyStop, rearEmergencyStop, electricalAlarm, airPreparation, buttons,
    textures: [screen.texture, labels.texture], elapsed: 0,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
  };
}

export function updateControlCabinets(rig: ControlCabinetsRig, states: ControlCabinetStates | undefined, dt: number, inspecting = false): void {
  rig.elapsed += dt;
  const state = states ?? DEFAULT_CONTROL_CABINETS;
  const reducedMotion = rig.reducedMotion.matches;
  updateEmergencyStopButton(rig.frontEmergencyStop, state.front.emergencyStopPressed, rig.elapsed, reducedMotion);
  updateEmergencyStopButton(rig.rearEmergencyStop, state.rear.emergencyStopPressed, rig.elapsed, reducedMotion);
  updateEmergencyIndicator(rig.electricalAlarm,
    !inspecting && ((state.rear.phaseRelayFault ?? false) || (state.rear.safetyRelayFault ?? false)),
    rig.elapsed, reducedMotion);
  updateEmergencyIndicator(rig.airPreparation.alarm, !inspecting && (state.airPreparation?.lowPressure ?? false), rig.elapsed, reducedMotion);
  for (const { signal, rig: button } of rig.buttons) {
    const pressed = state.front[signal];
    updateIlluminatedPushButton(button, pressed, pressed);
  }
  updateCabinetScreen(rig.screen, rig.elapsed, reducedMotion);
}

/** The scene disposes geometry/materials; canvas textures have a separate lifetime. */
export function disposeControlCabinets(rig: ControlCabinetsRig): void {
  rig.textures.forEach((texture) => texture.dispose());
}
