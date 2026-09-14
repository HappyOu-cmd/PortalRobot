import * as THREE from 'three';
import type { PartMaterialLayout } from '../model/types';

export interface AlarmSurfaceMaterial {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  wavePosition: number;
  uniforms: AlarmSurfaceUniforms;
}

interface AlarmSurfaceUniforms {
  uAlarmActive: { value: number };
  uAlarmPulse: { value: number };
  uAlarmElapsed: { value: number };
  uAlarmColor: { value: THREE.Color };
  uAlarmWaveMin: { value: number };
  uAlarmWaveSpan: { value: number };
}

const ALARM_PALE_RED = new THREE.Color(0xffa19b);
const ALARM_RED = new THREE.Color(0xef181d);
const ALARM_MAX_PULSE = 0.72;
const ALARM_WAVE_SPEED = 0.7;
const ALARM_WAVE_CYCLE = 1.36;
const ALARM_WAVE_MARGIN = 0.18;
const ALARM_WAVE_WIDTH = 0.22;

function alarmWaveIntensity(elapsed: number, position: number): number {
  const center = ((elapsed * ALARM_WAVE_SPEED) % ALARM_WAVE_CYCLE) - ALARM_WAVE_MARGIN;
  const distance = Math.abs(position - center);
  return distance >= ALARM_WAVE_WIDTH
    ? 0
    : 1 - THREE.MathUtils.smoothstep(distance, 0, ALARM_WAVE_WIDTH);
}

function installAlarmSurfaceShader(
  surface: THREE.MeshStandardMaterial,
  waveMin: number,
  waveSpan: number,
): AlarmSurfaceUniforms {
  const existingUniforms = surface.userData.alarmSurfaceUniforms as AlarmSurfaceUniforms | undefined;
  if (existingUniforms) {
    return existingUniforms;
  }
  const uniforms: AlarmSurfaceUniforms = {
    uAlarmActive: { value: 0 },
    uAlarmPulse: { value: 0 },
    uAlarmElapsed: { value: 0 },
    uAlarmColor: { value: ALARM_RED.clone() },
    uAlarmWaveMin: { value: waveMin },
    uAlarmWaveSpan: { value: waveSpan },
  };
  surface.userData.alarmSurfaceUniforms = uniforms;
  const previousOnBeforeCompile = surface.onBeforeCompile;
  surface.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(surface, shader, renderer);
    shader.uniforms.uAlarmActive = uniforms.uAlarmActive;
    shader.uniforms.uAlarmPulse = uniforms.uAlarmPulse;
    shader.uniforms.uAlarmElapsed = uniforms.uAlarmElapsed;
    shader.uniforms.uAlarmColor = uniforms.uAlarmColor;
    shader.uniforms.uAlarmWaveMin = uniforms.uAlarmWaveMin;
    shader.uniforms.uAlarmWaveSpan = uniforms.uAlarmWaveSpan;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vAlarmWavePosition;
uniform float uAlarmWaveMin;
uniform float uAlarmWaveSpan;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 alarmWorldPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  alarmWorldPosition = batchingMatrix * alarmWorldPosition;
#endif
#ifdef USE_INSTANCING
  alarmWorldPosition = instanceMatrix * alarmWorldPosition;
#endif
vAlarmWavePosition = clamp(
  (modelMatrix * alarmWorldPosition).x - uAlarmWaveMin,
  0.0,
  uAlarmWaveSpan
) / max(uAlarmWaveSpan, 0.0001);
#include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vAlarmWavePosition;
uniform float uAlarmActive;
uniform float uAlarmPulse;
uniform float uAlarmElapsed;
uniform vec3 uAlarmColor;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float alarmWaveCenter = (fract(uAlarmElapsed * ${ALARM_WAVE_SPEED.toFixed(2)} / ${ALARM_WAVE_CYCLE.toFixed(2)}) * ${ALARM_WAVE_CYCLE.toFixed(2)}) - ${ALARM_WAVE_MARGIN.toFixed(2)};
float alarmWave = 1.0 - smoothstep(0.0, ${ALARM_WAVE_WIDTH.toFixed(2)}, abs(vAlarmWavePosition - alarmWaveCenter));
float alarmHalo = 0.06 + uAlarmPulse * 0.28 + alarmWave * 0.10;
totalEmissiveRadiance += uAlarmActive * uAlarmColor * alarmHalo;`,
      );
  };
  surface.needsUpdate = true;
  return uniforms;
}

export const COLORS = {
  background: 0xfdfdfe,
  floor: 0xe8edf2,
  grid: 0xb9c6d0,
  blue: 0x1769d2,
  blueDark: 0x0f3f76,
  graphite: 0x26323c,
  charcoal: 0x131b22,
  steel: 0x9baab5,
  silver: 0xd9e0e5,
  white: 0xf4f6f7,
  glass: 0x263c4c,
  green: 0x21a35b,
  amber: 0xe4a62b,
  red: 0xd94848,
  blank: 0x2f78d0,
  detail: 0x2ca568,
  empty: 0x6f8291,
};

export function mm(value: number): number {
  return value / 1000;
}

export function logicalPosition(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(mm(x), mm(z), -mm(y));
}

export function material(
  color: THREE.ColorRepresentation,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.56,
    metalness: 0.08,
    ...options,
  });
}

export function box(
  name: string,
  size: THREE.Vector3,
  color: number,
  position: THREE.Vector3,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material(color, options));
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(
  name: string,
  radius: number,
  height: number,
  color: THREE.ColorRepresentation,
  position: THREE.Vector3,
  radialSegments = 24,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, radialSegments),
    material(color, { metalness: 0.14, roughness: 0.42 }),
  );
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function applyPartMaterial(object: THREE.Object3D, appearance: PartMaterialLayout): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((entry) => {
      if (!(entry instanceof THREE.MeshStandardMaterial)) return;
      const opacity = THREE.MathUtils.clamp(appearance.opacity, 0.1, 1);
      const transparent = opacity < 1;
      const requiresMaterialUpdate = entry.transparent !== transparent;
      entry.color.set(appearance.color);
      entry.opacity = opacity;
      entry.transparent = transparent;
      entry.depthWrite = opacity >= 0.98;
      if (requiresMaterialUpdate) entry.needsUpdate = true;
    });
  });
}

export function makeLabel(text: string, color = '#174f94'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 52px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.7, 0.42, 1);
  return sprite;
}

export function damp(current: number, target: number, response: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-response * dt));
}

export function collectAlarmSurfaceMaterials(root: THREE.Object3D, materialName?: string): AlarmSurfaceMaterial[] {
  const result: AlarmSurfaceMaterial[] = [];
  const seen = new Set<THREE.MeshStandardMaterial>();
  // Collection happens before the rig is attached to the scene. Update the
  // complete local hierarchy first so the wave bounds use the same world
  // coordinates that the shader receives later during rendering.
  root.updateWorldMatrix(true, true);
  const rootBounds = new THREE.Box3().setFromObject(root);
  const hasBounds = !rootBounds.isEmpty()
    && Number.isFinite(rootBounds.min.x)
    && Number.isFinite(rootBounds.max.x);
  const waveMin = hasBounds ? rootBounds.min.x : 0;
  const waveSpan = hasBounds ? Math.max(rootBounds.max.x - rootBounds.min.x, 0.001) : 1;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const objectBounds = new THREE.Box3().setFromObject(object);
    const objectCenterX = (objectBounds.min.x + objectBounds.max.x) / 2;
    const wavePosition = THREE.MathUtils.clamp(
      (objectCenterX - waveMin) / waveSpan,
      0,
      1,
    );
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((entry) => {
      if (!(entry instanceof THREE.MeshStandardMaterial)) return;
      if (materialName && entry.name !== materialName) return;
      if (seen.has(entry)) return;
      seen.add(entry);
      result.push({
        material: entry,
        color: entry.color.clone(),
        emissive: entry.emissive.clone(),
        emissiveIntensity: entry.emissiveIntensity,
        wavePosition,
        uniforms: installAlarmSurfaceShader(entry, waveMin, waveSpan),
      });
    });
  });
  return result;
}

export function setAlarmSurfaceMaterials(
  surfaces: AlarmSurfaceMaterial[],
  active: boolean,
  pulse: number,
  elapsed = 0,
  reducedMotion = false,
): void {
  surfaces.forEach(({ material: surface, color, emissive, emissiveIntensity, wavePosition, uniforms }) => {
    if (active) {
      const limitedPulse = THREE.MathUtils.clamp(pulse, 0, 1) * ALARM_MAX_PULSE;
      const wave = reducedMotion ? 0 : alarmWaveIntensity(elapsed, wavePosition);
      const colorPulse = Math.min(ALARM_MAX_PULSE, limitedPulse + wave * 0.08);
      surface.color.lerpColors(ALARM_PALE_RED, ALARM_RED, colorPulse);
      // The halo is added in the shared shader so it softly lifts the whole
      // surface without making the red peak brighter than the capped pulse.
      surface.emissive.copy(emissive);
      surface.emissiveIntensity = emissiveIntensity;
      uniforms.uAlarmActive.value = 1;
      uniforms.uAlarmPulse.value = limitedPulse;
      uniforms.uAlarmElapsed.value = reducedMotion ? 0 : elapsed;
    } else {
      surface.color.copy(color);
      surface.emissive.copy(emissive);
      surface.emissiveIntensity = emissiveIntensity;
      uniforms.uAlarmActive.value = 0;
      uniforms.uAlarmPulse.value = 0;
      uniforms.uAlarmElapsed.value = 0;
    }
  });
}

export function alarmPulse(elapsed: number, reducedMotion: boolean): number {
  return reducedMotion ? 0.55 : (1 - Math.cos(elapsed * Math.PI)) / 2;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.InstancedMesh) object.dispose();
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((entry) => entry.dispose());
  });
}
