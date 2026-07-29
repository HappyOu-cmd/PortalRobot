import * as THREE from 'three';
import { PART_GEOMETRY } from '../model/partGeometry';
import { getRobotTravelLimits } from '../model/travel';
import type { CellLayout, RobotState } from '../model/types';
import { box, COLORS, cylinder, damp, logicalPosition, mm } from './primitives';

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

function createBlankPayload(): THREE.Group {
  const root = new THREE.Group();
  const body = cylinder('blank_payload', PART_GEOMETRY.blank.radius, PART_GEOMETRY.blank.length, COLORS.blank, new THREE.Vector3());
  body.rotation.z = Math.PI / 2;
  root.add(body);
  return root;
}

function createDetailPayload(): THREE.Group {
  const root = new THREE.Group();
  const body = cylinder('detail_payload', PART_GEOMETRY.detail.bodyRadius, PART_GEOMETRY.detail.bodyLength, COLORS.detail, new THREE.Vector3());
  body.rotation.z = Math.PI / 2;
  const shoulder = cylinder('detail_shoulder', PART_GEOMETRY.detail.shoulderRadius, PART_GEOMETRY.detail.shoulderLength, 0x67c092, new THREE.Vector3(PART_GEOMETRY.detail.shoulderOffset, 0, 0));
  shoulder.rotation.z = Math.PI / 2;
  root.add(body, shoulder);
  return root;
}

function createDualGripper(): GripperRig {
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

  const blank = createBlankPayload();
  blank.scale.setScalar(1 / GRIPPER_SCALE);
  first.payloadMount.add(blank);
  const detail = createDetailPayload();
  detail.scale.setScalar(1 / GRIPPER_SCALE);
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
  const gripper = createDualGripper();
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
  layout: CellLayout,
  dt: number,
): void {
  const response = layout.animation.motionResponse;
  rig.current.x = damp(rig.current.x, state.x, response, dt);
  rig.current.y = damp(rig.current.y, state.y, response, dt);
  rig.current.z = damp(rig.current.z, state.z, response, dt);

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
  updateFingerPair(rig.gripper.fingers1, rig.gripper.grip1Value, PART_GEOMETRY.blank.radius / GRIPPER_SCALE + fingerHalfWidth);
  updateFingerPair(rig.gripper.fingers2, rig.gripper.grip2Value, PART_GEOMETRY.detail.bodyRadius / GRIPPER_SCALE + fingerHalfWidth);
  rig.gripper.blank.visible = state.gripper1Closed;
  rig.gripper.detail.visible = state.gripper2Closed;
}
