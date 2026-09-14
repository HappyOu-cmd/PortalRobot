import * as THREE from 'three';
import type { ButtonStationState } from '../model/buttonStations';
import { material } from './primitives';
import { addButtonCylinder } from './buttonParts';
import { createEmergencyStopButton, updateEmergencyStopButton, type EmergencyStopButtonRig } from './emergencyStopButton';
import { createIlluminatedPushButton, updateIlluminatedPushButton, type IlluminatedPushButtonRig } from './illuminatedPushButton';

export interface ButtonStationRig {
  root: THREE.Group;
  emergencyStop: EmergencyStopButtonRig;
  button: IlluminatedPushButtonRig;
}

function roundedBox(width: number, height: number, depth: number, radius: number, holeYs: readonly number[] = []) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  for (const holeY of holeYs) {
    const hole = new THREE.Path();
    hole.absarc(0, holeY, 0.011, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4, steps: 1 });
}

/** Reusable empty two-hole enclosure. Back at Z=0, lid at Z=0.062. */
export function createButtonStationHousing(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Button_station_housing';
  const back = new THREE.Mesh(roundedBox(0.100, 0.185, 0.050, 0.012),
    material(0x30383e, { roughness: 0.6 }));
  back.name = 'dark_station_base';
  back.castShadow = true;
  root.add(back);
  const lidGeometry = roundedBox(0.102, 0.185, 0.012, 0.012, [-0.040, 0.040]);
  // Cutouts stay part of the housing, so either button can be reused or replaced.
  const lid = new THREE.Mesh(lidGeometry, material(0xc4c9c9, { roughness: 0.48, metalness: 0.18 }));
  lid.name = 'grey_station_lid';
  lid.position.z = 0.050;
  lid.castShadow = true;
  lid.receiveShadow = true;
  root.add(lid);
  const dark = material(0x252a2d, { roughness: 0.4, metalness: 0.45 });
  for (const x of [-0.038, 0.038]) {
    for (const y of [-0.079, 0.079]) {
      const screw = addButtonCylinder(root, 'lid_screw', 0.0045, 0.002, 0.063, dark);
      screw.position.set(x, y, 0.063);
    }
  }
  return root;
}

/** Two-button post facing local +Z, centred vertically on its mounting point. */
export function createButtonStation(): ButtonStationRig {
  const root = new THREE.Group();
  root.name = 'Button_station';
  root.add(createButtonStationHousing());
  const emergencyStop = createEmergencyStopButton();
  emergencyStop.root.position.set(0, 0.040, 0.063);
  const button = createIlluminatedPushButton();
  button.root.position.set(0, -0.040, 0.063);
  root.add(emergencyStop.root, button.root);
  return { root, emergencyStop, button };
}

export function updateButtonStation(
  rig: ButtonStationRig, state: ButtonStationState, elapsed: number, reducedMotion = false,
): void {
  updateEmergencyStopButton(rig.emergencyStop, state.emergencyStopPressed, elapsed, reducedMotion);
  updateIlluminatedPushButton(rig.button, state.buttonPressed, state.buttonLightOn);
}
