import * as THREE from 'three';
import { getRobotTravelLimits } from '../model/travel';
import type { CellLayout, GripperPayloadPoseLayout, PartGeometryLayout, RobotCoordinateFrame, RobotState, Vec3Mm } from '../model/types';
import { applyPartMaterial, box, COLORS, cylinder, damp, logicalPosition, mm } from './primitives';

interface GripperRig {
  pivot: THREE.Group;
  gripper1: THREE.Group;
  gripper2: THREE.Group;
  fingers1: [THREE.Mesh, THREE.Mesh];
  fingers2: [THREE.Mesh, THREE.Mesh];
  blank: THREE.Group;
  detail: THREE.Group;
  grip1Value: number;
  grip2Value: number;
}

const SWAP_AXIS = new THREE.Vector3(-1, -1, 0).normalize();
const GRIPPER_BLANK_ROTATION = new THREE.Quaternion();
const GRIPPER_DETAIL_ROTATION = new THREE.Quaternion().setFromAxisAngle(SWAP_AXIS, Math.PI);
const GRIPPER_SCALE = 0.68;

export interface PortalRig {
  root: THREE.Group;
  xAssembly: THREE.Group;
  yCarriage: THREE.Group;
  zExtension: THREE.Mesh;
  gripperMount: THREE.Group;
  gripper: GripperRig;
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

function makeGripperHead(name: string, color: number): {
  root: THREE.Group;
  fingers: [THREE.Mesh, THREE.Mesh];
  payloadMount: THREE.Group;
} {
  const root = new THREE.Group();
  root.name = name;
  const arm = cylinder(`${name}_arm`, 0.075, 0.32, color, new THREE.Vector3(0.16, 0, 0));
  arm.rotation.z = Math.PI / 2;
  root.add(arm);
  root.add(box(`${name}_jaw_body`, new THREE.Vector3(0.16, 0.18, 0.2), COLORS.graphite, new THREE.Vector3(0.34, 0, 0)));
  const fingerA = box(`${name}_finger_a`, new THREE.Vector3(0.16, 0.035, 0.045), COLORS.silver, new THREE.Vector3(0.46, 0.08, 0.06), { metalness: 0.35, roughness: 0.28 });
  const fingerB = fingerA.clone();
  fingerB.name = `${name}_finger_b`;
  fingerB.position.y = -0.08;
  root.add(fingerA, fingerB);
  const payloadMount = new THREE.Group();
  payloadMount.position.x = 0.57;
  root.add(payloadMount);
  return { root, fingers: [fingerA, fingerB], payloadMount };
}

function createBlankPayload(geometry: PartGeometryLayout): THREE.Group {
  const root = new THREE.Group();
  const body = cylinder('blank_payload', mm(geometry.blankDiameter) / 2, mm(geometry.blankLength), COLORS.blank, new THREE.Vector3());
  body.rotation.z = Math.PI / 2;
  root.add(body);
  return root;
}

function createDetailPayload(geometry: PartGeometryLayout): THREE.Group {
  const root = new THREE.Group();
  const body = cylinder('detail_payload', mm(geometry.detailBodyDiameter) / 2, mm(geometry.detailBodyLength), COLORS.detail, new THREE.Vector3());
  body.rotation.z = Math.PI / 2;
  const shoulder = cylinder('detail_shoulder', mm(geometry.detailShoulderDiameter) / 2, mm(geometry.detailShoulderLength), 0x67c092, new THREE.Vector3(mm(geometry.detailShoulderOffset), 0, 0));
  shoulder.rotation.z = Math.PI / 2;
  root.add(body, shoulder);
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
  poses: CellLayout['gripperPayloadPoses'],
): GripperRig {
  const pivot = new THREE.Group();
  pivot.name = 'dual_gripper';
  pivot.add(box('gripper_rotator', new THREE.Vector3(0.34, 0.18, 0.28), COLORS.graphite, new THREE.Vector3()));
  const hub = cylinder('gripper_hub', 0.12, 0.22, COLORS.steel, new THREE.Vector3(0, 0, 0));
  hub.rotation.x = Math.PI / 2;
  pivot.add(hub);

  const first = makeGripperHead('gripper_1', COLORS.blueDark);
  first.root.rotation.z = Math.PI;
  pivot.add(first.root);
  const second = makeGripperHead('gripper_2', 0x526573);
  second.root.rotation.z = -Math.PI / 2;
  pivot.add(second.root);

  const blank = createBlankPayload(geometry);
  blank.scale.setScalar(1 / GRIPPER_SCALE);
  applyPayloadPose(blank, poses.blank);
  first.payloadMount.add(blank);
  const detail = createDetailPayload(geometry);
  detail.scale.setScalar(1 / GRIPPER_SCALE);
  applyPayloadPose(detail, poses.detail);
  second.payloadMount.add(detail);

  pivot.scale.setScalar(GRIPPER_SCALE);

  return {
    pivot,
    gripper1: first.root,
    gripper2: second.root,
    fingers1: first.fingers,
    fingers2: second.fingers,
    blank,
    detail,
    grip1Value: 0,
    grip2Value: 0,
  };
}

export function createPortal(layout: CellLayout): PortalRig {
  const portal = layout.portal;
  const root = new THREE.Group();
  root.name = 'Portal';
  root.position.copy(logicalPosition(portal.position.x, portal.position.y, portal.position.z));

  const length = mm(portal.lengthX);
  const width = mm(portal.widthY);
  const railHeight = mm(portal.frameBottomZ);
  const frameHeight = mm(portal.frameThicknessZ);
  const frameDepth = mm(portal.frameDepthY);
  const support = mm(portal.supportSize);
  const supportXs = [0, length];
  const railStartX = supportXs[0];
  const railEndX = supportXs[1];
  const railLength = railEndX - railStartX;
  const railCenterX = (railStartX + railEndX) / 2;
  const railCenterY = railHeight + frameHeight / 2;
  root.add(box('portal_front_rail', new THREE.Vector3(railLength, frameHeight, frameDepth), COLORS.blueDark, new THREE.Vector3(railCenterX, railCenterY, 0)));
  root.add(box('portal_rear_rail', new THREE.Vector3(railLength, frameHeight, frameDepth), COLORS.blueDark, new THREE.Vector3(railCenterX, railCenterY, -width)));
  root.add(box('portal_start_bridge', new THREE.Vector3(frameDepth, frameHeight, width), COLORS.blue, new THREE.Vector3(railStartX, railCenterY, -width / 2)));
  root.add(box('portal_end_bridge', new THREE.Vector3(frameDepth, frameHeight, width), COLORS.blue, new THREE.Vector3(railEndX, railCenterY, -width / 2)));

  const supportZs = [0, -width];
  supportXs.forEach((x, xIndex) => {
    supportZs.forEach((z, zIndex) => {
      root.add(box(`portal_support_${xIndex}_${zIndex}`, new THREE.Vector3(support, railHeight, support), COLORS.silver, new THREE.Vector3(x, railHeight / 2, z)));
      root.add(box(`portal_foot_${xIndex}_${zIndex}`, new THREE.Vector3(support * 2.2, 0.07, support * 2.2), COLORS.graphite, new THREE.Vector3(x, 0.035, z)));
    });
  });

  const xAssembly = new THREE.Group();
  xAssembly.name = 'Axis_X';
  const beamHeight = mm(layout.robot.yBeamHeight);
  const beamWidth = mm(layout.robot.yBeamWidthX);
  const xTravelOrigin = railStartX;
  xAssembly.add(box('axis_y_beam', new THREE.Vector3(beamWidth, beamHeight, width + frameDepth * 1.5), COLORS.blue, new THREE.Vector3(0, railHeight + frameHeight + beamHeight / 2, -width / 2)));
  xAssembly.add(box('axis_x_front_carriage', new THREE.Vector3(beamWidth * 1.2, 0.16, 0.24), COLORS.graphite, new THREE.Vector3(0, railCenterY + 0.08, 0)));
  xAssembly.add(box('axis_x_rear_carriage', new THREE.Vector3(beamWidth * 1.2, 0.16, 0.24), COLORS.graphite, new THREE.Vector3(0, railCenterY + 0.08, -width)));
  root.add(xAssembly);

  const yCarriage = new THREE.Group();
  yCarriage.name = 'Axis_Y';
  yCarriage.position.y = railHeight + frameHeight + beamHeight * 0.72;
  yCarriage.add(box('axis_y_carriage', new THREE.Vector3(0.38, 0.32, 0.34), COLORS.graphite, new THREE.Vector3()));
  xAssembly.add(yCarriage);

  const zMount = new THREE.Group();
  zMount.name = 'Axis_Z';
  const baseLength = mm(layout.robot.zBaseLength);
  const columnWidth = mm(layout.robot.zColumnWidth);
  const zExtension = box('axis_z_column', new THREE.Vector3(columnWidth, baseLength, columnWidth), 0x394853, new THREE.Vector3(0, -baseLength / 2, 0), { metalness: 0.25, roughness: 0.36 });
  zMount.add(zExtension);
  yCarriage.add(zMount);

  const gripperMount = new THREE.Group();
  gripperMount.position.y = -baseLength;
  const gripper = createDualGripper(layout.partGeometry, layout.gripperPayloadPoses);
  gripperMount.add(gripper.pivot);
  zMount.add(gripperMount);

  return {
    root,
    xAssembly,
    yCarriage,
    zExtension,
    gripperMount,
    gripper,
    xTravelOrigin,
    current: { x: 0, y: 0, z: 0 },
    telemetry: {
      samples: [],
      lastSequence: 0,
      velocity: { x: 0, y: 0, z: 0 },
      initialized: false,
    },
  };
}

function updateFingerPair(fingers: [THREE.Mesh, THREE.Mesh], value: number, closedGap: number): void {
  const gap = THREE.MathUtils.lerp(0.09, closedGap, value);
  fingers[0].position.y = gap;
  fingers[1].position.y = -gap;
}

export function updatePortalRig(
  rig: PortalRig,
  state: RobotState,
  coordinateFrame: RobotCoordinateFrame,
  layout: CellLayout,
  dt: number,
): void {
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
  rig.xAssembly.position.x = rig.xTravelOrigin + mm(localX);
  rig.yCarriage.position.z = -mm(localY);

  const baseLength = mm(layout.robot.zBaseLength);
  const extensionLength = baseLength + mm(localZ);
  rig.zExtension.scale.y = extensionLength / baseLength;
  rig.zExtension.position.y = -extensionLength / 2;
  rig.gripperMount.position.y = -extensionLength;

  const mechanismResponse = layout.animation.mechanismResponse;
  const rotationTarget = state.rotatedToDetail && !state.rotatedToBlank
    ? GRIPPER_DETAIL_ROTATION
    : GRIPPER_BLANK_ROTATION;
  rig.gripper.pivot.quaternion.slerp(rotationTarget, 1 - Math.exp(-mechanismResponse * dt));

  rig.gripper.grip1Value = damp(rig.gripper.grip1Value, state.gripper1Closed ? 1 : 0, mechanismResponse, dt);
  rig.gripper.grip2Value = damp(rig.gripper.grip2Value, state.gripper2Closed ? 1 : 0, mechanismResponse, dt);
  const fingerHalfWidth = 0.0175;
  updateFingerPair(rig.gripper.fingers1, rig.gripper.grip1Value, (mm(layout.partGeometry.blankDiameter) / 2) / GRIPPER_SCALE + fingerHalfWidth);
  updateFingerPair(rig.gripper.fingers2, rig.gripper.grip2Value, (mm(layout.partGeometry.detailBodyDiameter) / 2) / GRIPPER_SCALE + fingerHalfWidth);
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
