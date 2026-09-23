import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type XYZ = [number, number, number];

/** All resources belong to one workshop; shared geometry is disposed exactly once. */
export class WorkshopAssets {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly cube = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly roundCube = this.geometry(new RoundedBoxGeometry(1, 1, 1, 2, 0.065));
  private readonly cylinder = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 24));
  private readonly plane = this.geometry(new THREE.PlaneGeometry(1, 1));

  geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  surface(color: number, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...options });
    this.materials.add(material);
    return material;
  }
  texture<T extends THREE.Texture>(texture: T): T { this.textures.add(texture); return texture; }

  grain(kind: 'concrete' | 'wood' | 'cardboard'): THREE.DataTexture {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    let seed = 7349;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const noise = random();
      const grain = kind === 'wood' ? Math.sin(y * 0.53 + Math.sin(x * 0.08) * 0.8) * 17
        : kind === 'cardboard' ? (x % 3 === 0 ? -5 : 0) : Math.sin(x * 0.17) * Math.cos(y * 0.13) * 5;
      const value = Math.round(218 + grain + (noise - 0.5) * (kind === 'concrete' ? 27 : 15));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
    const texture = this.texture(new THREE.DataTexture(data, size, size));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
    position: XYZ, size: XYZ = [1, 1, 1]): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(parent: THREE.Object3D, material: THREE.Material, size: XYZ, position: XYZ, rounded = false): THREE.Mesh {
    return this.mesh(parent, rounded ? this.roundCube : this.cube, material, position, size);
  }
  tube(parent: THREE.Object3D, material: THREE.Material, radius: number, start: XYZ, end: XYZ): THREE.Mesh {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const delta = b.sub(a);
    const mesh = this.mesh(parent, this.cylinder, material,
      [start[0] + delta.x / 2, start[1] + delta.y / 2, start[2] + delta.z / 2], [radius, delta.length(), radius]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return mesh;
  }
  decal(parent: THREE.Object3D, surface: THREE.Material, width: number, height: number,
    position: XYZ, ground = false): THREE.Mesh {
    const mesh = this.mesh(parent, this.plane, surface, position, [width, height, 1]);
    mesh.castShadow = false;
    if (ground) mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  label(text: string, background = '#eee9dd', color = '#283333', barcode = false): THREE.MeshStandardMaterial {
    const surface = this.surface(0xffffff, { roughness: 0.9, metalness: 0, polygonOffset: true,
      polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    // Geometry-only tests do not need a DOM or GPU.
    if (typeof document === 'undefined') { surface.color.set(background); return surface; }
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return surface;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    ctx.font = `600 ${lines.length > 1 ? 39 : 65}px Arial`;
    lines.forEach((line, index) => ctx.fillText(line, 256, 72 + index * 56, 466));
    if (barcode) for (let x = 38; x < 474; x += 5) {
      ctx.fillRect(x, 193, (x * 13 % 7) > 2 ? 3 : 1, 42);
    }
    const texture = this.texture(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    surface.map = texture;
    return surface;
  }

  /** Collapse fixed subassemblies into one draw call per material/shadow setting. */
  batch(root: THREE.Group): void {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const buckets = new Map<string, { meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      const bucket = buckets.get(key) ?? { meshes: [], geometries: [] };
      bucket.meshes.push(object);
      // RoundedBoxGeometry is non-indexed; boxes/cylinders are indexed.
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      bucket.geometries.push(geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
      buckets.set(key, bucket);
    });
    buckets.forEach(({ meshes, geometries }) => {
      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(this.geometry(merged), meshes[0].material);
      mesh.castShadow = meshes[0].castShadow;
      mesh.receiveShadow = meshes[0].receiveShadow;
      mesh.name = `${root.name}_batch`;
      meshes.forEach((source) => source.removeFromParent());
      root.add(mesh);
    });
  }

  dispose(): void {
    this.geometries.forEach((resource) => resource.dispose());
    this.materials.forEach((resource) => resource.dispose());
    this.textures.forEach((resource) => resource.dispose());
    this.geometries.clear(); this.materials.clear(); this.textures.clear();
  }
}
