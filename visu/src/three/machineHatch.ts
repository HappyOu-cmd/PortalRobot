import * as THREE from 'three';
import { box, COLORS, cylinder } from './primitives';

export interface MachineHatchRig {
  slide: THREE.Group;
  closedX: number;
  openX: number;
  lock: THREE.Group;
  bolt: THREE.Mesh;
  boltLockedX: number;
  keeper: THREE.Mesh;
  keeperClosedX: number;
  actuator: THREE.Group;
  rod: THREE.Mesh;
  clevis: THREE.Mesh;
  rodStartX: number;
  clevisClosedX: number;
}

function axialCylinder(name: string, radius: number, length: number, color: number,
  x: number, y: number, z: number): THREE.Mesh {
  const mesh = cylinder(name, radius, length, color, new THREE.Vector3(x, y, z));
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

export function createMachineHatch(model: THREE.Group, panel: THREE.Object3D, door: THREE.Object3D,
  travel: number, roofY: number): MachineHatchRig {
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert();
  const source = new THREE.Box3().setFromObject(panel).applyMatrix4(inverse);
  const doorBounds = new THREE.Box3().setFromObject(door).applyMatrix4(inverse);
  // Door-1 front sheet in the native GLB; the handle extends further forward.
  const frontZ = door.position.z + 0.2775;
  const target = new THREE.Box3(
    new THREE.Vector3(doorBounds.min.x, doorBounds.max.y, source.min.z),
    new THREE.Vector3(doorBounds.max.x, roofY, frontZ),
  );
  // Hatch-1 is rotated 90 degrees. Fit the original mesh in enclosure axes:
  // match the door width, meet its top edge and extend to its front sheet.
  const slide = new THREE.Group();
  slide.name = 'robot_hatch_slide';
  panel.parent!.add(slide);
  slide.add(panel);
  slide.scale.copy(target.getSize(new THREE.Vector3()).divide(source.getSize(new THREE.Vector3())));
  slide.position.copy(target.min).sub(source.min.clone().multiply(slide.scale));

  const lock = new THREE.Group();
  lock.name = 'hatch_lock';
  const lockX = target.max.x + 0.075;
  const lockZ = frontZ - 0.12;
  lock.add(box('hatch_lock_mount', new THREE.Vector3(0.16, 0.018, 0.15), COLORS.steel,
    new THREE.Vector3(lockX, roofY + 0.009, lockZ)));
  lock.add(box('hatch_lock_housing', new THREE.Vector3(0.105, 0.075, 0.1), COLORS.graphite,
    new THREE.Vector3(lockX, roofY + 0.055, lockZ)));
  lock.add(box('hatch_lock_cover', new THREE.Vector3(0.075, 0.009, 0.074), COLORS.amber,
    new THREE.Vector3(lockX, roofY + 0.097, lockZ)));
  const bolt = axialCylinder('hatch_lock_bolt', 0.012, 0.105, COLORS.silver,
    target.max.x + 0.006, roofY + 0.055, lockZ);
  const keeper = box('hatch_lock_keeper', new THREE.Vector3(0.045, 0.07, 0.072), COLORS.steel,
    new THREE.Vector3(target.max.x - 0.045, roofY + 0.035, lockZ));
  lock.add(bolt, keeper);
  model.add(lock);

  const actuator = new THREE.Group();
  actuator.name = 'hatch_pneumatic_cylinder';
  const axisY = roofY + 0.085;
  // The fixed cylinder lies behind the hatch, with its rod pointing along -X.
  const axisZ = target.min.z - 0.085;
  const clevisClosedX = target.min.x + 0.1;
  const rodStartX = clevisClosedX + 0.075;
  const barrelLength = travel + 0.15;
  actuator.add(axialCylinder('hatch_cylinder_barrel', 0.047, barrelLength, COLORS.steel,
    rodStartX + barrelLength / 2, axisY, axisZ));
  for (const x of [rodStartX, rodStartX + barrelLength]) {
    actuator.add(box('hatch_cylinder_end_cap', new THREE.Vector3(0.035, 0.11, 0.11), COLORS.graphite,
      new THREE.Vector3(x, axisY, axisZ)));
    actuator.add(box('hatch_cylinder_mount', new THREE.Vector3(0.07, 0.04, 0.14), COLORS.steel,
      new THREE.Vector3(x, roofY + 0.02, axisZ)));
    actuator.add(cylinder('hatch_cylinder_air_port', 0.013, 0.035, COLORS.blue,
      new THREE.Vector3(x, axisY + 0.068, axisZ), 12));
  }
  const rod = axialCylinder('hatch_cylinder_rod', 0.018, 1, COLORS.silver,
    rodStartX, axisY, axisZ);
  const clevis = box('hatch_cylinder_clevis', new THREE.Vector3(0.055, 0.105, 0.18), COLORS.graphite,
    new THREE.Vector3(clevisClosedX, roofY + 0.055, axisZ + 0.065));
  actuator.add(rod, clevis);
  model.add(actuator);

  const rig: MachineHatchRig = { slide, closedX: slide.position.x, openX: slide.position.x - travel,
    lock, bolt, boltLockedX: bolt.position.x, keeper, keeperClosedX: keeper.position.x,
    actuator, rod, clevis, rodStartX, clevisClosedX };
  updateMachineHatch(rig, false);
  return rig;
}

export function updateMachineHatch(rig: MachineHatchRig, locked: boolean): void {
  const offset = rig.slide.position.x - rig.closedX;
  rig.keeper.position.x = rig.keeperClosedX + offset;
  rig.bolt.position.x = rig.boltLockedX + (locked ? 0 : 0.075);
  rig.clevis.position.x = rig.clevisClosedX + offset;
  rig.rod.scale.y = Math.max(0.025, rig.rodStartX - rig.clevis.position.x);
  rig.rod.position.x = (rig.rodStartX + rig.clevis.position.x) / 2;
}
