import * as THREE from 'three';

export const COLORS = {
  background: 0xf4f7fa,
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
  color: number,
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
  color: number,
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

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((entry) => entry.dispose());
  });
}
