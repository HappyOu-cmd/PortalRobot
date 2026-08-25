import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import workerModelUrl from '../assets/models/quaternius/Male_LongSleeve.fbx?url';

export type WorkerClip = 'walk' | 'run' | 'death' | 'idle' | 'sitting' | 'standing'
  | 'jump' | 'slash' | 'runningJump' | 'clapping' | 'punch';

export interface RiggedWorkerOptions {
  suitColor: number;
  pantsColor?: number;
  helmetColor?: number;
  withHelmet?: boolean;
  withWrench?: boolean;
}

interface WorkerTemplate {
  scene: THREE.Group;
  clips: Map<WorkerClip, THREE.AnimationClip>;
}

interface PlayOptions {
  loop?: boolean;
  speed?: number;
  fadeSeconds?: number;
}

const CLIP_NAMES: Record<string, WorkerClip> = {
  Man_Walk: 'walk',
  Man_Run: 'run',
  Man_Death: 'death',
  Man_Idle: 'idle',
  Man_Sitting: 'sitting',
  Man_Standing: 'standing',
  Man_Jump: 'jump',
  Man_SwordSlash: 'slash',
  Man_RunningJump: 'runningJump',
  Man_Clapping: 'clapping',
  Man_Punch: 'punch',
};

let templatePromise: Promise<WorkerTemplate> | undefined;

function loadTemplate(): Promise<WorkerTemplate> {
  if (templatePromise) return templatePromise;
  templatePromise = new FBXLoader().loadAsync(workerModelUrl).then((scene) => {
    const clips = new Map<WorkerClip, THREE.AnimationClip>();
    scene.animations.forEach((clip) => {
      const sourceName = clip.name.split('|').at(-1) ?? clip.name;
      const name = CLIP_NAMES[sourceName];
      if (name) clips.set(name, clip);
    });
    return { scene, clips };
  });
  return templatePromise;
}

function colorMaterial(material: THREE.Material, color: number): void {
  if ('color' in material && material.color instanceof THREE.Color) material.color.setHex(color);
}

function cloneAndColorModel(template: THREE.Group, options: RiggedWorkerOptions): {
  model: THREE.Group;
  ownedMaterials: THREE.Material[];
} {
  const model = SkeletonUtils.clone(template) as THREE.Group;
  const ownedMaterials: THREE.Material[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const clonedMaterials = sourceMaterials.map((source) => {
      const cloned = source.clone();
      ownedMaterials.push(cloned);
      if (cloned.name === 'Shirt') colorMaterial(cloned, options.suitColor);
      if (cloned.name === 'Pants') colorMaterial(cloned, options.pantsColor ?? 0x253542);
      if (cloned.name === 'Socks' || cloned.name === 'Shoes') colorMaterial(cloned, 0x171d22);
      return cloned;
    });
    object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
    object.castShadow = true;
    object.receiveShadow = true;
  });
  model.scale.setScalar(0.00358);
  model.position.y = 0.002;
  return { model, ownedMaterials };
}

function accessoryMaterial(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.06, ...options });
}

function createHelmet(color: number): THREE.Group {
  const root = new THREE.Group();
  root.name = 'rigged_worker_helmet';
  const material = accessoryMaterial(color, { roughness: 0.42 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 10), material);
  dome.scale.y = 0.58;
  dome.position.y = 0.105;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.035, 18), material);
  brim.position.set(0, 0.025, 0.018);
  dome.castShadow = true;
  brim.castShadow = true;
  root.add(dome, brim);
  return root;
}

function createWrench(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'rigged_worker_wrench';
  const steel = accessoryMaterial(0x323b41, { metalness: 0.72, roughness: 0.28 });
  const gripMaterial = accessoryMaterial(0xc4473d, { roughness: 0.7 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.038), steel);
  handle.position.y = 0.19;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.2, 0.052), gripMaterial);
  grip.position.y = -0.02;
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.035, 7, 12, Math.PI * 1.4), steel);
  jaw.position.y = 0.48;
  jaw.rotation.z = Math.PI * 0.8;
  [handle, grip, jaw].forEach((mesh) => { mesh.castShadow = true; });
  root.add(handle, grip, jaw);
  return root;
}

function disposeAccessory(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

export class RiggedWorker {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<WorkerClip, THREE.AnimationAction>();
  private readonly ownedMaterials: THREE.Material[];
  private readonly headBone?: THREE.Object3D;
  private readonly handBone?: THREE.Object3D;
  private readonly helmet?: THREE.Group;
  private readonly wrench?: THREE.Group;
  private currentClip?: WorkerClip;

  private constructor(template: WorkerTemplate, options: RiggedWorkerOptions) {
    const { model, ownedMaterials } = cloneAndColorModel(template.scene, options);
    this.ownedMaterials = ownedMaterials;
    this.root.name = 'RiggedWorker';
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    template.clips.forEach((clip, name) => this.actions.set(name, this.mixer.clipAction(clip)));
    this.headBone = model.getObjectByName('Head');
    this.handBone = model.getObjectByName('PalmR');
    if (options.withHelmet !== false) {
      this.helmet = createHelmet(options.helmetColor ?? 0xf0ba27);
      this.root.add(this.helmet);
    }
    if (options.withWrench) {
      this.wrench = createWrench();
      this.root.add(this.wrench);
    }
    this.play('idle', { fadeSeconds: 0 });
  }

  static async create(options: RiggedWorkerOptions): Promise<RiggedWorker> {
    return new RiggedWorker(await loadTemplate(), options);
  }

  play(name: WorkerClip, options: PlayOptions = {}): void {
    if (this.currentClip === name) return;
    const action = this.actions.get(name);
    if (!action) return;
    const fadeSeconds = options.fadeSeconds ?? 0.16;
    const previous = this.currentClip ? this.actions.get(this.currentClip) : undefined;
    previous?.fadeOut(fadeSeconds);
    action.reset();
    action.enabled = true;
    action.timeScale = options.speed ?? 1;
    action.clampWhenFinished = options.loop === false;
    action.setLoop(options.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, options.loop === false ? 1 : Infinity);
    action.fadeIn(fadeSeconds).play();
    this.currentClip = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.root.updateWorldMatrix(true, true);
    if (this.helmet && this.headBone) this.followBone(this.helmet, this.headBone, new THREE.Vector3(0, 0.105, 0));
    if (this.wrench && this.handBone) {
      this.followBone(this.wrench, this.handBone, new THREE.Vector3(0, 0.01, 0));
      this.wrench.rotateZ(Math.PI);
      this.wrench.rotateX(-0.24);
    }
  }

  setWrenchVisible(visible: boolean): void {
    if (this.wrench) this.wrench.visible = visible;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.ownedMaterials.forEach((material) => material.dispose());
    if (this.helmet) disposeAccessory(this.helmet);
    if (this.wrench) disposeAccessory(this.wrench);
    this.root.removeFromParent();
  }

  private followBone(target: THREE.Object3D, bone: THREE.Object3D, offset: THREE.Vector3): void {
    const bonePosition = bone.getWorldPosition(new THREE.Vector3());
    const boneQuaternion = bone.getWorldQuaternion(new THREE.Quaternion());
    const rootQuaternion = this.root.getWorldQuaternion(new THREE.Quaternion());
    target.position.copy(this.root.worldToLocal(bonePosition));
    target.quaternion.copy(rootQuaternion.invert().multiply(boneQuaternion));
    target.position.add(offset.applyQuaternion(target.quaternion));
  }
}
