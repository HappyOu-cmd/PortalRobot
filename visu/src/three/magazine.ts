import * as THREE from 'three';
import type { CellLayout, SlotType } from '../model/types';
import { box, COLORS, cylinder, logicalPosition, makeLabel, material, mm } from './primitives';

interface SlotRig {
  emptyRing: THREE.Mesh;
  blank: THREE.Mesh;
  detail: THREE.Group;
}

export interface MagazineRig {
  root: THREE.Group;
  slots: SlotRig[];
}

export function createMagazine(layout: CellLayout): MagazineRig {
  const config = layout.magazine;
  const sizeX = mm(config.sizeX);
  const sizeY = mm(config.sizeY);
  const sizeZ = mm(config.sizeZ);
  const root = new THREE.Group();
  root.name = 'Magazine';
  root.position.copy(logicalPosition(config.position.x, config.position.y, config.position.z));
  const tableTopThickness = 0.075;
  const tableOverhang = 0.12;
  const tableTopY = -sizeZ / 2 - tableTopThickness / 2;
  const tableLegHeight = Math.max(0.12, mm(config.position.z) - sizeZ / 2 - tableTopThickness);
  const tableLegY = tableLegHeight / 2 - mm(config.position.z);
  const tableWidth = sizeX + tableOverhang * 2;
  const tableDepth = sizeY + tableOverhang * 2;
  root.add(box('magazine_table_top', new THREE.Vector3(tableWidth, tableTopThickness, tableDepth), COLORS.graphite, new THREE.Vector3(sizeX / 2, tableTopY, -sizeY / 2), { metalness: 0.2, roughness: 0.5 }));
  const legInset = 0.1;
  [[legInset, -legInset], [sizeX - legInset, -legInset], [legInset, -sizeY + legInset], [sizeX - legInset, -sizeY + legInset]].forEach(([x, z], index) => {
    root.add(box(`magazine_table_leg_${index + 1}`, new THREE.Vector3(0.075, tableLegHeight, 0.075), 0x40515e, new THREE.Vector3(x, tableLegY, z), { metalness: 0.24, roughness: 0.48 }));
    root.add(box(`magazine_table_foot_${index + 1}`, new THREE.Vector3(0.13, 0.035, 0.13), COLORS.charcoal, new THREE.Vector3(x, -mm(config.position.z) + 0.018, z)));
  });
  root.add(box('magazine_base', new THREE.Vector3(sizeX, sizeZ, sizeY), 0x6d7e8b, new THREE.Vector3(sizeX / 2, 0, -sizeY / 2), { metalness: 0.28, roughness: 0.42 }));

  const marginX = Math.min(sizeX * 0.08, 0.07);
  const marginY = Math.min(sizeY * 0.08, 0.09);
  const pitchX = config.columnsX > 1 ? (sizeX - marginX * 2) / (config.columnsX - 1) : 0;
  const pitchY = config.rowsY > 1 ? (sizeY - marginY * 2) / (config.rowsY - 1) : 0;
  const slotRadius = mm(config.slotDiameter) / 2;
  const slots: SlotRig[] = [];

  for (let row = 0; row < config.rowsY; row += 1) {
    for (let column = 0; column < config.columnsX; column += 1) {
      const x = marginX + column * pitchX;
      const z = -(marginY + row * pitchY);
      const emptyRing = new THREE.Mesh(
        new THREE.TorusGeometry(slotRadius, Math.max(0.008, slotRadius * 0.12), 10, 24),
        material(COLORS.empty, { metalness: 0.25, roughness: 0.4 }),
      );
      emptyRing.name = `slot_${row + 1}_${column + 1}`;
      emptyRing.rotation.x = Math.PI / 2;
      emptyRing.position.set(x, sizeZ / 2 + 0.008, z);
      root.add(emptyRing);

      const blank = cylinder('blank', slotRadius * 0.76, slotRadius * 1.2, COLORS.blank, new THREE.Vector3(x, sizeZ / 2 + slotRadius * 0.6, z), 20);
      root.add(blank);

      const detail = new THREE.Group();
      detail.position.set(x, sizeZ / 2, z);
      detail.add(cylinder('detail_body', slotRadius * 0.62, slotRadius * 1.45, COLORS.detail, new THREE.Vector3(0, slotRadius * 0.72, 0), 20));
      detail.add(cylinder('detail_shoulder', slotRadius * 0.84, slotRadius * 0.36, 0x69c293, new THREE.Vector3(0, slotRadius * 1.35, 0), 20));
      root.add(detail);
      slots.push({ emptyRing, blank, detail });
    }
  }

  const label = makeLabel('МАГАЗИН');
  label.position.set(sizeX / 2, -mm(config.position.z) + 0.025, 0.42);
  label.scale.set(1.25, 0.31, 1);
  root.add(label);
  return { root, slots };
}

export function updateMagazineRig(rig: MagazineRig, states: SlotType[]): void {
  rig.slots.forEach((slot, index) => {
    const state = states[index] ?? 'empty';
    slot.emptyRing.visible = state === 'empty';
    slot.blank.visible = state === 'blank';
    slot.detail.visible = state === 'detail';
  });
}
