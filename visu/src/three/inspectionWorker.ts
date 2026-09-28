import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CellLayout } from '../model/types';
import inspectorUrl from '../assets/models/inspector/inspector.glb?url';
import { createInspectionBlueprint } from './inspectionBlueprint';

const HEIGHT = 1.75;
const FLOOR_Y = -0.012;
const CYCLE_SECONDS = 14;

interface Arm {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  side: number;
  upperLength: number;
  lowerLength: number;
  handRotation: THREE.Quaternion;
  handFrame: THREE.Quaternion;
}

function release(root: THREE.Object3D): void {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) resources.add(value); });
    }
  });
  resources.forEach((resource) => resource.dispose());
  root.removeFromParent();
  root.clear();
}

// Reused scratch objects: posing the four arm segments does not allocate each frame.
const origin = new THREE.Vector3(), direction = new THREE.Vector3(), targetDirection = new THREE.Vector3();
const rotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion(), worldRotation = new THREE.Quaternion();
function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  bone.getWorldPosition(origin);
  child.getWorldPosition(direction).sub(origin).normalize();
  targetDirection.copy(target).sub(origin).normalize();
  rotation.setFromUnitVectors(direction, targetDirection).multiply(bone.getWorldQuaternion(parentRotation));
  bone.parent!.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.copy(parentRotation.multiply(rotation));
  bone.updateWorldMatrix(false, true);
}

function applyWorldDelta(bone: THREE.Object3D, delta: THREE.Quaternion): void {
  bone.parent!.getWorldQuaternion(parentRotation).invert();
  bone.getWorldQuaternion(worldRotation);
  bone.quaternion.copy(parentRotation.multiply(delta).multiply(worldRotation));
  bone.updateWorldMatrix(false, true);
}

/** A separate textured worker, with a fixed stance and procedural reading animation. */
export class InspectionWorker {
  readonly root = new THREE.Group();
  private readonly neutral = new Map<THREE.Object3D, THREE.Quaternion>();
  private readonly arms: Arm[] = [];
  private readonly blueprint = createInspectionBlueprint();
  private readonly modelRoot = new THREE.Group();
  private readonly cellTarget = new THREE.Vector3();
  private readonly rootRotation = new THREE.Quaternion();
  private readonly headRotation = new THREE.Quaternion();
  private readonly headForward = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private head?: THREE.Object3D;
  private neck?: THREE.Object3D;
  private chest?: THREE.Object3D;
  private elapsed = 0;
  private disposed = false;
  private ready = false;

  constructor(layout: CellLayout, model?: THREE.Group) {
    this.root.name = 'InspectionWorker';
    this.modelRoot.name = 'InspectionWorkerBody';
    this.blueprint.visible = false;
    this.root.add(this.modelRoot, this.blueprint);
    const first = layout.machine.machines[0]?.position ?? { x: 0, y: 1450, z: 0 };
    // Place the inspector at the left green floor marker beside the first machine.
    this.root.position.set((first.x + 200) / 1000, FLOOR_Y, -(first.y - 700) / 1000);
    this.cellTarget.set((first.x + layout.machine.sizeX * 0.75) / 1000,
      1.58, -(first.y + layout.machine.sizeY * 0.25) / 1000);
    this.root.rotation.y = Math.atan2(this.cellTarget.x - this.root.position.x,
      this.cellTarget.z - this.root.position.z);
    if (model) this.install(model);
    else void new GLTFLoader().loadAsync(inspectorUrl).then(({ scene }) => {
      if (this.disposed) { release(scene); return; }
      this.install(scene);
    }).catch((error: unknown) => {
      if (!this.disposed) console.warn('Не удалось загрузить рабочего с чертежом:', error);
    });
  }

  private install(model: THREE.Group): void {
    try {
      // The download contains a walking frame. Restore the actual bind pose first.
      const skeletons = new Set<THREE.Skeleton>();
      model.traverse((object) => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
      skeletons.forEach((skeleton) => skeleton.pose());
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model, true);
      model.scale.multiplyScalar(HEIGHT / bounds.getSize(new THREE.Vector3()).y);
      model.updateMatrixWorld(true);
      bounds.setFromObject(model, true);
      const hips = model.getObjectByName('Hips');
      if (!hips) throw new Error('Inspection worker is missing Hips');
      const pelvis = hips.getWorldPosition(new THREE.Vector3());
      model.position.add(new THREE.Vector3(-pelvis.x, -bounds.min.y, -pelvis.z));
      model.updateMatrixWorld(true);
      this.head = model.getObjectByName('Head');
      this.neck = model.getObjectByName('neck');
      this.chest = model.getObjectByName('Spine');
      if (!this.head || !this.neck || !this.chest) throw new Error('Inspection worker is missing Head/neck/Spine');
      model.traverse((object) => {
        if (object instanceof THREE.Bone) this.neutral.set(object, object.quaternion.clone());
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = object.receiveShadow = true;
        object.raycast = () => {};
        object.frustumCulled = false; // Rest-pose bounds do not enclose every reading pose.
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.metalness = 0;
          material.emissive.setHex(0);
          material.emissiveIntensity = 0;
          if (material.map) material.map.anisotropy = 4;
        }
      });
      // Calibrate against the neutral model's face (+Z), not the bone's local axes.
      this.head.getWorldQuaternion(this.headRotation);
      this.headForward.set(0, 0, 1).applyQuaternion(this.headRotation.clone().invert());
      for (const [name, side] of [['Left', 1], ['Right', -1]] as const) {
        const upper = model.getObjectByName(`${name}Arm`);
        const lower = model.getObjectByName(`${name}ForeArm`);
        const hand = model.getObjectByName(`${name}Hand`);
        if (!upper || !lower || !hand) throw new Error(`Inspection worker is missing ${name} arm`);
        const a = upper.getWorldPosition(new THREE.Vector3());
        const b = lower.getWorldPosition(new THREE.Vector3());
        const c = hand.getWorldPosition(new THREE.Vector3());
        const along = c.clone().sub(b).normalize();
        const palm = new THREE.Vector3(0, 0, 1).addScaledVector(along, -along.z).normalize();
        const across = new THREE.Vector3().crossVectors(palm, along).normalize();
        this.arms.push({ upper, lower, hand, side, upperLength: a.distanceTo(b), lowerLength: b.distanceTo(c),
          handRotation: hand.getWorldQuaternion(new THREE.Quaternion()),
          handFrame: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, across, palm)).invert() });
      }
      this.modelRoot.add(model);
      this.ready = true;
      this.blueprint.visible = true;
      this.applyPose(); // Reduced motion must still show a posed person, never an A-pose.
    } catch (error) {
      release(model);
      this.neutral.clear();
      this.arms.length = 0;
      this.ready = false;
      this.blueprint.visible = false;
      throw error;
    }
  }

  update(dt: number, paused: boolean): void {
    if (this.disposed || !this.ready || paused) return;
    this.elapsed = (this.elapsed + Math.max(0, Math.min(dt, 0.05))) % CYCLE_SECONDS;
    this.applyPose();
  }

  private applyPose(): void {
    const t = this.elapsed;
    // Read 0–4 s, raise the head 4–6 s, inspect 6–10 s, return 10–12 s.
    const lookAtCell = THREE.MathUtils.smootherstep(t, 4, 6) * (1 - THREE.MathUtils.smootherstep(t, 10, 12));
    const breath = Math.sin(t * Math.PI * 2 / 3.5);
    this.neutral.forEach((value, bone) => bone.quaternion.copy(value));
    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(this.rootRotation);
    // A tiny upper-body movement; pelvis and both soles remain planted.
    this.chest!.getWorldQuaternion(this.quaternion);
    rotation.setFromAxisAngle(this.axis.set(1, 0, 0).applyQuaternion(this.rootRotation),
      0.012 * breath + 0.025 * (1 - lookAtCell)).multiply(this.quaternion);
    this.chest!.parent!.getWorldQuaternion(parentRotation).invert();
    this.chest!.quaternion.copy(parentRotation.multiply(rotation));
    this.chest!.updateWorldMatrix(false, true);

    this.blueprint.position.set(0, 1.075 + breath * 0.003, 0.36);
    this.blueprint.rotation.set(1.02 + breath * 0.012, Math.PI, Math.sin(t * Math.PI * 2 / 7) * 0.008);
    this.blueprint.updateWorldMatrix(true, true);

    const head = this.head!;
    head.getWorldPosition(this.shoulder);
    // Actual face landmark, rather than assuming Head's +Z is the viewing axis.
    head.getWorldQuaternion(this.quaternion);
    this.axis.copy(this.headForward).applyQuaternion(this.quaternion).normalize();
    this.blueprint.getWorldPosition(this.target);
    this.target.sub(this.shoulder).normalize();
    this.pole.copy(this.cellTarget).sub(this.shoulder).normalize();
    this.target.lerp(this.pole, lookAtCell).normalize();
    rotation.setFromUnitVectors(this.axis, this.target);
    // Let the upper torso and neck carry the gaze movement. The Head joint only
    // follows through by a few degrees so its skinned vertices keep their shape.
    this.headRotation.identity().slerp(rotation, 0.18);
    applyWorldDelta(this.chest!, this.headRotation);
    this.headRotation.identity().slerp(rotation, 0.78);
    applyWorldDelta(this.neck!, this.headRotation);

    this.head!.getWorldQuaternion(this.quaternion);
    this.axis.copy(this.headForward).applyQuaternion(this.quaternion).normalize();
    this.head!.getWorldPosition(this.shoulder);
    this.blueprint.getWorldPosition(this.target);
    this.target.sub(this.shoulder).normalize();
    this.pole.copy(this.cellTarget).sub(this.shoulder).normalize();
    this.target.lerp(this.pole, lookAtCell).normalize();
    rotation.setFromUnitVectors(this.axis, this.target).multiply(this.quaternion);
    head.parent!.getWorldQuaternion(parentRotation).invert();
    head.quaternion.copy(parentRotation.multiply(rotation));
    head.updateWorldMatrix(false, true);
    for (const arm of this.arms) this.poseArm(arm);
  }

  private poseArm(arm: Arm): void {
    // Keep the wrist behind the page plane; fingertips meet the sheet at its edges.
    this.target.set(-arm.side * 0.36, -0.025, -0.035);
    this.blueprint.localToWorld(this.target);
    arm.upper.getWorldPosition(this.shoulder);
    this.axis.copy(this.target).sub(this.shoulder);
    const { upperLength: a, lowerLength: b } = arm;
    const distance = THREE.MathUtils.clamp(this.axis.length(), Math.abs(a - b) + 0.001, a + b - 0.001);
    this.axis.normalize();
    this.pole.set(arm.side * 0.45, -1, -0.18).applyQuaternion(this.rootRotation);
    this.pole.addScaledVector(this.axis, -this.pole.dot(this.axis)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    this.elbow.copy(this.shoulder).addScaledVector(this.axis, along)
      .addScaledVector(this.pole, Math.sqrt(Math.max(0, a * a - along * along)));
    aim(arm.upper, arm.lower, this.elbow);
    aim(arm.lower, arm.hand, this.target);

    // Keep the palms aligned with the sheet as it gently moves, independent of elbow rotation.
    this.blueprint.getWorldQuaternion(this.quaternion);
    this.axis.set(arm.side, 0.32, 0).normalize().applyQuaternion(this.quaternion);
    this.normal.set(0, 0, 1).applyQuaternion(this.quaternion);
    this.tangent.crossVectors(this.normal, this.axis).normalize();
    this.matrix.makeBasis(this.axis, this.tangent, this.normal);
    rotation.setFromRotationMatrix(this.matrix).multiply(arm.handFrame).multiply(arm.handRotation);
    arm.hand.parent!.getWorldQuaternion(parentRotation).invert();
    arm.hand.quaternion.copy(parentRotation.multiply(rotation));
    arm.hand.updateWorldMatrix(false, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    release(this.root);
    this.neutral.clear();
    this.arms.length = 0;
  }
}
