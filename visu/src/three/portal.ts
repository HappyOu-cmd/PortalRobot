import * as THREE from 'three';
import { getRobotTravelLimits } from '../model/travel';
import type { CellLayout, GripperPayloadPoseLayout, PartGeometryLayout, RobotCoordinateFrame, RobotState, Vec3Mm } from '../model/types';
import {
  alarmPulse,
  applyPartMaterial,
  box,
  collectAlarmSurfaceMaterials,
  COLORS,
  cylinder,
  damp,
  mm,
  setAlarmSurfaceMaterials,
  type AlarmSurfaceMaterial,
} from './primitives';
import { createPortalMechanics } from './portalMechanics';
import { PORTAL_MEASUREMENTS } from '../config/portalMeasurements';

interface GripperRig {
  pivot: THREE.Group;
  gripper1: THREE.Group;
  gripper2: THREE.Group;
  fingers1: THREE.Group[];
  fingers2: THREE.Group[];
  jawCenter: THREE.Vector2;
  blank: THREE.Group;
  detail: THREE.Group;
  grip1Value: number;
  grip2Value: number;
}

const SWAP_AXIS = new THREE.Vector3(-1, -1, 0).normalize();
const GRIPPER_BLANK_ROTATION = new THREE.Quaternion();
const GRIPPER_DETAIL_ROTATION = new THREE.Quaternion().setFromAxisAngle(SWAP_AXIS, Math.PI);
const GRIPPER_1_ROTATION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
// The second head must already include the swap rotation. This makes both complete
// head poses (including finger depth) exchange exactly when the pivot turns 180°.
const GRIPPER_2_ROTATION = GRIPPER_DETAIL_ROTATION.clone().multiply(GRIPPER_1_ROTATION);
const GRIPPER_SCALE = 0.42;
const GRIPPER_FLANGE_RADIUS_FACTOR = 0.64;

export interface PortalRig extends ReturnType<typeof createPortalMechanics> {
  gripper: GripperRig;
  alarmSurfaceMaterials: AlarmSurfaceMaterial[];
  alarmElapsed: number;
  reducedMotion: boolean;
  xTravelOrigin: number;
  current: { x: number; y: number; z: number };
  telemetry: {
    samples: RobotCoordinateFrame[];
    lastSequence: number;
    velocity: Vec3Mm;
    initialized: boolean;
  };
}

const TELEMETRY_BUFFER_MS = 250;
const TELEMETRY_LONG_GAP_MS = 1_000;
const TELEMETRY_MAX_SAMPLES = 64;
const TELEMETRY_SMOOTH_TIME_S = 0.09;

function criticallyDampedAxis(
  current: number,
  target: number,
  velocity: number,
  dt: number,
): { value: number; velocity: number } {
  const deltaTime = Math.max(0, Math.min(dt, 0.05));
  if (deltaTime === 0) return { value: current, velocity };
  const omega = 2 / TELEMETRY_SMOOTH_TIME_S;
  const scaledTime = omega * deltaTime;
  const decay = 1 / (1 + scaledTime + 0.48 * scaledTime ** 2 + 0.235 * scaledTime ** 3);
  const difference = current - target;
  const temporary = (velocity + omega * difference) * deltaTime;
  let nextVelocity = (velocity - omega * temporary) * decay;
  let value = target + (difference + temporary) * decay;

  // При смене направления или остановке цель нельзя пересекать: это исключает
  // визуальный перелёт за последнюю восстановленную координату.
  if ((target - current > 0) === (value > target)) {
    value = target;
    nextVelocity = 0;
  }
  return { value, velocity: nextVelocity };
}

function smoothTelemetryTarget(rig: PortalRig, target: Vec3Mm, dt: number): Vec3Mm {
  const x = criticallyDampedAxis(rig.current.x, target.x, rig.telemetry.velocity.x, dt);
  const y = criticallyDampedAxis(rig.current.y, target.y, rig.telemetry.velocity.y, dt);
  const z = criticallyDampedAxis(rig.current.z, target.z, rig.telemetry.velocity.z, dt);
  rig.telemetry.velocity = { x: x.velocity, y: y.velocity, z: z.velocity };
  return { x: x.value, y: y.value, z: z.value };
}

function interpolateTelemetry(rig: PortalRig, frame: RobotCoordinateFrame): Vec3Mm {
  const now = Date.now();
  const telemetry = rig.telemetry;
  if (!telemetry.initialized) {
    telemetry.initialized = true;
    telemetry.lastSequence = frame.sequence;
    telemetry.samples = [{ ...frame, coordinates: { ...frame.coordinates } }];
    telemetry.velocity = { x: 0, y: 0, z: 0 };
    return frame.coordinates;
  }

  if (frame.sequence !== telemetry.lastSequence) {
    const latest = telemetry.samples.at(-1);
    const timestampMs = latest
      ? Math.max(latest.timestampMs + 1, frame.timestampMs)
      : frame.timestampMs;
    // Не растягиваем первое движение на весь период, пока робот стоял.
    if (latest && timestampMs - latest.timestampMs > TELEMETRY_LONG_GAP_MS) {
      telemetry.samples.push({
        sequence: latest.sequence,
        timestampMs: timestampMs - TELEMETRY_BUFFER_MS,
        sourceTimestampMs: frame.sourceTimestampMs - TELEMETRY_BUFFER_MS,
        coordinates: { x: rig.current.x, y: rig.current.y, z: rig.current.z },
      });
    }
    telemetry.lastSequence = frame.sequence;
    telemetry.samples.push({ ...frame, timestampMs, coordinates: { ...frame.coordinates } });
    while (telemetry.samples.length > TELEMETRY_MAX_SAMPLES) telemetry.samples.shift();
  }

  const playbackAt = now - TELEMETRY_BUFFER_MS;
  const samples = telemetry.samples;
  while (samples.length > 2 && samples[1].timestampMs <= playbackAt) samples.shift();
  if (samples.length === 1 || playbackAt <= samples[0].timestampMs) return samples[0].coordinates;

  const previous = samples[0];
  const next = samples[1];
  if (playbackAt >= next.timestampMs) return next.coordinates;

  const span = Math.max(1, next.timestampMs - previous.timestampMs);
  const alpha = THREE.MathUtils.clamp((playbackAt - previous.timestampMs) / span, 0, 1);
  return {
    x: THREE.MathUtils.lerp(previous.coordinates.x, next.coordinates.x, alpha),
    y: THREE.MathUtils.lerp(previous.coordinates.y, next.coordinates.y, alpha),
    z: THREE.MathUtils.lerp(previous.coordinates.z, next.coordinates.z, alpha),
  };
}

function makeGripperHead(name: string, jawCenter: THREE.Vector2): {
  root: THREE.Group;
  fingers: THREE.Group[];
  payloadMount: THREE.Group;
} {
  const root = new THREE.Group();
  root.name = name;
  // Convert the physical measurements to the pivot's local scale. The
  // measured body diameter made the two chuck cylinders visibly wider than
  // the gripper flange, so keep their radius aligned with the flange (the
  // same radius used by the hub and the front cap).
  const measuredBodyRadius = mm(PORTAL_MEASUREMENTS.gripperBodyRadius) / GRIPPER_SCALE;
  const bodyRadius = measuredBodyRadius * GRIPPER_FLANGE_RADIUS_FACTOR;
  const flangeRadius = bodyRadius;
  const bodyLength = mm(PORTAL_MEASUREMENTS.gripperBodyLength) / GRIPPER_SCALE;
  const bodyBack = 0.23;
  const bodyFront = bodyBack + bodyLength;
  const jawOffsetX = bodyFront - 0.35;
  const radialScale = bodyRadius / 0.14;
  const arm = cylinder(`${name}_arm`, 0.073, 0.17, COLORS.steel, new THREE.Vector3(0.13, jawCenter.x, jawCenter.y));
  arm.rotation.z = Math.PI / 2;
  root.add(arm);
  root.add(box(`${name}_back_plate`, new THREE.Vector3(0.04, bodyRadius * 2, bodyRadius * 2), COLORS.graphite,
    new THREE.Vector3(0.215, jawCenter.x, jawCenter.y)));
  for (const [x, radius, length, color] of [
    [bodyBack + bodyLength / 2, bodyRadius, bodyLength, COLORS.silver],
    [bodyFront + 0.015, bodyRadius, 0.03, COLORS.steel],
    [bodyFront + 0.037, flangeRadius, 0.016, COLORS.graphite],
  ]) {
    const body = cylinder(`${name}_chuck`, radius, length, color, new THREE.Vector3(x, jawCenter.x, jawCenter.y), 32);
    body.rotation.z = Math.PI / 2;
    root.add(body);
  }
  const fingers: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const track = box(`${name}_jaw_slide`, new THREE.Vector3(0.014, 0.125 * radialScale, 0.041), COLORS.graphite,
      new THREE.Vector3(bodyFront + 0.04, jawCenter.x + Math.cos(angle) * 0.077 * radialScale,
        jawCenter.y + Math.sin(angle) * 0.077 * radialScale));
    track.rotation.x = angle;
    root.add(track);
    const finger = new THREE.Group();
    finger.name = `${name}_jaw_${i + 1}`;
    finger.rotation.x = angle;
    finger.add(box(`${name}_jaw_slider`, new THREE.Vector3(0.05, 0.087, 0.04), COLORS.steel, new THREE.Vector3(0.421 + jawOffsetX, 0.02, 0)));
    finger.add(box(`${name}_jaw_finger`, new THREE.Vector3(0.17, 0.035, 0.038), COLORS.silver, new THREE.Vector3(0.51 + jawOffsetX, 0, 0), { metalness: 0.55, roughness: 0.32 }));
    finger.add(box(`${name}_jaw_contact`, new THREE.Vector3(0.065, 0.008, 0.04), COLORS.graphite, new THREE.Vector3(0.555 + jawOffsetX, -0.0195, 0)));
    root.add(finger);
    fingers.push(finger);
  }
  const payloadMount = new THREE.Group();
  payloadMount.position.x = 0.57 + jawOffsetX;
  root.add(payloadMount);
  return { root, fingers, payloadMount };
}

function createBlankPayload(geometry: PartGeometryLayout): THREE.Group {
  const root = new THREE.Group();
  const body = cylinder('blank_payload', mm(geometry.diameter) / 2, mm(geometry.length), COLORS.blank, new THREE.Vector3());
  body.rotation.z = Math.PI / 2;
  root.add(body);
  return root;
}

function createDetailPayload(geometry: PartGeometryLayout): THREE.Group {
  const root = new THREE.Group();
  const body = cylinder('detail_payload', mm(geometry.diameter) / 2, mm(geometry.length), COLORS.detail, new THREE.Vector3());
  body.rotation.z = Math.PI / 2;
  root.add(body);
  return root;
}

function applyPayloadPose(payload: THREE.Object3D, pose: GripperPayloadPoseLayout): void {
  payload.position.set(
    mm(pose.offset.x) / GRIPPER_SCALE,
    mm(pose.offset.y) / GRIPPER_SCALE,
    mm(pose.offset.z) / GRIPPER_SCALE,
  );
  payload.rotation.set(
    THREE.MathUtils.degToRad(pose.rotationDeg.x),
    THREE.MathUtils.degToRad(pose.rotationDeg.y),
    THREE.MathUtils.degToRad(pose.rotationDeg.z),
  );
}

function createDualGripper(
  geometry: PartGeometryLayout,
  pose: CellLayout['gripperPayloadPose'],
): GripperRig {
  const pivot = new THREE.Group();
  pivot.name = 'dual_gripper';
  pivot.add(box('gripper_angle_adapter', new THREE.Vector3(0.19, 0.19, 0.22), COLORS.silver, new THREE.Vector3(-0.035, -0.035, 0)));
  const hub = cylinder('gripper_hub', 0.13, 0.12, COLORS.steel, new THREE.Vector3());
  hub.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SWAP_AXIS);
  pivot.add(hub);

  const jawCenter = new THREE.Vector2(mm(pose.offset.y) / GRIPPER_SCALE, mm(pose.offset.z) / GRIPPER_SCALE);
  const first = makeGripperHead('gripper_1', jawCenter);
  first.root.quaternion.copy(GRIPPER_1_ROTATION);
  pivot.add(first.root);
  const second = makeGripperHead('gripper_2', jawCenter);
  second.root.quaternion.copy(GRIPPER_2_ROTATION);
  pivot.add(second.root);

  const blank = createBlankPayload(geometry);
  blank.scale.setScalar(1 / GRIPPER_SCALE);
  applyPayloadPose(blank, pose);
  first.payloadMount.add(blank);
  const detail = createDetailPayload(geometry);
  detail.scale.setScalar(1 / GRIPPER_SCALE);
  applyPayloadPose(detail, pose);
  second.payloadMount.add(detail);

  pivot.scale.setScalar(GRIPPER_SCALE);

  return {
    pivot,
    gripper1: first.root,
    gripper2: second.root,
    fingers1: first.fingers,
    fingers2: second.fingers,
    jawCenter,
    blank,
    detail,
    grip1Value: 0,
    grip2Value: 0,
  };
}

export function createPortal(layout: CellLayout): PortalRig {
  const mechanics = createPortalMechanics(layout);
  const gripper = createDualGripper(layout.partGeometry, layout.gripperPayloadPose);
  const alarmSurfaceMaterials: AlarmSurfaceMaterial[] = [];
  mechanics.root.traverse((object) => {
    if (object instanceof THREE.Group && object.name.startsWith('portal_x_rail_')) {
      alarmSurfaceMaterials.push(...collectAlarmSurfaceMaterials(object));
    }
  });
  mechanics.gripperMount.add(gripper.pivot);
  // Stationary pneumatic actuator and adapter stay attached to the ram. Only
  // the diagonal output hub and both complete chuck heads rotate during a swap.
  const fixedHousing = new THREE.Group();
  fixedHousing.name = 'gripper_fixed_housing';
  fixedHousing.scale.setScalar(GRIPPER_SCALE / 0.68);
  mechanics.gripperMount.add(fixedHousing);
  fixedHousing.add(box('gripper_transition_plate', new THREE.Vector3(0.19, 0.04, 0.17),
    COLORS.silver, new THREE.Vector3(0, 0.105, 0)));
  const actuator = cylinder('gripper_rotary_actuator', 0.089, 0.09, COLORS.steel,
    new THREE.Vector3(0.06, 0.06, 0), 32);
  actuator.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SWAP_AXIS);
  fixedHousing.add(actuator);
  fixedHousing.add(box('gripper_pneumatic_block', new THREE.Vector3(0.115, 0.048, 0.06),
    COLORS.silver, new THREE.Vector3(0, 0.148, 0.05)));
  for (const x of [-0.04, 0.04]) {
    fixedHousing.add(cylinder('gripper_air_port', 0.011, 0.026, 0x176da0,
      new THREE.Vector3(x, 0.18, 0.05), 12));
  }
  return {
    ...mechanics,
    gripper,
    alarmSurfaceMaterials,
    alarmElapsed: 0,
    reducedMotion: typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    xTravelOrigin: 0,
    current: { x: 0, y: 0, z: 0 },
    telemetry: {
      samples: [], lastSequence: 0,
      velocity: { x: 0, y: 0, z: 0 }, initialized: false,
    },
  };
}

function updateRadialJaws(fingers: THREE.Group[], value: number, closedGap: number, center: THREE.Vector2): void {
  // Even a large configured part must open outwards, never close in reverse.
  const gap = THREE.MathUtils.lerp(Math.max(0.095, closedGap + 0.045), closedGap, value);
  fingers.forEach((finger, index) => {
    const angle = index * Math.PI * 2 / fingers.length;
    finger.position.set(0, center.x + Math.cos(angle) * gap, center.y + Math.sin(angle) * gap);
  });
}
export function updatePortalRig(
  rig: PortalRig,
  state: RobotState,
  coordinateFrame: RobotCoordinateFrame,
  layout: CellLayout,
  dt: number,
  alarmTargetActive = false,
  inspecting = false,
): void {
  const alarm = alarmTargetActive || state.error;
  if (alarm) rig.alarmElapsed += dt;
  else rig.alarmElapsed = 0;
  setAlarmSurfaceMaterials(
    rig.alarmSurfaceMaterials,
    alarm && !inspecting,
    alarmPulse(rig.alarmElapsed, rig.reducedMotion),
    rig.alarmElapsed,
    rig.reducedMotion,
  );
  const interpolated = interpolateTelemetry(rig, coordinateFrame);
  const smoothed = smoothTelemetryTarget(rig, interpolated, dt);
  rig.current.x = smoothed.x;
  rig.current.y = smoothed.y;
  rig.current.z = smoothed.z;

  const coordinate = layout.coordinate;
  const travelLimits = getRobotTravelLimits(layout);
  const localX = THREE.MathUtils.clamp(
    coordinate.origin.x + coordinate.direction.x * rig.current.x,
    0,
    travelLimits.x,
  );
  const localY = coordinate.origin.y + coordinate.direction.y * rig.current.y;
  const localZ = Math.max(0, coordinate.origin.z + coordinate.direction.z * rig.current.z);
  rig.updateMechanics(rig.xTravelOrigin + mm(localX), mm(localY), mm(localZ));

  const mechanismResponse = layout.animation.mechanismResponse;
  const rotationTarget = state.rotatedToDetail && !state.rotatedToBlank
    ? GRIPPER_DETAIL_ROTATION
    : GRIPPER_BLANK_ROTATION;
  rig.gripper.pivot.quaternion.slerp(rotationTarget, 1 - Math.exp(-mechanismResponse * dt));

  rig.gripper.grip1Value = damp(rig.gripper.grip1Value, state.gripper1Closed ? 1 : 0, mechanismResponse, dt);
  rig.gripper.grip2Value = damp(rig.gripper.grip2Value, state.gripper2Closed ? 1 : 0, mechanismResponse, dt);
  const fingerHalfWidth = 0.0235;
  const closedGap = (mm(layout.partGeometry.diameter) / 2) / GRIPPER_SCALE + fingerHalfWidth;
  updateRadialJaws(rig.gripper.fingers1, rig.gripper.grip1Value, closedGap, rig.gripper.jawCenter);
  updateRadialJaws(rig.gripper.fingers2, rig.gripper.grip2Value, closedGap, rig.gripper.jawCenter);
  rig.gripper.blank.visible = state.gripper1Closed;
  rig.gripper.detail.visible = state.gripper2Closed;
  const blankMaterials = state.blankProductType >= 1 && state.blankProductType <= 3
    ? layout.productPartMaterials[state.blankProductType - 1]
    : layout.productPartMaterials[0];
  const detailMaterials = state.detailProductType >= 1 && state.detailProductType <= 3
    ? layout.productPartMaterials[state.detailProductType - 1]
    : layout.productPartMaterials[0];
  applyPartMaterial(rig.gripper.blank, blankMaterials.blank);
  applyPartMaterial(rig.gripper.detail, detailMaterials.detail);
}
