import * as THREE from 'three';
import { getPortalPostXsMm, getPortalRailClearanceMm } from '../config/portalMeasurements';
import { DEFAULT_MPG_PENDANT, getMpgAxis, getMpgMultiplier, type MpgPendantState } from '../model/mpgPendant';
import type { CellLayout } from '../model/types';
import { addButtonCylinder } from './buttonParts';
import { createEmergencyStopButton, updateEmergencyStopButton, type EmergencyStopButtonRig } from './emergencyStopButton';
import { logicalPosition, material, mm } from './primitives';

const AXIS_ANGLES = { OFF: -110, X: -55, Y: 0, Z: 55 };
const MULTIPLIER_ANGLES = { x1: -50, x10: 0, x100: 50 };
const FACE_Z = 0.075;
const SELECTOR_Y = 0.023;

export interface MpgPendantRig {
  root: THREE.Group;
  emergencyStop: EmergencyStopButtonRig;
  axisSelector: THREE.Group;
  multiplierSelector: THREE.Group;
  multiplierTarget: number;
  textures: THREE.Texture[];
  elapsed: number;
  initialized: boolean;
  reducedMotion: MediaQueryList;
}

function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], surface: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedBody(width: number, height: number, depth: number, radius: number, surface: THREE.Material) {
  const x = -width / 2, y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2, steps: 1, curveSegments: 8,
  }), surface);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addRibs(parent: THREE.Group, radius: number, depth: number, z: number, count: number, surface: THREE.Material) {
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0011, 0.0015, depth), surface, count);
  const transform = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    transform.position.set(Math.sin(angle) * radius, Math.cos(angle) * radius, z);
    transform.rotation.z = -angle;
    transform.updateMatrix();
    ribs.setMatrixAt(i, transform.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  parent.add(ribs);
}

function createSelector(x: number, dark: THREE.Material, steel: THREE.Material) {
  const root = new THREE.Group();
  root.position.set(x, SELECTOR_Y, FACE_Z + 0.002);
  addButtonCylinder(root, 'selector_black_knob', 0.014, 0.022, 0.011, dark);
  addRibs(root, 0.014, 0.020, 0.011, 32, dark);
  addButtonCylinder(root, 'selector_metal_cap', 0.0125, 0.0015, 0.023, steel);
  // A long white index stays readable while the entire knob turns.
  box(root, [0.0028, 0.011, 0.001], [0, 0.007, 0.0245],
    new THREE.MeshBasicMaterial({ color: 0xf5f7f8, toneMapped: false }));
  return root;
}

function canvasDecal(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round(768 * height / width);
  const ctx = canvas.getContext('2d')!;
  // Draw in local metres, with positive Y pointing up like the geometry.
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(canvas.width / width, -canvas.height / height);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({
    map: texture, transparent: true, depthWrite: false, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  return { mesh, texture };
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 0.004) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.font = `600 ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Pendant faces +Z; the mounting point is on the front of the second structural post. */
export function createMpgPendant(layout: CellLayout, mountingHeight: number): MpgPendantRig {
  const root = new THREE.Group();
  root.name = 'MPG_pendant_front_post_2';
  const { portal } = layout;
  root.position.copy(logicalPosition(portal.position.x, portal.position.y, portal.position.z));
  root.position.x += mm(getPortalPostXsMm(portal)[1]);
  root.position.y += mountingHeight;
  root.position.z += mm(getPortalRailClearanceMm(portal.frameDepthY, layout.robot.zColumnWidth) + portal.supportSize / 2);

  const dark = material(0x20292c, { roughness: 0.68, metalness: 0.12 });
  const rubber = material(0x101719, { roughness: 0.85 });
  const steel = material(0xb7c1c5, { roughness: 0.34, metalness: 0.65 });
  const panel = material(0xc9cfd0, { roughness: 0.5, metalness: 0.25 });
  for (const y of [-0.095, 0.095]) box(root, [0.1, 0.024, 0.020], [0, y, 0.010], steel);
  const body = roundedBody(0.150, 0.310, 0.050, 0.022, dark);
  body.name = 'mpg_rubber_housing';
  body.position.z = 0.020;
  root.add(body);
  const plate = roundedBody(0.137, 0.164, 0.003, 0.011, panel);
  plate.position.set(0, 0.063, FACE_Z - 0.004);
  root.add(plate);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.055, 0.141, 0.042), new THREE.Vector3(-0.048, 0.176, 0.042),
    new THREE.Vector3(0, 0.181, 0.042), new THREE.Vector3(0.048, 0.176, 0.042),
    new THREE.Vector3(0.055, 0.141, 0.042),
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 32, 0.006, 8, false), dark));
  const sideButton = new THREE.Group();
  sideButton.position.set(-0.076, 0.057, 0.044);
  sideButton.rotation.y = -Math.PI / 2;
  addButtonCylinder(sideButton, 'mpg_side_enable_button', 0.013, 0.011, 0.0055, panel);
  root.add(sideButton);

  const emergencyStop = createEmergencyStopButton();
  emergencyStop.root.position.set(0, 0.106, FACE_Z);
  root.add(emergencyStop.root);
  const axisSelector = createSelector(-0.037, dark, steel);
  const multiplierSelector = createSelector(0.037, dark, steel);
  axisSelector.name = 'mpg_axis_selector';
  multiplierSelector.name = 'mpg_multiplier_selector';
  root.add(axisSelector, multiplierSelector);

  const legends = canvasDecal(0.137, 0.164, (ctx) => {
    ctx.fillStyle = '#17272d';
    ctx.strokeStyle = '#26383e';
    ctx.lineWidth = 0.00065;
    for (const [x, angles] of [[-0.037, AXIS_ANGLES], [0.037, MULTIPLIER_ANGLES]] as const) {
      for (const [text, degrees] of Object.entries(angles)) {
        const angle = THREE.MathUtils.degToRad(degrees);
        const sin = Math.sin(angle), cos = Math.cos(angle);
        const y = SELECTOR_Y - 0.063;
        ctx.beginPath();
        ctx.moveTo(x + sin * 0.017, y + cos * 0.017);
        ctx.lineTo(x + sin * 0.021, y + cos * 0.021);
        ctx.stroke();
        label(ctx, text, x + sin * 0.027, y + cos * 0.027, 0.0038);
      }
    }
    label(ctx, '−   ▼   +', 0, -0.074, 0.005);
  });
  legends.mesh.position.set(0, 0.063, FACE_Z + 0.0005);
  root.add(legends.mesh);
  for (const x of [-0.057, 0.057]) for (const y of [-0.008, 0.132]) {
    const screw = addButtonCylinder(root, 'mpg_panel_screw', 0.0025, 0.001, FACE_Z + 0.001, steel);
    screw.position.x = x;
    screw.position.y = y;
    box(root, [0.003, 0.0006, 0.0005], [x, y, FACE_Z + 0.0017], dark);
  }

  const wheel = new THREE.Group();
  wheel.name = 'mpg_handwheel';
  wheel.position.set(0, -0.087, FACE_Z - 0.003);
  root.add(wheel);
  addButtonCylinder(wheel, 'handwheel_black_seal', 0.062, 0.004, 0.002, rubber);
  addButtonCylinder(wheel, 'handwheel_scale_ring', 0.060, 0.005, 0.006, steel);
  const dial = canvasDecal(0.124, 0.124, (ctx) => {
    ctx.fillStyle = '#28383e';
    ctx.strokeStyle = '#28383e';
    for (let i = 0; i < 100; i++) {
      const angle = i / 100 * Math.PI * 2;
      const sin = Math.sin(angle), cos = Math.cos(angle);
      const inner = i % 10 === 0 ? 0.052 : i % 5 === 0 ? 0.054 : 0.056;
      ctx.lineWidth = i % 5 === 0 ? 0.00055 : 0.0003;
      ctx.beginPath();
      ctx.moveTo(sin * inner, cos * inner);
      ctx.lineTo(sin * 0.059, cos * 0.059);
      ctx.stroke();
      if (i % 10 === 0) label(ctx, String(i), sin * 0.0495, cos * 0.0495, 0.0034);
    }
  });
  dial.mesh.position.z = 0.009;
  wheel.add(dial.mesh);
  addButtonCylinder(wheel, 'handwheel_knurled_edge', 0.046, 0.014, 0.016, steel);
  addRibs(wheel, 0.046, 0.013, 0.016, 80, steel);
  addButtonCylinder(wheel, 'handwheel_metal_face', 0.0445, 0.002, 0.024, panel);
  const crank = new THREE.Group();
  crank.position.set(-0.028, 0.021, 0.025);
  addButtonCylinder(crank, 'handwheel_crank', 0.007, 0.026, 0.013, steel);
  addButtonCylinder(crank, 'handwheel_crank_screw', 0.003, 0.001, 0.027, dark);
  wheel.add(crank);

  const connector = new THREE.Group();
  connector.position.set(0, -0.154, 0.045);
  connector.rotation.x = Math.PI / 2;
  addButtonCylinder(connector, 'mpg_cable_gland', 0.010, 0.026, 0.013, dark);
  root.add(connector);
  const cablePoints = [new THREE.Vector3(0, -0.180, 0.045)];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120, angle = t * Math.PI * 2 * 9;
    const radius = Math.min(1, t * 12, (1 - t) * 12) * 0.010;
    cablePoints.push(new THREE.Vector3(Math.sin(angle) * radius, -0.186 - t * 0.22, 0.045 + Math.cos(angle) * radius));
  }
  cablePoints.push(new THREE.Vector3(0, -0.435, 0.020));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePoints), 180, 0.0025, 6, false), rubber));

  return {
    root, emergencyStop, axisSelector, multiplierSelector,
    multiplierTarget: -THREE.MathUtils.degToRad(MULTIPLIER_ANGLES.x1),
    textures: [legends.texture, dial.texture], elapsed: 0, initialized: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
  };
}

export function updateMpgPendant(rig: MpgPendantRig, state: MpgPendantState | undefined, dt: number): void {
  const feedback = state ?? DEFAULT_MPG_PENDANT;
  rig.elapsed += dt;
  updateEmergencyStopButton(rig.emergencyStop, feedback.emergencyStopPressed, rig.elapsed, rig.reducedMotion.matches);
  const axisTarget = -THREE.MathUtils.degToRad(AXIS_ANGLES[getMpgAxis(feedback)]);
  const multiplier = getMpgMultiplier(feedback);
  // This physical selector has no OFF detent: retain its position without valid feedback.
  if (multiplier) rig.multiplierTarget = -THREE.MathUtils.degToRad(MULTIPLIER_ANGLES[multiplier]);
  const blend = rig.reducedMotion.matches || !rig.initialized ? 1 : 1 - Math.exp(-dt * 18);
  rig.axisSelector.rotation.z = THREE.MathUtils.lerp(rig.axisSelector.rotation.z, axisTarget, blend);
  rig.multiplierSelector.rotation.z = THREE.MathUtils.lerp(rig.multiplierSelector.rotation.z, rig.multiplierTarget, blend);
  rig.initialized = true;
}

export function disposeMpgPendant(rig: MpgPendantRig): void {
  rig.textures.forEach((texture) => texture.dispose());
}
