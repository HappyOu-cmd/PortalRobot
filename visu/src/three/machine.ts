import * as THREE from 'three';
import { PART_GEOMETRY } from '../model/partGeometry';
import type { CellLayout, MachineState } from '../model/types';
import { box, COLORS, cylinder, damp, logicalPosition, material, mm } from './primitives';

export interface MachineRig {
  root: THREE.Group;
  door: THREE.Group;
  doorOpenX: number;
  doorClosedX: number;
  doorValue: number;
  jaws: THREE.Mesh[];
  jawDirections: THREE.Vector2[];
  chuckValue: number;
  part: THREE.Group;
  stackLight: THREE.Mesh;
  modePanel: THREE.Mesh;
  selection: THREE.LineSegments;
}

function markClickable(root: THREE.Object3D, machineIndex: number): void {
  root.traverse((object) => {
    object.userData.machineIndex = machineIndex;
  });
}

function createChuck(machineWidth: number, machineDepth: number, machineHeight: number) {
  const root = new THREE.Group();
  const centerX = machineWidth * 0.27;
  const centerY = machineHeight * 0.56;
  const centerZ = -machineDepth * 0.24;
  root.position.set(centerX, centerY, centerZ);

  root.add(box('spindle_housing', new THREE.Vector3(machineWidth * 0.1, machineHeight * 0.16, machineHeight * 0.16), 0x8797a3, new THREE.Vector3(-machineWidth * 0.035, 0, 0), { metalness: 0.24, roughness: 0.36 }));

  const spindle = cylinder('spindle', machineHeight * 0.09, machineWidth * 0.08, COLORS.steel, new THREE.Vector3());
  spindle.rotation.z = Math.PI / 2;
  root.add(spindle);

  const plate = cylinder(
    'chuck_plate',
    machineHeight * 0.105,
    machineWidth * 0.035,
    COLORS.graphite,
    new THREE.Vector3(machineWidth * 0.055, 0, 0),
  );
  plate.rotation.z = Math.PI / 2;
  root.add(plate);

  const jaws: THREE.Mesh[] = [];
  const jawDirections: THREE.Vector2[] = [];
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2;
    const jaw = box(
      `chuck_jaw_${index + 1}`,
      new THREE.Vector3(machineWidth * 0.045, 0.04, 0.04),
      COLORS.silver,
      new THREE.Vector3(machineWidth * 0.085, 0, 0),
      { metalness: 0.35, roughness: 0.3 },
    );
    jaw.rotation.x = angle;
    root.add(jaw);
    jaws.push(jaw);
    jawDirections.push(new THREE.Vector2(Math.cos(angle), Math.sin(angle)));
  }

  const part = new THREE.Group();
  const partBody = cylinder('chuck_part', PART_GEOMETRY.detail.bodyRadius, PART_GEOMETRY.detail.bodyLength, COLORS.detail, new THREE.Vector3());
  partBody.rotation.z = Math.PI / 2;
  part.add(partBody);
  const shoulder = cylinder(
    'chuck_part_shoulder',
    PART_GEOMETRY.detail.shoulderRadius,
    PART_GEOMETRY.detail.shoulderLength,
    0x6cc194,
    new THREE.Vector3(PART_GEOMETRY.detail.shoulderOffset, 0, 0),
  );
  shoulder.rotation.z = Math.PI / 2;
  part.add(shoulder);
  part.position.x = machineWidth * 0.11;
  root.add(part);

  return { root, jaws, jawDirections, part };
}

export function createMachine(layout: CellLayout, index: number): MachineRig {
  const { sizeX, sizeY, sizeZ, doorTravel, machines } = layout.machine;
  const width = mm(sizeX);
  const depth = mm(sizeY);
  const height = mm(sizeZ);
  const root = new THREE.Group();
  root.name = `CNC_${index + 1}`;
  root.position.copy(logicalPosition(machines[index].position.x, machines[index].position.y, machines[index].position.z));

  const baseHeight = height * 0.24;
  const frontZ = 0.02;
  root.add(box('base', new THREE.Vector3(width, baseHeight, depth), COLORS.charcoal, new THREE.Vector3(width / 2, baseHeight / 2, -depth / 2)));
  root.add(box('rear_body', new THREE.Vector3(width * 0.96, height - baseHeight, depth * 0.18), COLORS.graphite, new THREE.Vector3(width / 2, baseHeight + (height - baseHeight) / 2, -depth * 0.91)));

  const leftWidth = width * 0.27;
  const rightWidth = width * 0.23;
  const openingWidth = width - leftWidth - rightWidth;
  const bodyY = baseHeight + (height - baseHeight) / 2;
  root.add(box('left_cabinet', new THREE.Vector3(leftWidth, height - baseHeight, depth * 0.82), COLORS.white, new THREE.Vector3(leftWidth / 2, bodyY, -depth * 0.42)));
  root.add(box('right_cabinet', new THREE.Vector3(rightWidth, height - baseHeight, depth * 0.82), COLORS.silver, new THREE.Vector3(width - rightWidth / 2, bodyY, -depth * 0.42)));

  const openingCenterX = leftWidth + openingWidth / 2;
  const chamberY = baseHeight + (height - baseHeight) * 0.45;
  root.add(box('chamber_rear', new THREE.Vector3(openingWidth, height * 0.49, 0.05), 0x9aa9b2, new THREE.Vector3(openingCenterX, chamberY, -depth * 0.76)));
  root.add(box('chamber_floor', new THREE.Vector3(openingWidth, 0.07, depth * 0.62), 0x65727b, new THREE.Vector3(openingCenterX, baseHeight + 0.07, -depth * 0.42)));
  root.add(box('opening_top', new THREE.Vector3(openingWidth, height * 0.12, depth * 0.1), COLORS.silver, new THREE.Vector3(openingCenterX, height - height * 0.07, -depth * 0.05)));

  const door = new THREE.Group();
  door.name = 'sliding_door';
  const doorWidth = openingWidth + 0.04;
  const doorHeight = height * 0.65;
  door.add(box('door_panel', new THREE.Vector3(doorWidth, doorHeight, 0.075), COLORS.silver, new THREE.Vector3(0, 0, 0), { metalness: 0.12, roughness: 0.43 }));
  door.add(box('door_window_frame', new THREE.Vector3(doorWidth * 0.58, doorHeight * 0.58, 0.09), COLORS.graphite, new THREE.Vector3(0, 0.04, 0.02)));
  door.add(box('door_window', new THREE.Vector3(doorWidth * 0.46, doorHeight * 0.46, 0.1), COLORS.glass, new THREE.Vector3(0, 0.04, 0.035), { transparent: true, opacity: 0.78, roughness: 0.18 }));
  const handle = cylinder('door_handle', 0.018, doorHeight * 0.32, COLORS.silver, new THREE.Vector3(doorWidth * 0.39, -0.02, 0.08), 14);
  door.add(handle);
  door.position.y = baseHeight + doorHeight / 2;
  door.position.z = frontZ;
  const doorClosedX = openingCenterX;
  const doorOpenX = doorClosedX - mm(doorTravel);
  door.position.x = doorClosedX;
  root.add(door);

  const operatorPanel = box('operator_panel', new THREE.Vector3(rightWidth * 0.7, height * 0.55, 0.1), COLORS.graphite, new THREE.Vector3(width - rightWidth * 0.54, height * 0.58, 0.08));
  root.add(operatorPanel);
  root.add(box('operator_screen', new THREE.Vector3(rightWidth * 0.46, height * 0.16, 0.115), 0x174e78, new THREE.Vector3(width - rightWidth * 0.54, height * 0.72, 0.1), { emissive: 0x0b3557, emissiveIntensity: 0.4 }));
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      root.add(box(`panel_key_${row}_${column}`, new THREE.Vector3(0.027, 0.027, 0.02), 0x9ba8b1, new THREE.Vector3(width - rightWidth * 0.71 + column * 0.045, height * 0.57 - row * 0.045, 0.145)));
    }
  }

  const chuck = createChuck(width, depth, height);
  root.add(chuck.root);

  const stackLight = cylinder('stack_light', 0.035, 0.17, COLORS.green, new THREE.Vector3(width * 0.91, height + 0.085, -depth * 0.12), 18);
  (stackLight.material as THREE.MeshStandardMaterial).emissive.setHex(COLORS.green);
  (stackLight.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45;
  root.add(stackLight);

  const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.08, height + 0.08, depth + 0.08));
  const selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: COLORS.blue }));
  selection.position.set(width / 2, height / 2, -depth / 2);
  selection.visible = false;
  root.add(selection);

  const modePanel = root.getObjectByName('right_cabinet') as THREE.Mesh;
  markClickable(root, index);
  return {
    root,
    door,
    doorOpenX,
    doorClosedX,
    doorValue: 0,
    jaws: chuck.jaws,
    jawDirections: chuck.jawDirections,
    chuckValue: 1,
    part: chuck.part,
    stackLight,
    modePanel,
    selection,
  };
}

export function updateMachineRig(rig: MachineRig, state: MachineState, dt: number, response: number): void {
  let doorTarget = rig.doorValue;
  if (state.doorOpen && !state.doorClosed) doorTarget = 1;
  if (state.doorClosed && !state.doorOpen) doorTarget = 0;
  rig.doorValue = damp(rig.doorValue, doorTarget, response, dt);
  rig.door.position.x = THREE.MathUtils.lerp(rig.doorClosedX, rig.doorOpenX, rig.doorValue);

  let chuckTarget = rig.chuckValue;
  if (state.chuckClosed && !state.chuckOpen) chuckTarget = 1;
  if (state.chuckOpen && !state.chuckClosed) chuckTarget = 0;
  rig.chuckValue = damp(rig.chuckValue, chuckTarget, response, dt);
  const radius = THREE.MathUtils.lerp(0.09, PART_GEOMETRY.detail.bodyRadius + 0.02, rig.chuckValue);
  rig.jaws.forEach((jaw, index) => {
    const direction = rig.jawDirections[index];
    jaw.position.y = direction.x * radius;
    jaw.position.z = direction.y * radius;
  });
  rig.part.visible = state.partPresent;

  const modeColor = {
    off: 0x8d99a3,
    enabled: 0xe57e22,
    processing: COLORS.green,
    change: 0xe2b323,
    error: COLORS.red,
  }[state.mode];
  const lightMaterial = rig.stackLight.material as THREE.MeshStandardMaterial;
  lightMaterial.color.setHex(modeColor);
  lightMaterial.emissive.setHex(modeColor);
  (rig.modePanel.material as THREE.MeshStandardMaterial).color.lerp(new THREE.Color(state.mode === 'error' ? 0x8c6970 : COLORS.silver), 1 - Math.exp(-4 * dt));
}
