import * as THREE from 'three';
import { material } from './primitives';
import { addButtonCylinder, createButtonGlow, EMERGENCY_BUTTON_COLORS, emergencyButtonPulse, updateEmergencyButtonGlow, updateEmergencyButtonSurface } from './buttonParts';

const REST_RED = new THREE.Color(EMERGENCY_BUTTON_COLORS.rest);

export interface EmergencyStopButtonRig {
  root: THREE.Group;
  head: THREE.Group;
  surface: THREE.MeshStandardMaterial;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  glow: ReturnType<typeof createButtonGlow>;
}

/** Standalone mushroom with a yellow backing disc, facing local +Z. */
export function createEmergencyStopButton(): EmergencyStopButtonRig {
  const root = new THREE.Group();
  root.name = 'Emergency_stop_button';
  addButtonCylinder(root, 'yellow_backing_disc', 0.035, 0.005, 0.0025,
    material(0xf5cb12, { roughness: 0.48 }));
  addButtonCylinder(root, 'black_button_collar', 0.017, 0.012, 0.011,
    material(0x24282c, { roughness: 0.45 }));

  const head = new THREE.Group();
  head.name = 'mushroom_moving_head';
  root.add(head);
  const surface = material(REST_RED.getHex(), {
    roughness: 0.3, metalness: 0.08, emissive: 0xff1608, emissiveIntensity: 0,
  });
  addButtonCylinder(head, 'mushroom_stem', 0.012, 0.016, 0.020, surface);
  const profile = [
    [0, 0.023], [0.020, 0.023], [0.024, 0.026],
    [0.025, 0.032], [0.023, 0.038], [0.018, 0.040], [0, 0.040],
  ].map(([radius, z]) => new THREE.Vector2(radius, z));
  const cap = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), surface);
  cap.name = 'red_mushroom_cap';
  cap.rotation.x = Math.PI / 2;
  cap.castShadow = true;
  head.add(cap);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.038, 0.044, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe9ad, toneMapped: false }));
  ring.name = 'emergency_contrast_ring';
  ring.position.z = 0.006;
  ring.visible = false;
  root.add(ring);
  const glow = createButtonGlow(EMERGENCY_BUTTON_COLORS.halo, 0.18);
  glow.position.z = 0.007;
  root.add(glow);
  return { root, head, surface, ring, glow };
}

export function updateEmergencyStopButton(
  rig: EmergencyStopButtonRig, pressed: boolean, elapsed: number, reducedMotion = false,
): void {
  // One flash per second; reduced-motion users get a steady, bright indication.
  const pulse = emergencyButtonPulse(elapsed, reducedMotion);
  const bright = pulse === 1;
  rig.head.position.z = pressed ? -0.008 : 0;
  updateEmergencyButtonSurface(rig.surface, pressed, pulse, REST_RED);
  rig.ring.visible = pressed;
  rig.ring.material.color.set(bright ? 0xfff2bb : 0x85100a);
  updateEmergencyButtonGlow(rig.glow, pressed, pulse);
}
