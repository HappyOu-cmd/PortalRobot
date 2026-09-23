import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import workerUrl from '../assets/models/workshop/worker.glb?url';

interface Limb { upper: THREE.Object3D; lower: THREE.Object3D; end: THREE.Object3D; side: number }

function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const direction = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(direction, target.clone().sub(origin).normalize());
  rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(rotation));
  bone.updateWorldMatrix(false, true);
}

/** Textured CC0 worker. The asset's neutral skeleton is posed directly in the cab. */
export class ForkliftDriver {
  readonly root: THREE.Group;
  private readonly neutral = new Map<THREE.Object3D, THREE.Quaternion>();
  private readonly arms: Limb[] = [];
  private readonly legs: Limb[] = [];
  private readonly toes = new Map<number, THREE.Object3D>();
  private readonly head?: THREE.Object3D;
  private disposed = false;
  private lookBack = 0;
  private elapsed = 0;

  constructor(model: THREE.Group) {
    this.root = model;
    model.name = 'RealisticForkliftDriver';
    model.traverse((object) => {
      if (object instanceof THREE.Bone) this.neutral.set(object, object.quaternion.clone());
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      object.raycast = () => {};
      // A skinned vertex envelope changes after seating; don't cull with T-pose bounds.
      object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return;
        material.metalness = 0;
        material.roughness = 0.84;
        material.emissive.setHex(0);
        material.emissiveIntensity = 0;
        if (material.map) material.map.anisotropy = 4;
      });
    });
    model.scale.setScalar(1.08);
    model.updateMatrixWorld(true);
    const hips = model.getObjectByName('Hips');
    if (!hips) throw new Error('Worker model is missing Hips');
    const pelvis = hips.getWorldPosition(new THREE.Vector3());
    model.position.set(-pelvis.x, 1.18 - pelvis.y, -0.98 - pelvis.z);
    this.head = model.getObjectByName('Head');
    for (const [name, side] of [['Left', 1], ['Right', -1]] as const) {
      const limb = (upper: string, lower: string, end: string): Limb => {
        const bones = [upper, lower, end].map((suffix) => model.getObjectByName(`${name}${suffix}`));
        if (bones.some((bone) => !bone)) throw new Error(`Worker model is missing ${name} limb bones`);
        return { upper: bones[0]!, lower: bones[1]!, end: bones[2]!, side };
      };
      this.arms.push(limb('Arm', 'ForeArm', 'Hand'));
      this.legs.push(limb('UpLeg', 'Leg', 'Foot'));
      const toe = model.getObjectByName(`${name}ToeBase`);
      if (toe) this.toes.set(side, toe);
    }
  }

  static async create(): Promise<ForkliftDriver> {
    const gltf = await new GLTFLoader().loadAsync(workerUrl);
    return new ForkliftDriver(gltf.scene);
  }

  update(dt: number, vehicle: THREE.Group, wheel: THREE.Group, reversing: boolean): void {
    if (this.disposed) return;
    this.elapsed += dt;
    this.lookBack = THREE.MathUtils.damp(this.lookBack, reversing ? 0.52 : 0, 3, dt);
    this.neutral.forEach((rotation, bone) => bone.quaternion.copy(rotation));
    this.root.updateWorldMatrix(true, true);
    const local = (x: number, y: number, z: number) => vehicle.localToWorld(new THREE.Vector3(x, y, z));
    for (const { upper, lower, end, side } of this.legs) {
      aim(upper, lower, local(side * 0.145, 1.04, -0.64));
      aim(lower, end, local(side * 0.16, 0.635, -0.53));
      const toe = this.toes.get(side);
      if (toe) {
        const ankle = end.getWorldPosition(new THREE.Vector3());
        const forward = new THREE.Vector3(0, -0.035, 0.1).transformDirection(vehicle.matrixWorld);
        aim(end, toe, ankle.add(forward));
      }
    }
    for (const { upper, lower, end, side } of this.arms) {
      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbow = lower.getWorldPosition(new THREE.Vector3());
      const hand = end.getWorldPosition(new THREE.Vector3());
      // Regrip along the rim instead of crossing arms through the steering column.
      const grip = new THREE.Vector3(side * 0.145, 0.06, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), -wheel.rotation.z * 0.82);
      const target = wheel.localToWorld(grip);
      const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(hand);
      const axis = target.clone().sub(shoulder);
      const distance = THREE.MathUtils.clamp(axis.length(), Math.abs(a - b) + 0.001, a + b - 0.001);
      axis.normalize();
      const pole = new THREE.Vector3(side * 0.3, -0.8, -0.15).transformDirection(vehicle.matrixWorld);
      pole.addScaledVector(axis, -pole.dot(axis)).normalize();
      const along = (a * a - b * b + distance * distance) / (2 * distance);
      const bend = Math.sqrt(Math.max(0, a * a - along * along));
      aim(upper, lower, shoulder.clone().addScaledVector(axis, along).addScaledVector(pole, bend));
      aim(lower, end, target);
    }
    if (this.head) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0),
        this.lookBack + Math.sin(this.elapsed * 0.7) * 0.025);
      rotation.multiply(this.head.getWorldQuaternion(new THREE.Quaternion()));
      const parentRotation = this.head.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.head.quaternion.copy(parentRotation.multiply(rotation));
      this.head.updateWorldMatrix(false, true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.Skeleton>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.add(object.geometry);
      if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
        resources.add(material);
        Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) resources.add(value); });
      });
    });
    resources.forEach((resource) => resource.dispose());
    this.root.removeFromParent();
    this.root.clear();
    this.neutral.clear();
  }
}
