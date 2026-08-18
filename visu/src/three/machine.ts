import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import machineModelUrl from '../assets/models/Headman.glb?url';
import { PART_GEOMETRY } from '../model/partGeometry';
import type { CellLayout, MachineState } from '../model/types';
import { COLORS, cylinder, damp, logicalPosition, mm, PRODUCT_PART_COLORS } from './primitives';
import { OilMistEffect } from './OilMistEffect';

const MODEL_DOOR_TRAVEL = 1.01;
const DEFAULT_DOOR_TRAVEL_MM = 1120;
const DOOR_CLOSE_CORRECTION = 0.16;
const DOOR_WIDTH_SCALE = 1.16;

interface MachineTemplate {
  scene: THREE.Group;
  bounds: THREE.Box3;
  size: THREE.Vector3;
}

export interface MachineRig {
  root: THREE.Group;
  door?: THREE.Object3D;
  hatch?: THREE.Object3D;
  chuck?: THREE.Object3D;
  doorOpenX: number;
  doorClosedX: number;
  hatchOpenX: number;
  hatchClosedX: number;
  doorValue: number;
  part: THREE.Group;
  blankPart: THREE.Group;
  detailPart: THREE.Group;
  unknownPart: THREE.Group;
  redLights: THREE.MeshStandardMaterial[];
  greenLights: THREE.MeshStandardMaterial[];
  oilMist?: OilMistEffect;
  disposed: boolean;
  selection: THREE.LineSegments;
}

const machineTemplate = new GLTFLoader().loadAsync(machineModelUrl).then((gltf): MachineTemplate => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  return { scene, bounds, size: bounds.getSize(new THREE.Vector3()) };
});

function markClickable(root: THREE.Object3D, machineIndex: number): void {
  root.traverse((object) => {
    object.userData.machineIndex = machineIndex;
  });
}

function cloneModel(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((item) => item.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

function partCylinder(name: string, radius: number, length: number, color: number, offsetX = 0): THREE.Mesh {
  const mesh = cylinder(name, radius, length, color, new THREE.Vector3(offsetX, 0, 0));
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function createPartAssembly() {
  const root = new THREE.Group();
  root.name = 'visualized_workpiece';
  root.position.set(0.14, 0, 0);

  const blank = new THREE.Group();
  blank.add(partCylinder('blank_body', PART_GEOMETRY.blank.radius, PART_GEOMETRY.blank.length, COLORS.blank));
  root.add(blank);

  const detail = new THREE.Group();
  detail.add(partCylinder('detail_body', PART_GEOMETRY.detail.bodyRadius, PART_GEOMETRY.detail.bodyLength, COLORS.detail));
  detail.add(partCylinder(
    'detail_shoulder',
    PART_GEOMETRY.detail.shoulderRadius,
    PART_GEOMETRY.detail.shoulderLength,
    0x6cc194,
    PART_GEOMETRY.detail.shoulderOffset,
  ));
  root.add(detail);

  const unknown = new THREE.Group();
  unknown.add(partCylinder('unknown_part', PART_GEOMETRY.blank.radius, PART_GEOMETRY.blank.length, COLORS.steel));
  root.add(unknown);
  return { root, blank, detail, unknown };
}

function lampMaterials(root: THREE.Object3D, materialName: string): THREE.MeshStandardMaterial[] {
  const result: THREE.MeshStandardMaterial[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((item) => {
      if (item.name === materialName && item instanceof THREE.MeshStandardMaterial) result.push(item);
    });
  });
  return result;
}

function configureMachineModel(rig: MachineRig, template: MachineTemplate, layout: CellLayout, index: number): void {
  if (rig.disposed) return;
  const model = cloneModel(template.scene);
  const scaleX = mm(layout.machine.sizeX) / template.size.x;
  const scaleY = mm(layout.machine.sizeZ) / template.size.y;
  const scaleZ = mm(layout.machine.sizeY) / template.size.z;
  model.scale.set(scaleX, scaleY, scaleZ);
  model.position.set(
    -template.bounds.min.x * scaleX,
    -template.bounds.min.y * scaleY,
    -template.bounds.max.z * scaleZ,
  );
  model.name = `Headman_${index + 1}`;

  rig.door = model.getObjectByName('Door-1');
  rig.hatch = model.getObjectByName('Hatch-1');
  rig.chuck = model.getObjectByName('Chuck-1');
  const travel = MODEL_DOOR_TRAVEL * layout.machine.doorTravel / DEFAULT_DOOR_TRAVEL_MM;
  if (rig.door) {
    rig.doorOpenX = rig.door.position.x;
    rig.doorClosedX = rig.doorOpenX + travel - DOOR_CLOSE_CORRECTION;
    rig.door.position.x = rig.doorClosedX;
    // Pivot Door-1 находится на левом краю, поэтому расширение закрывает правую щель.
    rig.door.scale.x = DOOR_WIDTH_SCALE;
  }
  if (rig.hatch) {
    rig.hatchOpenX = rig.hatch.position.x;
    rig.hatchClosedX = rig.hatchOpenX + travel;
    rig.hatch.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((item) => {
        if (!(item instanceof THREE.MeshStandardMaterial)) return;
        item.color.setHex(COLORS.white);
        item.emissive.setHex(0x000000);
        item.metalness = 0.08;
        item.roughness = 0.48;
      });
    });
  }

  if (rig.chuck) rig.chuck.add(rig.part);
  if (rig.chuck && rig.door) rig.oilMist = new OilMistEffect(model, rig.chuck, rig.door);
  rig.redLights = lampMaterials(model, 'red_neon_tube');
  rig.greenLights = lampMaterials(model, 'green_neon_tube');
  markClickable(model, index);
  rig.root.add(model);
}

export function createMachine(layout: CellLayout, index: number): MachineRig {
  const width = mm(layout.machine.sizeX);
  const depth = mm(layout.machine.sizeY);
  const height = mm(layout.machine.sizeZ);
  const root = new THREE.Group();
  root.name = `CNC_${index + 1}`;
  root.position.copy(logicalPosition(
    layout.machine.machines[index].position.x,
    layout.machine.machines[index].position.y,
    layout.machine.machines[index].position.z,
  ));

  const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.08, height + 0.08, depth + 0.08));
  const selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: COLORS.blue }));
  selection.position.set(width / 2, height / 2, -depth / 2);
  selection.visible = false;
  root.add(selection);

  const part = createPartAssembly();
  const rig: MachineRig = {
    root,
    doorOpenX: 0,
    doorClosedX: 0,
    hatchOpenX: 0,
    hatchClosedX: 0,
    doorValue: 0,
    part: part.root,
    blankPart: part.blank,
    detailPart: part.detail,
    unknownPart: part.unknown,
    redLights: [],
    greenLights: [],
    disposed: false,
    selection,
  };

  void machineTemplate.then((template) => configureMachineModel(rig, template, layout, index));
  return rig;
}

function setLamp(materialValue: THREE.MeshStandardMaterial, color: number, active: boolean): void {
  const visibleColor = active ? color : 0x59636b;
  materialValue.color.setHex(visibleColor);
  materialValue.emissive.setHex(active ? color : 0x000000);
  materialValue.emissiveIntensity = active ? 1.6 : 0;
}

function setObjectColor(object: THREE.Object3D, color: number): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const meshMaterial = child.material;
    if (meshMaterial instanceof THREE.MeshStandardMaterial) meshMaterial.color.setHex(color);
  });
}

export function updateMachineRig(rig: MachineRig, state: MachineState, dt: number, response: number): void {
  let doorTarget = rig.doorValue;
  if (state.doorOpen && !state.doorClosed) doorTarget = 1;
  if (state.doorClosed && !state.doorOpen) doorTarget = 0;
  rig.doorValue = damp(rig.doorValue, doorTarget, response, dt);
  if (rig.door) rig.door.position.x = rig.doorClosedX;
  if (rig.hatch) rig.hatch.position.x = THREE.MathUtils.lerp(rig.hatchClosedX, rig.hatchOpenX, rig.doorValue);

  if (rig.chuck && state.mode === 'processing') rig.chuck.rotation.x += dt * 13.5;

  rig.part.visible = state.partPresent;
  rig.blankPart.visible = state.partType === 'BLANK';
  rig.detailPart.visible = state.partType === 'DETAIL';
  rig.unknownPart.visible = state.partType === 'UNKNOWN';
  const colors = PRODUCT_PART_COLORS[state.productType] ?? PRODUCT_PART_COLORS[1];
  setObjectColor(rig.blankPart, colors.blank);
  setObjectColor(rig.detailPart, colors.detail);

  const error = state.mode === 'error';
  const activeColor = state.mode === 'processing' ? COLORS.green : state.mode === 'change' ? COLORS.amber : COLORS.amber;
  rig.redLights.forEach((item) => setLamp(item, COLORS.red, error));
  rig.greenLights.forEach((item) => setLamp(item, activeColor, !error && state.mode !== 'off'));
  rig.oilMist?.setActive(state.mode === 'processing');
  rig.oilMist?.update(dt);
}

export function disposeMachineRig(rig: MachineRig): void {
  rig.disposed = true;
  rig.oilMist?.dispose();
  rig.oilMist = undefined;
}
