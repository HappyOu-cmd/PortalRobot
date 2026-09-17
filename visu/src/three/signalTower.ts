import * as THREE from 'three';
import type { SignalTowerState } from '../model/controlCabinets';
import { createButtonGlow, EMERGENCY_BUTTON_COLORS, updateEmergencyButtonGlow } from './buttonParts';
import { material } from './primitives';

interface SignalTowerSection {
  signal: keyof SignalTowerState;
  surface: THREE.MeshStandardMaterial;
  restColor: THREE.Color;
  activeColor: THREE.Color;
  glow: ReturnType<typeof createButtonGlow>;
}

export interface SignalTowerRig {
  root: THREE.Group;
  sections: SignalTowerSection[];
}

/** Reference tower: 70 mm lenses, white base/cap, mounting flange; local +Y is up. */
export function createSignalTower(): SignalTowerRig {
  const root = new THREE.Group();
  root.name = 'operator_cabinet_signal_tower';
  const white = material(0xe5e4dd, { roughness: 0.32, metalness: 0.08 });
  const steel = material(0xaeb5b7, { roughness: 0.3, metalness: 0.7 });
  const dark = material(0x535956, { roughness: 0.5 });
  const cylinder = (name: string, radius: number, height: number, y: number, surface: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 40), surface);
    mesh.name = name;
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  cylinder('tower_mounting_flange', 0.045, 0.012, 0.006, white);
  cylinder('tower_pole_socket', 0.020, 0.021, 0.0225, white);
  cylinder('tower_support_pole', 0.011, 0.065, 0.0605, steel);
  cylinder('tower_white_base', 0.035, 0.055, 0.1205, white);
  for (let index = 0; index < 3; index++) {
    const angle = index * Math.PI * 2 / 3;
    const recess = cylinder('tower_mounting_recess', 0.006, 0.001, 0.0122, dark);
    recess.position.x = Math.cos(angle) * 0.033;
    recess.position.z = Math.sin(angle) * 0.033;
    const screw = cylinder('tower_mounting_screw', 0.003, 0.0015, 0.013, steel);
    screw.position.x = recess.position.x;
    screw.position.z = recess.position.z;
  }

  const colors = [
    { signal: 'green' as const, rest: 0x087349, active: 0x00f052, emissive: 0x00ff42 },
    { signal: 'amber' as const, rest: 0xba850d, active: 0xffa500, emissive: 0xff8a00 },
    { signal: 'red' as const, rest: EMERGENCY_BUTTON_COLORS.rest,
      active: 0xff0812, emissive: 0xff0800 },
  ];
  const sections = colors.map(({ signal, rest, active, emissive }, index): SignalTowerSection => {
    const surface = material(rest, { roughness: 0.26, metalness: 0.08, emissive, emissiveIntensity: 0 });
    // One revolved mesh per lens gives the reference's horizontal ribs without dozens of meshes.
    const profile = [new THREE.Vector2(0, -0.032), new THREE.Vector2(0.034, -0.032)];
    for (let rib = 0; rib < 20; rib++) {
      const y = -0.032 + rib * 0.0032;
      profile.push(new THREE.Vector2(0.035, y + 0.0006),
        new THREE.Vector2(0.035, y + 0.002), new THREE.Vector2(0.034, y + 0.0032));
    }
    profile.push(new THREE.Vector2(0, 0.032));
    const lens = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), surface);
    lens.name = `tower_${signal}_ribbed_lens`;
    lens.position.y = 0.181 + index * 0.066;
    lens.castShadow = true;
    root.add(lens);
    cylinder(`tower_${signal}_joint`, 0.035, 0.002, lens.position.y - 0.033, surface);

    // Restore the original 190 mm halo around each active lens.
    const glow = createButtonGlow(emissive, 0.19);
    glow.name = `tower_${signal}_halo`;
    glow.position.y = lens.position.y;
    glow.scale.y = 0.8;
    const parentQuaternion = new THREE.Quaternion();
    const cameraQuaternion = new THREE.Quaternion();
    glow.onBeforeRender = (_renderer, _scene, camera) => {
      root.getWorldQuaternion(parentQuaternion);
      camera.getWorldQuaternion(cameraQuaternion);
      glow.quaternion.copy(parentQuaternion.invert()).multiply(cameraQuaternion);
      glow.updateMatrixWorld();
    };
    root.add(glow);
    return { signal, surface, restColor: new THREE.Color(rest), activeColor: new THREE.Color(active), glow };
  });
  cylinder('tower_white_top_cap', 0.0355, 0.012, 0.352, white);
  return { root, sections };
}

/** PLC owns both the operating mode and blink phase. The scene only displays the outputs. */
export function updateSignalTower(rig: SignalTowerRig, state: SignalTowerState): void {
  for (const section of rig.sections) {
    const active = state[section.signal];
    section.surface.color.copy(active ? section.activeColor : section.restColor);
    section.surface.emissiveIntensity = active ? 1.5 : 0;
    updateEmergencyButtonGlow(section.glow, active, 1);
  }
}
