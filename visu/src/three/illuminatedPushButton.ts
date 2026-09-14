import * as THREE from 'three';
import { material } from './primitives';
import { addButtonCylinder, createButtonGlow } from './buttonParts';

export type PushButtonColor = 'green' | 'red' | 'yellow';

const BUTTON_COLORS = {
  green: { rest: 0x075526, active: 0x39ff6b, emissive: 0x14ff55, halo: 0x12e84b },
  red: { rest: 0x8f101b, active: 0xff4232, emissive: 0xff2515, halo: 0xff3020 },
  yellow: { rest: 0x9a7209, active: 0xffd847, emissive: 0xffc528, halo: 0xffcc35 },
} as const;

export interface IlluminatedPushButtonRig {
  root: THREE.Group;
  lens: THREE.Mesh;
  surface: THREE.MeshStandardMaterial;
  glow: ReturnType<typeof createButtonGlow>;
  color: PushButtonColor;
}

/** Standalone coloured pushbutton. Input travel and output illumination are independent. */
export function createIlluminatedPushButton(color: PushButtonColor = 'green'): IlluminatedPushButtonRig {
  const palette = BUTTON_COLORS[color];
  const root = new THREE.Group();
  root.name = 'Illuminated_push_button';
  addButtonCylinder(root, 'button_gasket', 0.024, 0.004, 0.002,
    material(0x24282c, { roughness: 0.65 }));
  addButtonCylinder(root, 'steel_button_bezel', 0.021, 0.009, 0.007,
    material(0xaab3b8, { metalness: 0.78, roughness: 0.28 }));
  const surface = material(palette.rest, {
    roughness: 0.22, metalness: 0.05, emissive: palette.emissive, emissiveIntensity: 0,
  });
  const lens = addButtonCylinder(root, `${color}_moving_lens`, 0.0175, 0.006, 0.013, surface);
  const glow = createButtonGlow(palette.halo, 0.11);
  glow.position.z = 0.018;
  root.add(glow);
  return { root, lens, surface, glow, color };
}

export function updateIlluminatedPushButton(
  rig: IlluminatedPushButtonRig, pressed: boolean, lightOn: boolean,
): void {
  rig.lens.position.z = pressed ? 0.009 : 0.013;
  const palette = BUTTON_COLORS[rig.color];
  rig.surface.color.set(lightOn ? palette.active : palette.rest);
  rig.surface.emissiveIntensity = lightOn ? 1.25 : 0;
  rig.glow.visible = lightOn;
  rig.glow.material.uniforms.strength.value = lightOn ? 0.48 : 0;
}
