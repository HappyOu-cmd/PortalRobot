import * as THREE from 'three';

const AMBER = new THREE.Color(0xff9900);
const ORANGE = new THREE.Color(0xff6500);

export interface WarningGlowRig {
  root: THREE.Group;
  color: THREE.Color;
  colorFrom: THREE.Color;
  colorTo: THREE.Color;
  pulse: { value: number };
  surfaces: {
    material: THREE.MeshStandardMaterial;
    color: THREE.Color;
    emissive: THREE.Color;
    emissiveIntensity: number;
  }[];
}

/** Local warning halo for a node that needs operator action, including a held part.
 * Dimensions and margin are in metres; the caller supplies the PLC warning state. */
export function createWarningGlow(size: [number, number, number], materials: THREE.MeshStandardMaterial[], margin = 0.14,
  palette: readonly [THREE.ColorRepresentation, THREE.ColorRepresentation] = [AMBER, ORANGE]): WarningGlowRig {
  const root = new THREE.Group();
  root.name = 'operator_warning_glow';
  root.userData.warningOverlay = true;
  root.visible = false;
  const colorFrom = new THREE.Color(palette[0]), colorTo = new THREE.Color(palette[1]);
  const color = colorTo.clone(), pulse = { value: 0 };
  const [width, height, depth] = size;
  const addFaces = (w: number, h: number, axis: 'x' | 'y' | 'z', half: number) => {
    const surface = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: {
        color: { value: color }, pulse,
        size: { value: new THREE.Vector2(w + margin * 2, h + margin * 2) },
        halfCore: { value: new THREE.Vector2(w / 2, h / 2) },
        margin: { value: margin },
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
        uniform float pulse;
        uniform vec2 size;
        uniform vec2 halfCore;
        uniform float margin;
        void main() {
          float radius = min(0.025, min(halfCore.x, halfCore.y));
          vec2 edge = abs((vUv - 0.5) * size) - halfCore + radius;
          float distanceToEdge = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - radius;
          float reach = margin * (0.55 + pulse * 0.45);
          float normalizedDistance = distanceToEdge / reach;
          float halo = exp(-3.0 * normalizedDistance * normalizedDistance);
          halo *= 1.0 - smoothstep(reach * 0.65, reach, max(distanceToEdge, 0.0));
          float alpha = halo * (0.14 + pulse * 0.34);
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    const geometry = new THREE.PlaneGeometry(w + margin * 2, h + margin * 2);
    for (const sign of [-1, 1]) {
      const glow = new THREE.Mesh(geometry, surface);
      glow.name = `warning_halo_${axis}_${sign}`;
      glow.position[axis] = sign * (half + 0.005);
      if (axis === 'x') glow.rotation.y = sign * Math.PI / 2;
      if (axis === 'y') glow.rotation.x = -sign * Math.PI / 2;
      if (axis === 'z' && sign < 0) glow.rotation.y = Math.PI;
      glow.renderOrder = 8;
      glow.userData.animated = true;
      glow.userData.warningOverlay = true;
      // An indication must not intercept selection of the equipment behind it.
      glow.raycast = () => {};
      root.add(glow);
    }
  };
  // Outward faces retain a soft contour from top, side and end camera angles.
  addFaces(width, height, 'z', depth / 2);
  addFaces(width, depth, 'y', height / 2);
  addFaces(depth, height, 'x', width / 2);
  return { root, color, colorFrom, colorTo, pulse, surfaces: materials.map(material => ({
    material, color: material.color.clone(), emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity,
  })) };
}

/** Pulse 0 hides the halo and restores all original surfaces; active range is 0.35..1. */
export function updateWarningGlow(rig: WarningGlowRig, pulse: number): void {
  const active = pulse > 0;
  const wave = active ? THREE.MathUtils.clamp((pulse - 0.35) / 0.65, 0, 1) : 0;
  rig.root.visible = active;
  rig.pulse.value = wave;
  rig.color.lerpColors(rig.colorFrom, rig.colorTo, wave);
  for (const { material, color, emissive, emissiveIntensity } of rig.surfaces) {
    material.color.copy(active ? rig.color : color);
    material.emissive.copy(active ? rig.color : emissive);
    material.emissiveIntensity = active ? 0.12 + wave * 0.55 : emissiveIntensity;
  }
}

interface WarningMeshBinding {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  tinted: THREE.Material | THREE.Material[];
}
interface AttachedWarningGlow {
  glow: WarningGlowRig;
  margin: number;
  bindings: WarningMeshBinding[];
  materials: Map<THREE.MeshStandardMaterial, { tinted: THREE.MeshStandardMaterial; version: number }>;
}

/** Temporarily swaps private material copies. Shared surfaces and their alarm owners stay untouched. */
export class WarningGlowLayer {
  private entries = new Map<THREE.Object3D, AttachedWarningGlow>();
  private phase = 0;
  private revision = '';
  private readonly bounds = new THREE.Box3();
  private readonly meshBounds = new THREE.Box3();
  private readonly inverse = new THREE.Matrix4();
  private readonly transform = new THREE.Matrix4();
  private readonly size = new THREE.Vector3();

  private readBounds(root: THREE.Object3D, bindings: WarningMeshBinding[]): THREE.Box3 {
    root.updateWorldMatrix(true, true);
    this.inverse.copy(root.matrixWorld).invert();
    this.bounds.makeEmpty();
    for (const { mesh } of bindings) {
      if (mesh instanceof THREE.InstancedMesh) mesh.computeBoundingBox();
      else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const local = mesh instanceof THREE.InstancedMesh ? mesh.boundingBox : mesh.geometry.boundingBox;
      if (local) this.bounds.union(this.meshBounds.copy(local).applyMatrix4(this.transform.multiplyMatrices(this.inverse, mesh.matrixWorld)));
    }
    return this.bounds;
  }

  private fit(root: THREE.Object3D, entry: AttachedWarningGlow): void {
    const bounds = this.readBounds(root, entry.bindings);
    if (bounds.isEmpty()) return;
    bounds.getCenter(entry.glow.root.position);
    bounds.getSize(this.size);
    this.size.set(Math.max(this.size.x, 0.01), Math.max(this.size.y, 0.01), Math.max(this.size.z, 0.01));
    for (const object of entry.glow.root.children) {
      const face = object as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      const axis = face.name.split('_')[2] as 'x' | 'y' | 'z';
      const sign = face.name.endsWith('_-1') ? -1 : 1;
      const width = axis === 'x' ? this.size.z : this.size.x;
      const height = axis === 'y' ? this.size.z : this.size.y;
      face.position[axis] = sign * (this.size[axis] / 2 + 0.005);
      face.scale.set((width + entry.margin * 2) / face.geometry.parameters.width,
        (height + entry.margin * 2) / face.geometry.parameters.height, 1);
      face.material.uniforms.size.value.set(width + entry.margin * 2, height + entry.margin * 2);
      face.material.uniforms.halfCore.value.set(width / 2, height / 2);
    }
  }

  /** Call before the normal model updates, so they always work with their own materials. */
  restoreMaterials(): void {
    for (const entry of this.entries.values()) for (const binding of entry.bindings) {
      if (binding.mesh.material === binding.tinted) binding.mesh.material = binding.original;
    }
  }

  private create(root: THREE.Object3D): AttachedWarningGlow | undefined {
    const materials: AttachedWarningGlow['materials'] = new Map();
    const bindings: WarningMeshBinding[] = [];
    const tint = (source: THREE.Material): THREE.Material => {
      if (!(source instanceof THREE.MeshStandardMaterial)) return source;
      let pair = materials.get(source);
      if (!pair) {
        pair = { tinted: source.clone(), version: source.version };
        materials.set(source, pair);
      }
      return pair.tinted;
    };
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.inspectionOverlay || object.userData.warningOverlay) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        if (parent.userData.warningGlowExcluded) return;
        if (parent === root) break;
      }
      const original = object.material;
      const surfaces = Array.isArray(original) ? original : [original];
      if (!surfaces.some(surface => surface instanceof THREE.MeshStandardMaterial)) return;
      bindings.push({ mesh: object, original, tinted: Array.isArray(original) ? original.map(tint) : tint(original) });
    });
    const bounds = this.readBounds(root, bindings);
    if (bounds.isEmpty() || !materials.size) {
      for (const { tinted } of materials.values()) tinted.dispose();
      return;
    }
    const size = bounds.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.01, 0.01, 0.01));
    const scale = root.getWorldScale(new THREE.Vector3());
    const margin = 0.14 / Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 0.001);
    const glow = createWarningGlow([size.x, size.y, size.z], [...materials.values()].map(pair => pair.tinted), margin);
    glow.root.position.copy(bounds.getCenter(new THREE.Vector3()));
    root.add(glow.root);
    return { glow, margin, bindings, materials };
  }

  private remove(root: THREE.Object3D, entry: AttachedWarningGlow): void {
    for (const binding of entry.bindings) if (binding.mesh.material === binding.tinted) binding.mesh.material = binding.original;
    entry.glow.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    entry.glow.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const surface of Array.isArray(object.material) ? object.material : [object.material]) materials.add(surface);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    for (const { tinted } of entry.materials.values()) tinted.dispose();
    this.entries.delete(root);
  }

  update(objects: readonly THREE.Object3D[], dt: number, reducedMotion = false, revision = ''): void {
    this.restoreMaterials();
    if (revision !== this.revision) {
      this.dispose();
      this.revision = revision;
    }
    // A whole-equipment warning already covers its descendants; do not stack material swaps/halos.
    const roots = new Set(objects);
    for (const object of roots) {
      for (let parent = object.parent; parent; parent = parent.parent) {
        if (roots.has(parent)) { roots.delete(object); break; }
      }
    }
    for (const [root, entry] of this.entries) {
      if (!roots.has(root) || entry.bindings.some(binding => binding.mesh.material !== binding.original)) this.remove(root, entry);
    }
    this.phase = roots.size ? (this.phase + Math.max(0, Math.min(dt, 0.1))) % 2 : 0;
    const pulse = reducedMotion ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(this.phase * Math.PI));
    for (const root of roots) {
      let entry = this.entries.get(root);
      if (!entry) {
        entry = this.create(root);
        if (!entry) continue;
        this.entries.set(root, entry);
      }
      for (const [source, pair] of entry.materials) {
        // Follow live opacity/maps/part appearance without changing or disposing the originals.
        pair.tinted.copy(source);
        if (pair.version !== source.version) { pair.tinted.needsUpdate = true; pair.version = source.version; }
      }
      for (const binding of entry.bindings) binding.mesh.material = binding.tinted;
      if (root.userData.warningGlowDynamicBounds) this.fit(root, entry);
      updateWarningGlow(entry.glow, pulse);
    }
  }

  dispose(): void {
    this.restoreMaterials();
    for (const [root, entry] of this.entries) this.remove(root, entry);
    this.phase = 0;
  }
}
