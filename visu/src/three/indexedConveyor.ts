import * as THREE from 'three';
import type {
  IndexedConveyorLayout,
  IndexedConveyorTestCommand,
  IndexedConveyorTestStatus,
  MagazineData,
  PartGeometryLayout,
  ProductPartMaterials,
  ProductType,
  SlotType,
} from '../model/types';
import { box, COLORS, disposeObject, logicalPosition, material, mm } from './primitives';

interface RowPose {
  position: THREE.Vector3;
  rotationX: number;
}

type ProductMeshes = [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];

export interface IndexedConveyorRig {
  root: THREE.Group;
  slats: THREE.InstancedMesh;
  slots: THREE.InstancedMesh;
  productMeshes: { blank: ProductMeshes; detailBody: ProductMeshes; detailShoulder: ProductMeshes };
  lowerTreads: THREE.InstancedMesh;
  fallingParts: FallingPart[];
  columns: number;
  rowCount: number;
  zone1Rows: number;
  pitchX: number;
  rowPitch: number;
  slotRadius: number;
  blankRadius: number;
  blankHeight: number;
  detailBodyRadius: number;
  detailBodyHeight: number;
  detailShoulderRadius: number;
  detailShoulderHeight: number;
  detailBodyCenterFromBase: number;
  detailShoulderCenterFromBase: number;
  detailHeight: number;
  productPartMaterials: [ProductPartMaterials, ProductPartMaterials, ProductPartMaterials];
  slatThickness: number;
  straightLength: number;
  rollerRadius: number;
  rollerCenterY: number;
  workingHeight: number;
  lowerBeltStartZ: number;
  lowerBeltEndZ: number;
  lowerBeltHeight: number;
  lowerBeltSpeed: number;
  lowerBeltOffset: number;
  binCenterZ: number;
  binWidth: number;
  binLength: number;
  binBottomY: number;
  binTopY: number;
  binParts: THREE.Group[];
  binPartCount: number;
  pathLength: number;
  currentOffset: number;
  targetOffset: number;
  lastCommandId: number;
  slotStates: SlotType[];
  slotProductTypes: ProductType[];
  liveIndexing: boolean;
}

interface FallingPart {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  age: number;
  phase: 'drop-to-lower' | 'on-lower' | 'drop-to-bin';
  halfHeight: number;
  radius: number;
  angularVelocity: THREE.Vector3;
  landingPosition: THREE.Vector3 | null;
}

interface BinBounds {
  bottomY: number;
  topY: number;
}

const MAX_BIN_VISUAL_PARTS = 240;

const CONVEYOR_COLORS = {
  slat: 0xc5ad32,
  slot: 0x3b3829,
  frame: 0x596772,
  frameDark: 0x27323a,
  lowerBelt: 0x1769d2,
  lowerBeltDark: 0x0f4f9a,
  bin: 0x1769c2,
  wheel: 0xd53636,
};

function rowMatrix(pose: RowPose): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    pose.position,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.rotationX),
    new THREE.Vector3(1, 1, 1),
  );
}

function createSlatInstances(name: string, count: number, width: number, depth: number, thickness: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width, thickness, depth),
    material(CONVEYOR_COLORS.slat, { metalness: 0.34, roughness: 0.38 }),
    count,
  );
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSlotInstances(
  name: string,
  count: number,
  columns: number,
  slotRadius: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.TorusGeometry(slotRadius, Math.max(0.003, slotRadius * 0.12), 8, 18),
    material(CONVEYOR_COLORS.slot, { metalness: 0.18, roughness: 0.5 }),
    count * columns,
  );
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createProductInstances(
  name: string,
  count: number,
  radius: number,
  height: number,
  appearance: ProductPartMaterials['blank'],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(radius, radius, height, 16),
    material(appearance.color, {
      metalness: 0.18,
      roughness: 0.4,
      opacity: appearance.opacity,
      transparent: appearance.opacity < 1,
      depthWrite: appearance.opacity >= 0.98,
    }),
    count,
  );
  mesh.name = name;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function samplePose(rig: IndexedConveyorRig, pathDistance: number): RowPose {
  const distance = modulo(pathDistance, rig.pathLength);
  const dischargeArcStart = rig.straightLength;
  const bottomStart = dischargeArcStart + Math.PI * rig.rollerRadius;
  const inletArcStart = bottomStart + rig.straightLength;

  if (distance < dischargeArcStart) {
    return { position: new THREE.Vector3(0, rig.workingHeight, -distance), rotationX: 0 };
  }
  if (distance < bottomStart) {
    const angle = (distance - dischargeArcStart) / rig.rollerRadius;
    return {
      position: new THREE.Vector3(
        0,
        rig.rollerCenterY + rig.rollerRadius * Math.cos(angle),
        -rig.straightLength - rig.rollerRadius * Math.sin(angle),
      ),
      rotationX: -angle,
    };
  }
  if (distance < inletArcStart) {
    const returnDistance = distance - bottomStart;
    return {
      position: new THREE.Vector3(0, rig.rollerCenterY - rig.rollerRadius, -rig.straightLength + returnDistance),
      rotationX: Math.PI,
    };
  }
  const angle = (distance - inletArcStart) / rig.rollerRadius;
  return {
    position: new THREE.Vector3(
      0,
      rig.rollerCenterY - rig.rollerRadius * Math.cos(angle),
      rig.rollerRadius * Math.sin(angle),
    ),
    rotationX: Math.PI - angle,
  };
}

function updateInstanceMatrices(rig: IndexedConveyorRig): void {
  const ringRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const firstX = -((rig.columns - 1) * rig.pitchX) / 2;
  const blankCounts = [0, 0, 0];
  const detailCounts = [0, 0, 0];

  for (let row = 0; row < rig.rowCount; row += 1) {
    const pose = samplePose(rig, (row + 0.5) * rig.rowPitch + rig.currentOffset);
    const parentMatrix = rowMatrix(pose);
    rig.slats.setMatrixAt(row, parentMatrix);
    for (let column = 0; column < rig.columns; column += 1) {
      const x = firstX + column * rig.pitchX;
      const slotIndex = row * rig.columns + column;
      const ringMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x, rig.slatThickness / 2 + 0.003, 0),
        ringRotation,
        new THREE.Vector3(1, 1, 1),
      );
      rig.slots.setMatrixAt(slotIndex, parentMatrix.clone().multiply(ringMatrix));

      const state = rig.slotStates[slotIndex];
      const productType = rig.slotProductTypes[slotIndex] ?? 1;
      const typeIndex = productType - 1;
      if (state === 'blank') {
        const blankMatrix = new THREE.Matrix4().makeTranslation(x, rig.slatThickness / 2 + rig.blankHeight / 2 + 0.006, 0);
        rig.productMeshes.blank[typeIndex].setMatrixAt(blankCounts[typeIndex], parentMatrix.clone().multiply(blankMatrix));
        blankCounts[typeIndex] += 1;
      } else if (state === 'detail') {
        const detailBase = rig.slatThickness / 2 + 0.006;
        const bodyMatrix = new THREE.Matrix4().makeTranslation(
          x,
          detailBase + rig.detailBodyCenterFromBase,
          0,
        );
        const shoulderMatrix = new THREE.Matrix4().makeTranslation(
          x,
          detailBase + rig.detailShoulderCenterFromBase,
          0,
        );
        rig.productMeshes.detailBody[typeIndex].setMatrixAt(
          detailCounts[typeIndex],
          parentMatrix.clone().multiply(bodyMatrix),
        );
        rig.productMeshes.detailShoulder[typeIndex].setMatrixAt(
          detailCounts[typeIndex],
          parentMatrix.clone().multiply(shoulderMatrix),
        );
        detailCounts[typeIndex] += 1;
      }
    }
  }
  rig.productMeshes.blank.forEach((mesh, index) => { mesh.count = blankCounts[index]; });
  rig.productMeshes.detailBody.forEach((mesh, index) => { mesh.count = detailCounts[index]; });
  rig.productMeshes.detailShoulder.forEach((mesh, index) => { mesh.count = detailCounts[index]; });
  [
    rig.slats,
    rig.slots,
    ...rig.productMeshes.blank,
    ...rig.productMeshes.detailBody,
    ...rig.productMeshes.detailShoulder,
  ]
    .forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
}

function clearFallingParts(rig: IndexedConveyorRig): void {
  rig.fallingParts.forEach(({ mesh }) => {
    rig.root.remove(mesh);
    disposeObject(mesh);
  });
  rig.fallingParts = [];
}

function clearBinParts(rig: IndexedConveyorRig): void {
  rig.binParts.forEach((mesh) => {
    rig.root.remove(mesh);
    disposeObject(mesh);
  });
  rig.binParts = [];
  rig.binPartCount = 0;
}

function spawnFallingPart(
  rig: IndexedConveyorRig,
  row: number,
  column: number,
  state: Exclude<SlotType, 'empty'>,
  productType: ProductType,
  marker: number,
): void {
  const pose = samplePose(rig, marker);
  const firstX = -((rig.columns - 1) * rig.pitchX) / 2;
  const height = state === 'detail' ? rig.detailHeight : rig.blankHeight;
  const radius = state === 'detail'
    ? Math.max(rig.detailBodyRadius, rig.detailShoulderRadius)
    : rig.blankRadius;
  const appearance = rig.productPartMaterials[productType - 1][state];
  const partMaterial = () => material(appearance.color, {
      metalness: 0.16,
      roughness: 0.42,
      opacity: appearance.opacity,
      transparent: appearance.opacity < 1,
      depthWrite: appearance.opacity >= 0.98,
    });
  const mesh = new THREE.Group();
  if (state === 'blank') {
    mesh.add(new THREE.Mesh(
      new THREE.CylinderGeometry(rig.blankRadius, rig.blankRadius, rig.blankHeight, 14),
      partMaterial(),
    ));
  } else {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(rig.detailBodyRadius, rig.detailBodyRadius, rig.detailBodyHeight, 14),
      partMaterial(),
    );
    body.position.y = rig.detailBodyCenterFromBase - rig.detailHeight / 2;
    const shoulder = new THREE.Mesh(
      new THREE.CylinderGeometry(rig.detailShoulderRadius, rig.detailShoulderRadius, rig.detailShoulderHeight, 14),
      partMaterial(),
    );
    shoulder.position.y = rig.detailShoulderCenterFromBase - rig.detailHeight / 2;
    mesh.add(body, shoulder);
  }
  mesh.name = `falling_${state}_${row}_${column}`;
  mesh.position.copy(new THREE.Vector3(
    firstX + column * rig.pitchX,
    rig.slatThickness / 2 + height / 2 + 0.006,
    0,
  ).applyMatrix4(rowMatrix(pose)));
  mesh.rotation.x = pose.rotationX;
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  rig.root.add(mesh);
  const lateralDrift = (Math.random() - 0.5) * 0.11;
  rig.fallingParts.push({
    mesh,
    velocity: new THREE.Vector3(lateralDrift, -0.04, 0.07 + Math.random() * 0.05),
    age: 0,
    phase: 'drop-to-lower',
    halfHeight: height / 2,
    radius,
    angularVelocity: new THREE.Vector3(
      1.4 + Math.random() * 2.2,
      (Math.random() - 0.5) * 2.4,
      (Math.random() - 0.5) * 3.2,
    ),
    landingPosition: null,
  });
}

function fillZoneOne(rig: IndexedConveyorRig): void {
  const zoneLength = rig.zone1Rows * rig.rowPitch;
  for (let row = 0; row < rig.rowCount; row += 1) {
    const distance = modulo((row + 0.5) * rig.rowPitch + rig.currentOffset, rig.pathLength);
    if (distance >= zoneLength) continue;
    for (let column = 0; column < rig.columns; column += 1) {
      const slotIndex = row * rig.columns + column;
      rig.slotStates[slotIndex] = 'blank';
      rig.slotProductTypes[slotIndex] = 1;
    }
  }
}

function syncMagazineInventory(rig: IndexedConveyorRig, magazine: MagazineData): void {
  const visibleSlots = [...magazine.zones[0], ...magazine.zones[1], ...magazine.zones[2]];
  const visibleProductTypes = [
    ...magazine.zoneProductTypes[0],
    ...magazine.zoneProductTypes[1],
    ...magazine.zoneProductTypes[2],
  ];
  const visibleRows = Math.min(Math.ceil(visibleSlots.length / rig.columns), rig.rowCount);
  const positionRows = modulo(Math.round(rig.currentOffset / rig.rowPitch), rig.rowCount);
  rig.slotStates.fill('empty');
  rig.slotProductTypes.fill(1);
  for (let logicalRow = 0; logicalRow < visibleRows; logicalRow += 1) {
    const physicalRow = modulo(logicalRow - positionRows, rig.rowCount);
    for (let column = 0; column < rig.columns; column += 1) {
      const sourceIndex = logicalRow * rig.columns + column;
      const targetIndex = physicalRow * rig.columns + column;
      rig.slotStates[targetIndex] = visibleSlots[sourceIndex] ?? 'empty';
      rig.slotProductTypes[targetIndex] = visibleProductTypes[sourceIndex] ?? 1;
    }
  }
}

function applyLiveIndexState(rig: IndexedConveyorRig, magazine: MagazineData): void {
  if (magazine.state.indexing && !rig.liveIndexing) {
    rig.targetOffset += rig.zone1Rows * rig.rowPitch;
  }
  rig.liveIndexing = magazine.state.indexing;
}

function applyTestCommand(rig: IndexedConveyorRig, command: IndexedConveyorTestCommand): void {
  if (command.id === rig.lastCommandId) return;
  rig.lastCommandId = command.id;
  if (command.type === 'fill' && rig.currentOffset === rig.targetOffset) fillZoneOne(rig);
  if (command.type === 'move' && rig.currentOffset === rig.targetOffset) {
    rig.targetOffset += rig.zone1Rows * rig.rowPitch;
  }
  if (command.type === 'clear') {
    rig.slotStates.fill('empty');
    rig.slotProductTypes.fill(1);
    clearFallingParts(rig);
    clearBinParts(rig);
  }
  if (command.type === 'reset') {
    rig.currentOffset = 0;
    rig.targetOffset = 0;
    rig.slotStates.fill('empty');
    rig.slotProductTypes.fill(1);
    clearFallingParts(rig);
    clearBinParts(rig);
  }
}

function advanceMotion(rig: IndexedConveyorRig, dt: number): void {
  const remaining = rig.targetOffset - rig.currentOffset;
  if (remaining <= 0.00001) {
    rig.currentOffset = rig.targetOffset;
    return;
  }
  const previousOffset = rig.currentOffset;
  const delta = Math.min(remaining, rig.rowPitch * 6 * dt);
  rig.currentOffset += delta;
  const dropMarker = rig.straightLength + rig.rollerRadius * Math.PI * 0.05;

  for (let row = 0; row < rig.rowCount; row += 1) {
    const previousDistance = modulo((row + 0.5) * rig.rowPitch + previousOffset, rig.pathLength);
    const distanceToMarker = modulo(dropMarker - previousDistance, rig.pathLength);
    if (distanceToMarker <= 0.000001 || distanceToMarker > delta + 0.000001) continue;
    for (let column = 0; column < rig.columns; column += 1) {
      const slotIndex = row * rig.columns + column;
      const state = rig.slotStates[slotIndex];
      if (state === 'empty') continue;
      spawnFallingPart(rig, row, column, state, rig.slotProductTypes[slotIndex] ?? 1, dropMarker);
      rig.slotStates[slotIndex] = 'empty';
      rig.slotProductTypes[slotIndex] = 1;
    }
  }
}

function makeBinLandingPosition(
  rig: IndexedConveyorRig,
  visualIndex: number,
  halfHeight: number,
  radius: number,
): THREE.Vector3 {
  const layer = Math.min(5, Math.floor(visualIndex / 55));
  const pileRise = layer * Math.max(0.018, halfHeight * 1.05);
  const landingY = Math.min(
    rig.binTopY - halfHeight - 0.045,
    rig.binBottomY + halfHeight + 0.018 + pileRise + Math.random() * 0.012,
  );
  // Стенки наклонные: у дна полезное сечение заметно меньше верхнего.
  // Старый фиксированный разброс иногда ставил деталь уже снаружи стенки,
  // из-за чего она выглядела просвечивающей сквозь синюю панель.
  const slope = THREE.MathUtils.clamp(
    (landingY - rig.binBottomY) / Math.max(0.001, rig.binTopY - rig.binBottomY),
    0,
    1,
  );
  const innerWidth = THREE.MathUtils.lerp(rig.binWidth * 0.58, rig.binWidth, slope);
  const innerLength = THREE.MathUtils.lerp(rig.binLength * 0.5, rig.binLength, slope);
  const rotatedPartClearance = Math.hypot(radius, halfHeight) + 0.018;
  const availableX = Math.max(0, innerWidth / 2 - rotatedPartClearance);
  const availableZ = Math.max(0, innerLength / 2 - rotatedPartClearance);
  return new THREE.Vector3(
    (Math.random() * 2 - 1) * availableX,
    landingY,
    rig.binCenterZ + (Math.random() * 2 - 1) * availableZ,
  );
}

function rotateFallingPart(part: FallingPart, dt: number): void {
  part.mesh.rotation.x += part.angularVelocity.x * dt;
  part.mesh.rotation.y += part.angularVelocity.y * dt;
  part.mesh.rotation.z += part.angularVelocity.z * dt;
}

function discardPart(rig: IndexedConveyorRig, mesh: THREE.Group): void {
  rig.root.remove(mesh);
  disposeObject(mesh);
}

function updateFallingParts(rig: IndexedConveyorRig, dt: number): void {
  rig.fallingParts = rig.fallingParts.filter((part) => {
    part.age += dt;
    if (part.phase === 'drop-to-lower') {
      part.velocity.y -= 2.6 * dt;
      part.mesh.position.addScaledVector(part.velocity, dt);
      rotateFallingPart(part, dt);
      const onBelt = part.mesh.position.y <= rig.lowerBeltHeight + part.halfHeight + 0.018
        && part.mesh.position.z >= rig.lowerBeltStartZ - 0.08
        && part.mesh.position.z <= rig.lowerBeltEndZ + 0.08;
      if (onBelt) {
        part.phase = 'on-lower';
        part.age = 0;
        part.velocity.set(0, 0, 0);
        part.mesh.position.y = rig.lowerBeltHeight + part.halfHeight + 0.018;
        part.mesh.rotation.set(0, 0, 0);
        return true;
      }
      if (part.mesh.position.y > 0.04) return true;
    } else if (part.phase === 'on-lower') {
      part.mesh.position.z += rig.lowerBeltSpeed * dt;
      part.mesh.rotation.y += dt * 0.35;
      if (part.mesh.position.z < rig.lowerBeltEndZ) return true;
      const pendingBinParts = rig.fallingParts.reduce(
        (count, candidate) => count + (candidate.phase === 'drop-to-bin' ? 1 : 0),
        0,
      );
      part.phase = 'drop-to-bin';
      part.age = 0;
      part.landingPosition = makeBinLandingPosition(
        rig,
        rig.binPartCount + pendingBinParts,
        part.halfHeight,
        part.radius,
      );
      part.velocity.set((Math.random() - 0.5) * 0.16, -0.04, 0.24 + Math.random() * 0.16);
      return true;
    } else if (part.landingPosition) {
      part.velocity.y -= 2.6 * dt;
      part.mesh.position.addScaledVector(part.velocity, dt);
      part.mesh.position.x = THREE.MathUtils.lerp(part.mesh.position.x, part.landingPosition.x, Math.min(1, dt * 2.2));
      part.mesh.position.z = THREE.MathUtils.lerp(part.mesh.position.z, part.landingPosition.z, Math.min(1, dt * 1.8));
      rotateFallingPart(part, dt);
      if (part.mesh.position.y <= part.landingPosition.y) {
        part.mesh.position.copy(part.landingPosition);
        rig.binPartCount += 1;
        if (rig.binParts.length < MAX_BIN_VISUAL_PARTS) {
          rig.binParts.push(part.mesh);
        } else {
          discardPart(rig, part.mesh);
        }
        return false;
      }
      if (part.age <= 2.2 && part.mesh.position.y > 0.04) return true;
    }
    discardPart(rig, part.mesh);
    return false;
  });
}

function updateLowerBelt(rig: IndexedConveyorRig, dt: number): void {
  const length = rig.lowerBeltEndZ - rig.lowerBeltStartZ;
  rig.lowerBeltOffset = modulo(rig.lowerBeltOffset + rig.lowerBeltSpeed * dt, length);
  const spacing = length / rig.lowerTreads.count;
  for (let index = 0; index < rig.lowerTreads.count; index += 1) {
    const z = rig.lowerBeltStartZ + modulo(index * spacing + rig.lowerBeltOffset, length);
    rig.lowerTreads.setMatrixAt(index, new THREE.Matrix4().makeTranslation(0, rig.lowerBeltHeight + 0.016, z));
  }
  rig.lowerTreads.instanceMatrix.needsUpdate = true;
}

function addRoller(root: THREE.Group, name: string, width: number, radius: number, centerY: number, z: number): void {
  const roller = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 32),
    material(CONVEYOR_COLORS.frameDark, { metalness: 0.6, roughness: 0.3 }),
  );
  roller.name = name;
  roller.rotation.z = Math.PI / 2;
  roller.position.set(0, centerY, z);
  roller.castShadow = true;
  roller.receiveShadow = true;
  root.add(roller);

  [-1, 1].forEach((side) => {
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.34, radius * 0.34, 0.035, 20),
      material(COLORS.steel, { metalness: 0.62, roughness: 0.28 }),
    );
    hub.name = `${name}_hub_${side > 0 ? 'right' : 'left'}`;
    hub.rotation.z = Math.PI / 2;
    hub.position.set(side * (width / 2 + 0.018), centerY, z);
    hub.castShadow = true;
    root.add(hub);
  });
}

function addFrame(root: THREE.Group, width: number, length: number, rollerCenterY: number): void {
  const railX = width / 2 + 0.055;
  const railLength = length + 0.18;
  [-1, 1].forEach((side) => {
    root.add(box(
      `conveyor_side_rail_${side}`,
      new THREE.Vector3(0.065, 0.12, railLength),
      CONVEYOR_COLORS.frameDark,
      new THREE.Vector3(side * railX, rollerCenterY - 0.01, -length / 2),
      { metalness: 0.35, roughness: 0.44 },
    ));
  });

  const legZ = [-length * 0.2, -length * 0.8];
  const legHeight = rollerCenterY + 0.045;
  legZ.forEach((z, pairIndex) => {
    [-1, 1].forEach((side) => {
      const x = side * (width / 2 + 0.09);
      root.add(box(
        `conveyor_leg_${pairIndex}_${side}`,
        new THREE.Vector3(0.065, legHeight, 0.065),
        CONVEYOR_COLORS.frame,
        new THREE.Vector3(x, legHeight / 2, z),
        { metalness: 0.28, roughness: 0.45 },
      ));
      root.add(box(
        `conveyor_foot_${pairIndex}_${side}`,
        new THREE.Vector3(0.14, 0.025, 0.14),
        COLORS.charcoal,
        new THREE.Vector3(x, 0.013, z),
      ));
    });
    root.add(box(
      `conveyor_crossbar_${pairIndex}`,
      new THREE.Vector3(width + 0.24, 0.06, 0.06),
      CONVEYOR_COLORS.frame,
      new THREE.Vector3(0, rollerCenterY * 0.48, z),
      { metalness: 0.28, roughness: 0.45 },
    ));
  });
}

function addLowerConveyor(
  root: THREE.Group,
  width: number,
  startZ: number,
  endZ: number,
  height: number,
): THREE.InstancedMesh {
  const length = endZ - startZ;
  const centerZ = (startZ + endZ) / 2;
  const rollerRadius = 0.045;
  root.add(box(
    'lower_conveyor_belt',
    new THREE.Vector3(width, 0.025, length),
    CONVEYOR_COLORS.lowerBelt,
    new THREE.Vector3(0, height, centerZ),
    { metalness: 0.08, roughness: 0.62 },
  ));
  [-1, 1].forEach((side) => root.add(box(
    `lower_conveyor_rail_${side}`,
    new THREE.Vector3(0.045, 0.095, length + 0.08),
    CONVEYOR_COLORS.frameDark,
    new THREE.Vector3(side * (width / 2 + 0.035), height - 0.045, centerZ),
    { metalness: 0.32, roughness: 0.44 },
  )));
  addRoller(root, 'lower_conveyor_receive_roller', width + 0.06, rollerRadius, height - 0.028, startZ);
  addRoller(root, 'lower_conveyor_discharge_roller', width + 0.06, rollerRadius, height - 0.028, endZ);

  const treadCount = Math.max(18, Math.round(length / 0.07));
  const treads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width * 0.96, 0.008, 0.014),
    material(CONVEYOR_COLORS.lowerBeltDark, { metalness: 0.12, roughness: 0.55 }),
    treadCount,
  );
  treads.name = 'lower_conveyor_treads';
  treads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  treads.frustumCulled = false;
  treads.castShadow = true;
  root.add(treads);
  return treads;
}

function quadPanel(name: string, points: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], color: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, point.z]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material(color, {
    metalness: 0.18,
    roughness: 0.46,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
  }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addReceivingBin(
  root: THREE.Group,
  centerZ: number,
  width: number,
  length: number,
  height: number,
  maxTopY: number,
): BinBounds {
  const wheelRadius = 0.055;
  const wheelCenterY = wheelRadius;
  const frameY = 0.13;
  const bottomY = 0.16;
  const topY = Math.max(bottomY + 0.12, Math.min(height, maxTopY));
  const bottomWidth = width * 0.58;
  const bottomLength = length * 0.5;
  const topX = width / 2;
  const bottomX = bottomWidth / 2;
  const topZ = length / 2;
  const bottomZ = bottomLength / 2;
  root.add(
    quadPanel('bin_left_wall', [
      new THREE.Vector3(-bottomX, bottomY, centerZ - bottomZ),
      new THREE.Vector3(-bottomX, bottomY, centerZ + bottomZ),
      new THREE.Vector3(-topX, topY, centerZ + topZ),
      new THREE.Vector3(-topX, topY, centerZ - topZ),
    ], CONVEYOR_COLORS.bin),
    quadPanel('bin_right_wall', [
      new THREE.Vector3(bottomX, bottomY, centerZ + bottomZ),
      new THREE.Vector3(bottomX, bottomY, centerZ - bottomZ),
      new THREE.Vector3(topX, topY, centerZ - topZ),
      new THREE.Vector3(topX, topY, centerZ + topZ),
    ], CONVEYOR_COLORS.bin),
    quadPanel('bin_near_wall', [
      new THREE.Vector3(bottomX, bottomY, centerZ - bottomZ),
      new THREE.Vector3(-bottomX, bottomY, centerZ - bottomZ),
      new THREE.Vector3(-topX, topY, centerZ - topZ),
      new THREE.Vector3(topX, topY, centerZ - topZ),
    ], CONVEYOR_COLORS.bin),
    quadPanel('bin_far_wall', [
      new THREE.Vector3(-bottomX, bottomY, centerZ + bottomZ),
      new THREE.Vector3(bottomX, bottomY, centerZ + bottomZ),
      new THREE.Vector3(topX, topY, centerZ + topZ),
      new THREE.Vector3(-topX, topY, centerZ + topZ),
    ], CONVEYOR_COLORS.bin),
    box('bin_bottom', new THREE.Vector3(bottomWidth, 0.035, bottomLength), CONVEYOR_COLORS.bin, new THREE.Vector3(0, bottomY, centerZ), { metalness: 0.18, roughness: 0.46 }),
  );

  const frameWidth = width + 0.14;
  const frameLength = length + 0.12;
  root.add(
    box('bin_frame_left', new THREE.Vector3(0.07, 0.06, frameLength), CONVEYOR_COLORS.frameDark, new THREE.Vector3(-frameWidth / 2, frameY, centerZ), { metalness: 0.32, roughness: 0.42 }),
    box('bin_frame_right', new THREE.Vector3(0.07, 0.06, frameLength), CONVEYOR_COLORS.frameDark, new THREE.Vector3(frameWidth / 2, frameY, centerZ), { metalness: 0.32, roughness: 0.42 }),
    box('bin_frame_near', new THREE.Vector3(frameWidth, 0.06, 0.07), CONVEYOR_COLORS.frameDark, new THREE.Vector3(0, frameY, centerZ - frameLength / 2), { metalness: 0.32, roughness: 0.42 }),
    box('bin_frame_far', new THREE.Vector3(frameWidth, 0.06, 0.07), CONVEYOR_COLORS.frameDark, new THREE.Vector3(0, frameY, centerZ + frameLength / 2), { metalness: 0.32, roughness: 0.42 }),
    // Две поперечины физически связывают узкое дно мульды с колёсной рамой.
    // Высота корпуса не меняется: верх балок остаётся на текущем bottomY.
    box('bin_frame_support_near', new THREE.Vector3(frameWidth - 0.07, 0.06, 0.065), CONVEYOR_COLORS.frameDark, new THREE.Vector3(0, frameY, centerZ - bottomLength * 0.34), { metalness: 0.32, roughness: 0.42 }),
    box('bin_frame_support_far', new THREE.Vector3(frameWidth - 0.07, 0.06, 0.065), CONVEYOR_COLORS.frameDark, new THREE.Vector3(0, frameY, centerZ + bottomLength * 0.34), { metalness: 0.32, roughness: 0.42 }),
  );
  [-1, 1].forEach((sideX) => [-1, 1].forEach((sideZ) => root.add(box(
    `bin_body_mount_${sideX}_${sideZ}`,
    new THREE.Vector3(0.075, 0.055, 0.075),
    COLORS.steel,
    new THREE.Vector3(
      sideX * bottomWidth * 0.38,
      bottomY - 0.005,
      centerZ + sideZ * bottomLength * 0.34,
    ),
    { metalness: 0.48, roughness: 0.34 },
  ))));
  [-1, 1].forEach((sideX) => [-1, 1].forEach((sideZ) => {
    const casterX = sideX * frameWidth * 0.42;
    const casterZ = centerZ + sideZ * frameLength * 0.38;
    root.add(box(
      `bin_caster_${sideX}_${sideZ}`,
      new THREE.Vector3(0.055, 0.09, 0.055),
      COLORS.steel,
      new THREE.Vector3(casterX, 0.105, casterZ),
      { metalness: 0.48, roughness: 0.34 },
    ));
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.04, 18),
      material(CONVEYOR_COLORS.wheel, { metalness: 0.08, roughness: 0.5 }),
    );
    wheel.name = `bin_wheel_${sideX}_${sideZ}`;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(casterX, wheelCenterY, casterZ);
    wheel.castShadow = true;
    root.add(wheel);
  }));
  return { bottomY, topY };
}

function addDischargeHopper(
  root: THREE.Group,
  width: number,
  length: number,
  workingHeight: number,
  rollerRadius: number,
  lowerBeltWidth: number,
  lowerBeltHeight: number,
): void {
  const dischargeZ = -length;
  const backZ = dischargeZ - 0.34;
  const exitZ = dischargeZ + 0.14;
  const upperY = workingHeight - rollerRadius * 0.34;
  const lowerY = lowerBeltHeight + 0.055;
  const outerX = width * 0.55;
  const innerX = lowerBeltWidth * 0.43;
  root.add(
    quadPanel('conveyor_discharge_hopper_back', [
      new THREE.Vector3(-outerX, upperY, backZ),
      new THREE.Vector3(outerX, upperY, backZ),
      new THREE.Vector3(innerX, lowerY, dischargeZ - 0.045),
      new THREE.Vector3(-innerX, lowerY, dischargeZ - 0.045),
    ], CONVEYOR_COLORS.frameDark),
    quadPanel('conveyor_discharge_hopper_left', [
      new THREE.Vector3(-outerX, upperY, backZ),
      new THREE.Vector3(-innerX, lowerY, dischargeZ - 0.045),
      new THREE.Vector3(-innerX, lowerY, exitZ),
      new THREE.Vector3(-outerX, upperY, dischargeZ + 0.08),
    ], CONVEYOR_COLORS.frameDark),
    quadPanel('conveyor_discharge_hopper_right', [
      new THREE.Vector3(outerX, upperY, dischargeZ + 0.08),
      new THREE.Vector3(innerX, lowerY, exitZ),
      new THREE.Vector3(innerX, lowerY, dischargeZ - 0.045),
      new THREE.Vector3(outerX, upperY, backZ),
    ], CONVEYOR_COLORS.frameDark),
    box(
      'conveyor_discharge_hopper_lip',
      new THREE.Vector3(innerX * 2 + 0.08, 0.045, 0.045),
      CONVEYOR_COLORS.frameDark,
      new THREE.Vector3(0, lowerY - 0.012, exitZ),
      { metalness: 0.32, roughness: 0.44 },
    ),
  );
}

function addZoneStrips(root: THREE.Group, zoneRows: [number, number, number], pitch: number, width: number, workingHeight: number): void {
  const colors = [COLORS.blue, COLORS.green, COLORS.amber];
  let rowStart = 0;
  zoneRows.forEach((rows, zoneIndex) => {
    const zoneLength = rows * pitch;
    const centerZ = -(rowStart * pitch + zoneLength / 2);
    [-1, 1].forEach((side) => root.add(box(
      `conveyor_zone_${zoneIndex + 1}_${side}`,
      new THREE.Vector3(0.025, 0.035, Math.max(0.02, zoneLength - 0.012)),
      colors[zoneIndex],
      new THREE.Vector3(side * (width / 2 + 0.085), workingHeight + 0.004, centerZ),
      { emissive: colors[zoneIndex], emissiveIntensity: 0.08, metalness: 0.1, roughness: 0.48 },
    )));
    rowStart += rows;
  });
}

export function createIndexedConveyor(
  config: IndexedConveyorLayout,
  partGeometry: PartGeometryLayout,
  productPartMaterials: [ProductPartMaterials, ProductPartMaterials, ProductPartMaterials],
  magazineId: 1 | 2,
): IndexedConveyorRig {
  const root = new THREE.Group();
  root.name = `IndexedConveyor_${magazineId}`;
  root.userData.magazineId = magazineId;
  root.position.copy(logicalPosition(config.position.x, config.position.y, config.position.z));

  const columns = config.columnsX;
  const zoneRows = config.zoneRowsY;
  const totalTopRows = zoneRows.reduce((sum, rows) => sum + rows, 0);
  const pitchX = mm(config.pitchX);
  const pitchY = mm(config.pitchY);
  const slotRadius = mm(config.slotDiameter) / 2;
  const slatWidth = mm(config.slatWidthX);
  const slatDepth = pitchY * 0.86;
  const slatThickness = mm(config.slatThickness);
  const rollerRadius = mm(config.rollerRadius);
  const workingHeight = mm(config.workingHeight);
  const straightLength = totalTopRows * pitchY;
  const rollerCenterY = workingHeight - rollerRadius;
  const lowerBeltWidth = mm(config.lowerBeltWidthX);
  const lowerBeltHeight = mm(config.lowerBeltHeight);
  const lowerBeltSpeed = mm(config.lowerBeltSpeed);
  const pathLength = straightLength * 2 + Math.PI * rollerRadius * 2;
  const rowCount = Math.max(totalTopRows + 2, Math.round(pathLength / pitchY));
  const rowPitch = pathLength / rowCount;
  const maxSlots = rowCount * columns;
  const blankRadius = mm(partGeometry.blankDiameter) / 2;
  const blankHeight = mm(partGeometry.blankLength);
  const detailBodyRadius = mm(partGeometry.detailBodyDiameter) / 2;
  const detailBodyHeight = mm(partGeometry.detailBodyLength);
  const detailShoulderRadius = mm(partGeometry.detailShoulderDiameter) / 2;
  const detailShoulderHeight = mm(partGeometry.detailShoulderLength);
  const detailShoulderOffset = mm(partGeometry.detailShoulderOffset);
  const detailBottom = Math.min(-detailBodyHeight / 2, detailShoulderOffset - detailShoulderHeight / 2);
  const detailTop = Math.max(detailBodyHeight / 2, detailShoulderOffset + detailShoulderHeight / 2);
  const detailHeight = detailTop - detailBottom;
  const detailBodyCenterFromBase = -detailBottom;
  const detailShoulderCenterFromBase = detailShoulderOffset - detailBottom;
  const slats = createSlatInstances('conveyor_slats', rowCount, slatWidth, slatDepth, slatThickness);
  const slots = createSlotInstances('conveyor_slots', rowCount, columns, slotRadius);
  const productMeshes = {
    blank: productPartMaterials.map((appearance, index) => createProductInstances(
      `conveyor_blanks_type_${index + 1}`, maxSlots, blankRadius, blankHeight, appearance.blank,
    )) as ProductMeshes,
    detailBody: productPartMaterials.map((appearance, index) => createProductInstances(
      `conveyor_detail_bodies_type_${index + 1}`, maxSlots, detailBodyRadius, detailBodyHeight, appearance.detail,
    )) as ProductMeshes,
    detailShoulder: productPartMaterials.map((appearance, index) => createProductInstances(
      `conveyor_detail_shoulders_type_${index + 1}`, maxSlots, detailShoulderRadius, detailShoulderHeight, appearance.detail,
    )) as ProductMeshes,
  };
  root.add(
    slats,
    slots,
    ...productMeshes.blank,
    ...productMeshes.detailBody,
    ...productMeshes.detailShoulder,
  );

  const lowerBeltStartZ = -straightLength + 0.015;
  const lowerBeltEndZ = 0.06;
  const lowerTreads = addLowerConveyor(root, lowerBeltWidth, lowerBeltStartZ, lowerBeltEndZ, lowerBeltHeight);
  const binWidth = mm(config.binWidthX);
  const binLength = mm(config.binLengthY);
  const binCenterZ = lowerBeltEndZ + binLength / 2 + 0.04;
  const binBounds = addReceivingBin(
    root,
    binCenterZ,
    binWidth,
    binLength,
    mm(config.binHeight),
    lowerBeltHeight - 0.055,
  );

  addRoller(root, 'conveyor_inlet_roller', slatWidth + 0.08, rollerRadius * 0.82, rollerCenterY, 0);
  addRoller(root, 'conveyor_discharge_roller', slatWidth + 0.08, rollerRadius * 0.82, rollerCenterY, -straightLength);
  addFrame(root, slatWidth, straightLength, rollerCenterY);
  addDischargeHopper(root, slatWidth, straightLength, workingHeight, rollerRadius, lowerBeltWidth, lowerBeltHeight);
  addZoneStrips(root, zoneRows, pitchY, slatWidth, workingHeight);

  const rig: IndexedConveyorRig = {
    root,
    slats,
    slots,
    productMeshes,
    lowerTreads,
    fallingParts: [],
    columns,
    rowCount,
    zone1Rows: zoneRows[0],
    pitchX,
    rowPitch,
    slotRadius,
    blankRadius,
    blankHeight,
    detailBodyRadius,
    detailBodyHeight,
    detailShoulderRadius,
    detailShoulderHeight,
    detailBodyCenterFromBase,
    detailShoulderCenterFromBase,
    detailHeight,
    productPartMaterials,
    slatThickness,
    straightLength,
    rollerRadius,
    rollerCenterY,
    workingHeight,
    lowerBeltStartZ,
    lowerBeltEndZ,
    lowerBeltHeight,
    lowerBeltSpeed,
    lowerBeltOffset: 0,
    binCenterZ,
    binWidth,
    binLength,
    binBottomY: binBounds.bottomY,
    binTopY: binBounds.topY,
    binParts: [],
    binPartCount: 0,
    pathLength,
    currentOffset: 0,
    targetOffset: 0,
    lastCommandId: 0,
    slotStates: Array.from({ length: maxSlots }, () => 'empty'),
    slotProductTypes: Array.from({ length: maxSlots }, () => 1 as ProductType),
    liveIndexing: false,
  };
  updateLowerBelt(rig, 0);
  updateInstanceMatrices(rig);
  return rig;
}

export function updateIndexedConveyorRig(
  rig: IndexedConveyorRig,
  command: IndexedConveyorTestCommand,
  dt: number,
  magazine?: MagazineData,
): IndexedConveyorTestStatus {
  if (magazine) applyLiveIndexState(rig, magazine);
  else applyTestCommand(rig, command);
  advanceMotion(rig, dt);
  const moving = Math.abs(rig.targetOffset - rig.currentOffset) > 0.00001;
  if (magazine && !magazine.state.indexing && !moving) syncMagazineInventory(rig, magazine);
  updateLowerBelt(rig, dt);
  updateFallingParts(rig, dt);
  updateInstanceMatrices(rig);
  const positionRows = Math.round(rig.currentOffset / rig.rowPitch) % rig.rowCount;
  return {
    moving,
    positionRows,
    loadedSlots: rig.slotStates.reduce((count, state) => count + (state === 'empty' ? 0 : 1), 0),
    homed: !moving && positionRows === 0,
  };
}
