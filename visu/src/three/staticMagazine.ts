import * as THREE from 'three';
import type {
  MagazineData,
  PartGeometryLayout,
  ProductPartMaterials,
  ProductType,
  StaticMagazineLayout,
} from '../model/types';
import { box, logicalPosition, material, mm } from './primitives';

export const STATIC_MAGAZINE_COLUMNS = 10;
export const STATIC_MAGAZINE_ROWS = 12;
export const STATIC_MAGAZINE_SLOTS = STATIC_MAGAZINE_COLUMNS * STATIC_MAGAZINE_ROWS;

type ProductMeshes = [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];

export interface StaticMagazineRig {
  root: THREE.Group;
  pocketBottoms: THREE.InstancedMesh;
  pocketSleeves: THREE.InstancedMesh;
  pocketCollars: THREE.InstancedMesh;
  productMeshes: {
    blank: ProductMeshes;
    detail: ProductMeshes;
  };
  pitchX: number;
  pitchY: number;
  workingHeight: number;
  pocketDepth: number;
  productHeight: number;
  inventorySignature: string;
}

const MAGAZINE_COLORS = {
  frame: 0x31566d,
  frameDark: 0x172b38,
  frameEdge: 0x0e1d27,
  cassette: 0x176fc4,
  pocket: 0x26343d,
  pocketBottom: 0x111a20,
  collar: 0x7e919e,
  foot: 0x202b33,
};

function createInstanceMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.Material,
  count = STATIC_MAGAZINE_SLOTS,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, meshMaterial, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createProductInstances(
  name: string,
  radius: number,
  height: number,
  appearance: ProductPartMaterials['blank'],
): THREE.InstancedMesh {
  const mesh = createInstanceMesh(
    name,
    new THREE.CylinderGeometry(radius, radius, height, 20),
    material(appearance.color, {
      metalness: 0.2,
      roughness: 0.36,
      opacity: appearance.opacity,
      transparent: appearance.opacity < 1,
      depthWrite: appearance.opacity >= 0.98,
    }),
  );
  mesh.count = 0;
  return mesh;
}

function addBeamBetween(
  root: THREE.Group,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: number,
): void {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8),
    material(color, { metalness: 0.54, roughness: 0.32 }),
  );
  beam.name = name;
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  beam.castShadow = true;
  beam.receiveShadow = true;
  root.add(beam);
}

function addAdjustableFoot(root: THREE.Group, x: number, z: number, index: number): void {
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.009, 0.085, 12),
    material(MAGAZINE_COLORS.collar, { metalness: 0.72, roughness: 0.24 }),
  );
  stem.name = `static_magazine_foot_stem_${index}`;
  stem.position.set(x, 0.068, z);
  stem.castShadow = true;
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.044, 0.026, 18),
    material(MAGAZINE_COLORS.foot, { metalness: 0.18, roughness: 0.58 }),
  );
  pad.name = `static_magazine_foot_pad_${index}`;
  pad.position.set(x, 0.013, z);
  pad.castShadow = true;
  pad.receiveShadow = true;
  root.add(stem, pad);
}

function buildFrame(
  root: THREE.Group,
  width: number,
  depth: number,
  centerZ: number,
  workingHeight: number,
): void {
  const tube = 0.045;
  const inset = 0.055;
  const halfX = width / 2 - inset;
  const halfZ = depth / 2 - inset;
  const frontZ = centerZ + halfZ;
  const backZ = centerZ - halfZ;
  const topY = workingHeight - 0.085;
  const lowerY = 0.24;
  const legHeight = topY - 0.085;
  const legY = 0.085 + legHeight / 2;
  const legPositions: Array<[number, number]> = [
    [-halfX, frontZ], [halfX, frontZ],
    [-halfX, centerZ], [halfX, centerZ],
    [-halfX, backZ], [halfX, backZ],
  ];

  root.add(
    box('static_magazine_top_front', new THREE.Vector3(width - 0.04, tube, tube), MAGAZINE_COLORS.frame, new THREE.Vector3(0, topY, frontZ), { metalness: 0.52, roughness: 0.32 }),
    box('static_magazine_top_back', new THREE.Vector3(width - 0.04, tube, tube), MAGAZINE_COLORS.frame, new THREE.Vector3(0, topY, backZ), { metalness: 0.52, roughness: 0.32 }),
    box('static_magazine_top_left', new THREE.Vector3(tube, tube, depth - 0.04), MAGAZINE_COLORS.frame, new THREE.Vector3(-halfX, topY, centerZ), { metalness: 0.52, roughness: 0.32 }),
    box('static_magazine_top_right', new THREE.Vector3(tube, tube, depth - 0.04), MAGAZINE_COLORS.frame, new THREE.Vector3(halfX, topY, centerZ), { metalness: 0.52, roughness: 0.32 }),
    box('static_magazine_lower_front', new THREE.Vector3(width - 0.04, 0.034, 0.034), MAGAZINE_COLORS.frameDark, new THREE.Vector3(0, lowerY, frontZ), { metalness: 0.5, roughness: 0.34 }),
    box('static_magazine_lower_back', new THREE.Vector3(width - 0.04, 0.034, 0.034), MAGAZINE_COLORS.frameDark, new THREE.Vector3(0, lowerY, backZ), { metalness: 0.5, roughness: 0.34 }),
  );

  legPositions.forEach(([x, z], index) => {
    root.add(box(
      `static_magazine_leg_${index}`,
      new THREE.Vector3(tube, legHeight, tube),
      MAGAZINE_COLORS.frame,
      new THREE.Vector3(x, legY, z),
      { metalness: 0.52, roughness: 0.32 },
    ));
    addAdjustableFoot(root, x, z, index);
  });

  const braceRadius = 0.012;
  [-halfX, halfX].forEach((x, side) => {
    addBeamBetween(root, `static_magazine_brace_${side}_a`, new THREE.Vector3(x, lowerY + 0.04, frontZ), new THREE.Vector3(x, topY - 0.04, centerZ), braceRadius, MAGAZINE_COLORS.frameDark);
    addBeamBetween(root, `static_magazine_brace_${side}_b`, new THREE.Vector3(x, lowerY + 0.04, backZ), new THREE.Vector3(x, topY - 0.04, centerZ), braceRadius, MAGAZINE_COLORS.frameDark);
  });

  root.add(box(
    'static_magazine_lower_shelf',
    new THREE.Vector3(width - 0.18, 0.022, depth - 0.2),
    MAGAZINE_COLORS.frameEdge,
    new THREE.Vector3(0, lowerY + 0.02, centerZ),
    { metalness: 0.38, roughness: 0.46 },
  ));
}

function buildCassette(
  root: THREE.Group,
  pitchY: number,
  width: number,
  depth: number,
  workingHeight: number,
): void {
  const centerZ = -((STATIC_MAGAZINE_ROWS - 1) * pitchY) / 2;
  const cassetteWidth = width - 0.055;
  const cassetteDepth = depth - 0.055;
  const cassetteHeight = 0.024;
  const cassetteY = workingHeight - 0.018;
  const borderWidth = 0.032;
  const innerDepth = cassetteDepth - borderWidth * 2;

  root.add(
    box(
      'static_magazine_cassette',
      new THREE.Vector3(cassetteWidth - borderWidth * 2, cassetteHeight, innerDepth),
      MAGAZINE_COLORS.cassette,
      new THREE.Vector3(0, cassetteY, centerZ),
      { metalness: 0.38, roughness: 0.38 },
    ),
    box(
      'static_magazine_cassette_border_front',
      new THREE.Vector3(cassetteWidth, cassetteHeight, borderWidth),
      MAGAZINE_COLORS.frameDark,
      new THREE.Vector3(0, cassetteY, centerZ + cassetteDepth / 2 - borderWidth / 2),
      { metalness: 0.5, roughness: 0.34 },
    ),
    box(
      'static_magazine_cassette_border_back',
      new THREE.Vector3(cassetteWidth, cassetteHeight, borderWidth),
      MAGAZINE_COLORS.frameDark,
      new THREE.Vector3(0, cassetteY, centerZ - cassetteDepth / 2 + borderWidth / 2),
      { metalness: 0.5, roughness: 0.34 },
    ),
    box(
      'static_magazine_cassette_border_left',
      new THREE.Vector3(borderWidth, cassetteHeight, innerDepth),
      MAGAZINE_COLORS.frameDark,
      new THREE.Vector3(-cassetteWidth / 2 + borderWidth / 2, cassetteY, centerZ),
      { metalness: 0.5, roughness: 0.34 },
    ),
    box(
      'static_magazine_cassette_border_right',
      new THREE.Vector3(borderWidth, cassetteHeight, innerDepth),
      MAGAZINE_COLORS.frameDark,
      new THREE.Vector3(cassetteWidth / 2 - borderWidth / 2, cassetteY, centerZ),
      { metalness: 0.5, roughness: 0.34 },
    ),
  );
}

function inventoryKey(magazine?: MagazineData): string {
  if (!magazine) return 'empty';
  const slots = magazine.slots;
  const productTypes = magazine.productTypes;
  let result = '';
  for (let index = 0; index < STATIC_MAGAZINE_SLOTS; index += 1) {
    result += `${slots[index]?.[0] ?? 'e'}${productTypes[index] ?? 1}`;
  }
  return result;
}

function updateProducts(rig: StaticMagazineRig, magazine?: MagazineData): void {
  const signature = inventoryKey(magazine);
  if (signature === rig.inventorySignature) return;
  rig.inventorySignature = signature;

  const slots = magazine?.slots ?? [];
  const productTypes = magazine?.productTypes ?? [];
  const blankCounts = [0, 0, 0];
  const detailCounts = [0, 0, 0];
  const firstX = -((STATIC_MAGAZINE_COLUMNS - 1) * rig.pitchX) / 2;

  for (let index = 0; index < STATIC_MAGAZINE_SLOTS; index += 1) {
    const state = slots[index] ?? 'empty';
    const rawProductType = productTypes[index] ?? 1;
    const productType = Math.min(3, Math.max(1, rawProductType)) as ProductType;
    const typeIndex = productType - 1;
    const column = index % STATIC_MAGAZINE_COLUMNS;
    const row = Math.floor(index / STATIC_MAGAZINE_COLUMNS);
    const x = firstX + column * rig.pitchX;
    const z = -row * rig.pitchY;

    if (state !== 'blank' && state !== 'detail') continue;
    const inserted = Math.min(rig.pocketDepth * 0.78, rig.productHeight * 0.58);
    const matrix = new THREE.Matrix4().makeTranslation(x, rig.workingHeight - inserted + rig.productHeight / 2, z);
    const productMeshes = state === 'blank' ? rig.productMeshes.blank : rig.productMeshes.detail;
    const productCounts = state === 'blank' ? blankCounts : detailCounts;
    productMeshes[typeIndex].setMatrixAt(productCounts[typeIndex], matrix);
    productCounts[typeIndex] += 1;
  }

  rig.productMeshes.blank.forEach((mesh, index) => {
    mesh.count = blankCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
  });
  rig.productMeshes.detail.forEach((mesh, index) => {
    mesh.count = detailCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
  });
}

export function createStaticMagazine(
  config: StaticMagazineLayout,
  partGeometry: PartGeometryLayout,
  productPartMaterials: [ProductPartMaterials, ProductPartMaterials, ProductPartMaterials],
  magazineId: 1 | 2,
): StaticMagazineRig {
  const root = new THREE.Group();
  root.name = `StaticMagazine_${magazineId}`;
  root.userData.magazineId = magazineId;
  root.position.copy(logicalPosition(config.position.x, config.position.y, config.position.z));

  const pitchX = mm(config.pitchX);
  const pitchY = mm(config.pitchY);
  const workingHeight = mm(config.workingHeight);
  const maxPartDiameter = mm(partGeometry.diameter);
  const minPitch = Math.min(pitchX, pitchY);
  const pocketInnerRadius = Math.min(minPitch / 2 - 0.003, maxPartDiameter / 2 + 0.0015);
  const pocketOuterRadius = Math.min(minPitch / 2 - 0.001, pocketInnerRadius + 0.0035);
  const productHeight = mm(partGeometry.length);
  const pocketDepth = THREE.MathUtils.clamp(productHeight * 0.62, 0.032, 0.12);
  const width = (STATIC_MAGAZINE_COLUMNS - 1) * pitchX + pocketOuterRadius * 2 + 0.15;
  const depth = (STATIC_MAGAZINE_ROWS - 1) * pitchY + pocketOuterRadius * 2 + 0.15;
  const centerZ = -((STATIC_MAGAZINE_ROWS - 1) * pitchY) / 2;

  buildFrame(root, width, depth, centerZ, workingHeight);
  buildCassette(root, pitchY, width, depth, workingHeight);

  const pocketBottoms = createInstanceMesh(
    'static_magazine_pocket_bottoms',
    new THREE.CylinderGeometry(pocketInnerRadius * 0.88, pocketInnerRadius * 0.88, 0.006, 20),
    material(MAGAZINE_COLORS.pocketBottom, { metalness: 0.18, roughness: 0.58 }),
  );
  const pocketSleeves = createInstanceMesh(
    'static_magazine_pocket_sleeves',
    new THREE.CylinderGeometry(pocketOuterRadius * 0.92, pocketOuterRadius, pocketDepth, 20, 1, true),
    material(MAGAZINE_COLORS.pocket, { metalness: 0.5, roughness: 0.34, side: THREE.DoubleSide }),
  );
  const pocketCollars = createInstanceMesh(
    'static_magazine_pocket_collars',
    new THREE.TorusGeometry((pocketInnerRadius + pocketOuterRadius) / 2, (pocketOuterRadius - pocketInnerRadius) / 2, 8, 20),
    material(MAGAZINE_COLORS.collar, { metalness: 0.7, roughness: 0.24 }),
  );
  const ringRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const firstX = -((STATIC_MAGAZINE_COLUMNS - 1) * pitchX) / 2;
  for (let index = 0; index < STATIC_MAGAZINE_SLOTS; index += 1) {
    const column = index % STATIC_MAGAZINE_COLUMNS;
    const row = Math.floor(index / STATIC_MAGAZINE_COLUMNS);
    const x = firstX + column * pitchX;
    const z = -row * pitchY;
    pocketBottoms.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, workingHeight - pocketDepth + 0.004, z));
    pocketSleeves.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, workingHeight - pocketDepth / 2, z));
    pocketCollars.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(x, workingHeight - 0.004, z),
      ringRotation,
      new THREE.Vector3(1, 1, 1),
    ));
  }
  pocketBottoms.instanceMatrix.needsUpdate = true;
  pocketSleeves.instanceMatrix.needsUpdate = true;
  pocketCollars.instanceMatrix.needsUpdate = true;

  const productMeshes = {
    blank: productPartMaterials.map((appearance, index) => createProductInstances(
      `static_magazine_blanks_type_${index + 1}`,
      maxPartDiameter / 2,
      productHeight,
      appearance.blank,
    )) as ProductMeshes,
    detail: productPartMaterials.map((appearance, index) => createProductInstances(
      `static_magazine_details_type_${index + 1}`,
      maxPartDiameter / 2,
      productHeight,
      appearance.detail,
    )) as ProductMeshes,
  };
  root.add(
    pocketBottoms,
    pocketSleeves,
    pocketCollars,
    ...productMeshes.blank,
    ...productMeshes.detail,
  );

  return {
    root,
    pocketBottoms,
    pocketSleeves,
    pocketCollars,
    productMeshes,
    pitchX,
    pitchY,
    workingHeight,
    pocketDepth,
    productHeight,
    inventorySignature: '',
  };
}

export function updateStaticMagazineRig(rig: StaticMagazineRig, magazine?: MagazineData): void {
  updateProducts(rig, magazine);
}
