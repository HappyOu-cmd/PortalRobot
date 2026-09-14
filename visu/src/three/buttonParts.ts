import * as THREE from 'three';

export const EMERGENCY_BUTTON_COLORS = { rest: 0x8f0714, active: 0xff3420, emissive: 0xff1608, halo: 0xff2410 };
const emergencyRestRed = new THREE.Color(EMERGENCY_BUTTON_COLORS.rest);
const emergencyActiveRed = new THREE.Color(EMERGENCY_BUTTON_COLORS.active);

/** Shared by emergency mushrooms and the pneumatic/electrical warning indicators. */
export function emergencyButtonPulse(elapsed: number, reducedMotion = false): number {
  return reducedMotion || elapsed % 1 < 0.5 ? 1 : 0.12;
}

export function updateEmergencyButtonSurface(surface: THREE.MeshStandardMaterial, active: boolean, pulse: number, restColor: THREE.Color): void {
  surface.color.copy(active ? emergencyRestRed : restColor);
  if (active) surface.color.lerp(emergencyActiveRed, pulse);
  surface.emissive.set(EMERGENCY_BUTTON_COLORS.emissive);
  surface.emissiveIntensity = active ? 0.2 + pulse * 1.3 : 0;
}

export function updateEmergencyButtonGlow(glow: ReturnType<typeof createButtonGlow>, active: boolean, pulse: number): void {
  glow.visible = active;
  glow.material.uniforms.strength.value = active ? 0.12 + pulse * 0.55 : 0;
}

/** All button parts face local +Z; dimensions are in metres. */
export function addButtonCylinder(
  parent: THREE.Object3D, name: string, radius: number, depth: number,
  z: number, surface: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 32), surface);
  mesh.name = name;
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = z;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Alpha glow stays coloured even against the white floor, without scene-wide bloom. */
export function createButtonGlow(color: number, diameter: number) {
  const surface = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      color: { value: new THREE.Color(color) },
      strength: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 color;
      uniform float strength;
      void main() {
        float radius = length(vUv - 0.5) * 2.0;
        float halo = (1.0 - smoothstep(0.32, 1.0, radius)) * smoothstep(0.18, 0.36, radius);
        gl_FragColor = vec4(color, halo * strength);
      }
    `,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(diameter, diameter), surface);
  glow.name = 'button_halo';
  glow.visible = false;
  return glow;
}
