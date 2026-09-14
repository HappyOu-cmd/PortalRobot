import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import machineModelUrl from '../assets/models/Headman.glb?url';
import type { CellLayout, MachineState, PartGeometryLayout } from '../model/types';
import {
  alarmPulse,
  applyPartMaterial,
  collectAlarmSurfaceMaterials,
  COLORS,
  cylinder,
  damp,
  logicalPosition,
  mm,
  setAlarmSurfaceMaterials,
  type AlarmSurfaceMaterial,
} from './primitives';
import { OilMistEffect } from './OilMistEffect';
import { createMachineHatch, updateMachineHatch, type MachineHatchRig } from './machineHatch';

const MODEL_DOOR_TRAVEL = 1.01;
const DEFAULT_DOOR_TRAVEL_MM = 1120;
const DOOR_CLOSE_CORRECTION = 0.16;
const DOOR_WIDTH_SCALE = 1.16;
// Visual installation correction from the reference: move the whole machine
// down by 50 mm without changing the cell layout or enclosure coordinates.
const MACHINE_VERTICAL_OFFSET_MM = -50;

// Native Headman.glb enclosure faces; the conveyor, control panel and beacon
// project beyond these bounds and must not define the configured body size.
const MODEL_BODY_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-1.4025, 0, -0.835),
  new THREE.Vector3(1.4025, 1.78, 0.835),
);
const MODEL_BODY_SIZE = MODEL_BODY_BOUNDS.getSize(new THREE.Vector3());

interface MachineTemplate {
  scene: THREE.Group;
}

export interface MachineRig {
  root: THREE.Group;
  door?: THREE.Object3D;
  hatch?: THREE.Object3D;
  hatchMechanism?: MachineHatchRig;
  chuck?: THREE.Object3D;
  doorOpenX: number;
  doorClosedX: number;
  hatchOpenX: number;
  hatchClosedX: number;
  doorValue: number;
  hatchValue: number;
  part: THREE.Group;
  blankPart: THREE.Group;
  detailPart: THREE.Group;
  unknownPart: THREE.Group;
  redLights: THREE.MeshStandardMaterial[];
  greenLights: THREE.MeshStandardMaterial[];
  alarmSurfaceMaterials: AlarmSurfaceMaterial[];
  alarmElapsed: number;
  reducedMotion: boolean;
  oilMist?: OilMistEffect;
  disposed: boolean;
  selection: THREE.LineSegments;
}

const machineTemplate = new GLTFLoader().loadAsync(machineModelUrl).then((gltf): MachineTemplate => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  return { scene };
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

function createPartAssembly(geometry: PartGeometryLayout) {
  const root = new THREE.Group();
  root.name = 'visualized_workpiece';
  root.position.set(0.14, 0, 0);

  const blank = new THREE.Group();
  blank.add(partCylinder('blank_body', mm(geometry.diameter) / 2, mm(geometry.length), COLORS.blank));
  root.add(blank);

  const detail = new THREE.Group();
  detail.add(partCylinder('detail_body', mm(geometry.diameter) / 2, mm(geometry.length), COLORS.detail));
  root.add(detail);

  const unknown = new THREE.Group();
  unknown.add(partCylinder('unknown_part', mm(geometry.diameter) / 2, mm(geometry.length), COLORS.steel));
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
  const scaleX = mm(layout.machine.sizeX) / MODEL_BODY_SIZE.x;
  const scaleY = mm(layout.machine.sizeZ) / MODEL_BODY_SIZE.y;
  const scaleZ = mm(layout.machine.sizeY) / MODEL_BODY_SIZE.z;
  model.scale.set(scaleX, scaleY, scaleZ);
  model.position.set(
    -MODEL_BODY_BOUNDS.min.x * scaleX,
    -MODEL_BODY_BOUNDS.min.y * scaleY,
    -MODEL_BODY_BOUNDS.max.z * scaleZ,
  );
  model.name = `Headman_${index + 1}`;

  rig.door = model.getObjectByName('Door-1');
  rig.hatch = model.getObjectByName('Hatch-1');
  rig.chuck = model.getObjectByName('Chuck-1');
  const body = model.getObjectByName('CNC-1');
  const bodyAlarmSurfaceMaterials = body ? collectAlarmSurfaceMaterials(body, 'whitecarpaint') : [];
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
  if (rig.hatch && rig.door) {
    rig.hatchMechanism = createMachineHatch(model, rig.hatch, rig.door, travel, MODEL_BODY_BOUNDS.max.y);
    rig.hatch = rig.hatchMechanism.slide;
    rig.hatchClosedX = rig.hatchMechanism.closedX;
    rig.hatchOpenX = rig.hatchMechanism.openX;
  }
  rig.alarmSurfaceMaterials = [
    ...bodyAlarmSurfaceMaterials,
    ...(rig.door ? collectAlarmSurfaceMaterials(rig.door, 'whitecarpaint') : []),
    ...(rig.hatch ? collectAlarmSurfaceMaterials(rig.hatch) : []),
  ];

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
    layout.machine.machines[index].position.z + MACHINE_VERTICAL_OFFSET_MM,
  ));

  const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.08, height + 0.08, depth + 0.08));
  const selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: COLORS.blue }));
  selection.position.set(width / 2, height / 2, -depth / 2);
  selection.visible = false;
  root.add(selection);

  const part = createPartAssembly(layout.partGeometry);
  const rig: MachineRig = {
    root,
    doorOpenX: 0,
    doorClosedX: 0,
    hatchOpenX: 0,
    hatchClosedX: 0,
    doorValue: 0,
    hatchValue: 0,
    part: part.root,
    blankPart: part.blank,
    detailPart: part.detail,
    unknownPart: part.unknown,
    redLights: [],
    greenLights: [],
    alarmSurfaceMaterials: [],
    alarmElapsed: 0,
    reducedMotion: typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
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

export function updateMachineRig(
  rig: MachineRig,
  state: MachineState,
  dt: number,
  layout: CellLayout,
  alarmTargetActive = false,
  inspecting = false,
): void {
  const response = layout.animation.mechanismResponse;
  let doorTarget = rig.doorValue;
  if (state.doorOpen && !state.doorClosed) doorTarget = 1;
  if (state.doorClosed && !state.doorOpen) doorTarget = 0;
  rig.doorValue = damp(rig.doorValue, doorTarget, response, dt);
  if (rig.door) rig.door.position.x = THREE.MathUtils.lerp(rig.doorClosedX, rig.doorOpenX, rig.doorValue);

  let hatchTarget = rig.hatchValue;
  if (state.hatchOpen && !state.hatchClosed) hatchTarget = 1;
  if (state.hatchClosed && !state.hatchOpen) hatchTarget = 0;
  rig.hatchValue = damp(rig.hatchValue, hatchTarget, response, dt);
  if (rig.hatch) rig.hatch.position.x = THREE.MathUtils.lerp(rig.hatchClosedX, rig.hatchOpenX, rig.hatchValue);
  if (rig.hatchMechanism) updateMachineHatch(rig.hatchMechanism, state.hatchLocked);

  if (rig.chuck && state.mode === 'processing') rig.chuck.rotation.x += dt * 13.5;

  rig.part.visible = state.partPresent;
  rig.blankPart.visible = state.partType === 'BLANK';
  rig.detailPart.visible = state.partType === 'DETAIL';
  rig.unknownPart.visible = state.partType === 'UNKNOWN';
  const materials = layout.productPartMaterials[state.productType - 1] ?? layout.productPartMaterials[0];
  applyPartMaterial(rig.blankPart, materials.blank);
  applyPartMaterial(rig.detailPart, materials.detail);

  const error = state.mode === 'error';
  const activeColor = state.mode === 'processing' ? COLORS.green : state.mode === 'change' ? COLORS.amber : COLORS.amber;
  rig.redLights.forEach((item) => setLamp(item, COLORS.red, error));
  rig.greenLights.forEach((item) => setLamp(item, activeColor, !error && state.mode !== 'off'));
  const alarm = alarmTargetActive || state.alarm || error || state.activeErrors.length > 0;
  rig.alarmElapsed = alarm ? rig.alarmElapsed + dt : 0;
  setAlarmSurfaceMaterials(
    rig.alarmSurfaceMaterials,
    alarm && !inspecting,
    alarmPulse(rig.alarmElapsed, rig.reducedMotion),
    rig.alarmElapsed,
    rig.reducedMotion,
  );
  rig.oilMist?.setActive(state.mode === 'processing');
  rig.oilMist?.update(dt);
}

export function disposeMachineRig(rig: MachineRig): void {
  rig.disposed = true;
  rig.oilMist?.dispose();
  rig.oilMist = undefined;
}
