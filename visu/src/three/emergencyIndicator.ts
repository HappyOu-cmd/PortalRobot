import * as THREE from 'three';
import { createButtonGlow, EMERGENCY_BUTTON_COLORS, emergencyButtonPulse, updateEmergencyButtonGlow, updateEmergencyButtonSurface } from './buttonParts';

export interface EmergencyIndicatorRig {
  surfaces: { surface: THREE.MeshStandardMaterial; restColor: THREE.Color }[];
  glow: ReturnType<typeof createButtonGlow>;
}

/** Geometry keeps its normal colours when idle; alarm lighting matches the mushroom. */
export function createEmergencyIndicator(
  parent: THREE.Object3D, surfaces: THREE.MeshStandardMaterial[], width: number, height: number, z: number,
): EmergencyIndicatorRig {
  const glow = createButtonGlow(EMERGENCY_BUTTON_COLORS.halo, width);
  glow.scale.y = height / width;
  glow.position.z = z;
  parent.add(glow);
  return { glow, surfaces: surfaces.map((surface) => ({ surface, restColor: surface.color.clone() })) };
}

export function updateEmergencyIndicator(rig: EmergencyIndicatorRig, active: boolean, elapsed: number, reducedMotion: boolean): void {
  const pulse = emergencyButtonPulse(elapsed, reducedMotion);
  for (const { surface, restColor } of rig.surfaces) updateEmergencyButtonSurface(surface, active, pulse, restColor);
  updateEmergencyButtonGlow(rig.glow, active, pulse);
}
