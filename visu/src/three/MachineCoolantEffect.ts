import * as THREE from 'three';
import type { PartGeometryLayout } from '../model/types';
import type { MachineTurretRig } from './machineTurret';
import { material, mm } from './primitives';

const HOSE_BLUE = 0x2724cc;
const NOZZLE_ORANGE = 0xf58219;
const COOLANT_WHITE = 0xffffff;
const JET_SEGMENTS = 32;
const JET_SIDES = 8;
const SPLASH_DROPS = 96;
const NOZZLE_OUTLET_RADIUS = 0.0065;
const UP = new THREE.Vector3(0, 1, 0);

interface CoolantJet {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outlet: THREE.Object3D;
  curve: THREE.QuadraticBezierCurve3;
  impact: THREE.Mesh;
  splash: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  surfaceNormal: THREE.Vector3;
}

/** White emulsion from two articulated hoses; no fog or particle cloud. */
export class MachineCoolantEffect {
  private readonly root = new THREE.Group();
  private readonly hoses: THREE.Group[] = [];
  private readonly jets: CoolantJet[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly stockCenter = new THREE.Vector3();
  private readonly toolPoint = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly binormal = new THREE.Vector3();
  private readonly reference = new THREE.Vector3();
  private readonly dropletPosition = new THREE.Vector3();
  private readonly dropletVelocity = new THREE.Vector3();
  private readonly dropletScale = new THREE.Vector3();
  private readonly dropletRotation = new THREE.Quaternion();
  private readonly dropletMatrix = new THREE.Matrix4();
  private active = false;
  private intensity = 0;
  private time = 0;

  constructor(
    private readonly model: THREE.Group,
    private readonly chuck: THREE.Object3D,
    private readonly part: THREE.Group,
    private readonly geometry: PartGeometryLayout,
    private readonly turret?: MachineTurretRig,
  ) {
    this.root.name = 'machine_coolant_streams';
    model.add(this.root);
    const origin = chuck.position;
    const fixedOutlet = origin.clone().add(new THREE.Vector3(0.15, 0.085, 0.015));
    const stockTop = origin.clone().add(part.position).add(new THREE.Vector3(0.025, mm(geometry.diameter) / 2, 0));
    const fixed = this.createHose(model, 'coolant_body_hose', [
      origin.clone().add(new THREE.Vector3(-0.015, 0.25, -0.035)),
      origin.clone().add(new THREE.Vector3(0.01, 0.28, 0.025)),
      origin.clone().add(new THREE.Vector3(0.09, 0.24, 0.07)),
    ], fixedOutlet, stockTop);
    this.jets.push(this.createJet('coolant_body_stream', fixed, new THREE.Vector3(0, 1, 0)));

    if (turret) {
      const moving = this.createHose(turret.head, 'coolant_turret_hose', [
        new THREE.Vector3(-0.04, 0.16, 0.12),
        new THREE.Vector3(-0.08, 0.23, 0.26),
        new THREE.Vector3(-0.19, 0.16, 0.325),
      ], new THREE.Vector3(-0.245, 0.06, 0.326), turret.toolTip);
      this.jets.push(this.createJet('coolant_turret_stream', moving, new THREE.Vector3(0, 0, -1)));
    }
    this.root.visible = false;
  }

  private createHose(parent: THREE.Object3D, name: string, controls: THREE.Vector3[], outlet: THREE.Vector3, target: THREE.Vector3): THREE.Object3D {
    const root = new THREE.Group();
    root.name = name;
    parent.add(root);
    this.hoses.push(root);
    const direction = target.clone().sub(outlet).normalize();
    const nozzleLength = 0.036;
    const nozzleBase = outlet.clone().addScaledVector(direction, -nozzleLength);
    const curve = new THREE.CubicBezierCurve3(controls[0], controls[1], controls[2], nozzleBase);
    const profile = [
      [0, -0.011], [0.0075, -0.011], [0.009, -0.008], [0.012, -0.003],
      [0.013, 0.004], [0.0125, 0.007], [0.008, 0.011], [0, 0.011],
    ].map(([radius, y]) => new THREE.Vector2(radius, y));
    const linkGeometry = new THREE.LatheGeometry(profile, 12);
    const blue = material(HOSE_BLUE, { roughness: 0.24, metalness: 0.05 });
    const orange = material(NOZZLE_ORANGE, { roughness: 0.3, metalness: 0.03 });
    this.geometries.add(linkGeometry);
    this.materials.add(blue);
    this.materials.add(orange);
    const count = Math.max(6, Math.ceil(curve.getLength() / 0.018));
    for (let i = 0; i < count; i++) {
      const fraction = (i + 0.5) / count;
      const link = new THREE.Mesh(linkGeometry, blue);
      link.name = `${name}_link_${i + 1}`;
      link.position.copy(curve.getPointAt(fraction));
      link.quaternion.setFromUnitVectors(UP, curve.getTangentAt(fraction));
      link.castShadow = true;
      link.receiveShadow = true;
      root.add(link);
    }
    const nozzleGeometry = new THREE.CylinderGeometry(NOZZLE_OUTLET_RADIUS, 0.013, nozzleLength, 12, 1, true);
    this.geometries.add(nozzleGeometry);
    const nozzle = new THREE.Mesh(nozzleGeometry, orange);
    nozzle.name = `${name}_orange_nozzle`;
    nozzle.position.copy(outlet).addScaledVector(direction, -nozzleLength / 2);
    nozzle.quaternion.setFromUnitVectors(UP, direction);
    nozzle.castShadow = true;
    root.add(nozzle);
    const fittingGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.02, 6);
    this.geometries.add(fittingGeometry);
    const fitting = new THREE.Mesh(fittingGeometry, orange);
    fitting.name = `${name}_fitting`;
    fitting.position.copy(controls[0]);
    fitting.quaternion.setFromUnitVectors(UP, curve.getTangentAt(0));
    root.add(fitting);
    const source = new THREE.Object3D();
    source.name = `${name}_outlet`;
    source.position.copy(outlet);
    root.add(source);
    return source;
  }

  private createJet(name: string, outlet: THREE.Object3D, surfaceNormal: THREE.Vector3): CoolantJet {
    const vertices = (JET_SEGMENTS + 1) * (JET_SIDES + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    for (let i = 0; i < JET_SEGMENTS; i++) for (let j = 0; j < JET_SIDES; j++) {
      const a = i * (JET_SIDES + 1) + j;
      const b = a + JET_SIDES + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geometry.setIndex(indices);
    const surface = new THREE.MeshBasicMaterial({ color: COOLANT_WHITE, vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.geometries.add(geometry);
    this.materials.add(surface);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.renderOrder = 3;
    this.root.add(mesh);
    const impactGeometry = new THREE.SphereGeometry(0.009, 10, 6);
    const impactSurface = new THREE.MeshBasicMaterial({ color: COOLANT_WHITE, transparent: true, opacity: 0, depthWrite: false });
    this.geometries.add(impactGeometry);
    this.materials.add(impactSurface);
    const impact = new THREE.Mesh(impactGeometry, impactSurface);
    impact.name = `${name}_impact`;
    impact.scale.set(1.5, 0.3, 1.2);
    impact.quaternion.setFromUnitVectors(UP, surfaceNormal);
    impact.renderOrder = 3;
    this.root.add(impact);
    const dropGeometry = new THREE.SphereGeometry(1, 6, 4);
    const dropSurface = new THREE.MeshBasicMaterial({ color: COOLANT_WHITE, transparent: true, opacity: 0, depthWrite: false });
    this.geometries.add(dropGeometry);
    this.materials.add(dropSurface);
    const splash = new THREE.InstancedMesh(dropGeometry, dropSurface, SPLASH_DROPS);
    splash.name = `${name}_local_splashes`;
    splash.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    splash.frustumCulled = false;
    splash.renderOrder = 3;
    this.root.add(splash);
    return { mesh, outlet, curve: new THREE.QuadraticBezierCurve3(), impact, splash, surfaceNormal };
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  update(dt: number): void {
    const frameTime = Math.min(Math.max(dt, 0), 0.05);
    this.intensity = THREE.MathUtils.lerp(this.intensity, this.active ? 1 : 0, 1 - Math.exp(-frameTime * 8));
    this.time += frameTime;
    this.root.visible = this.intensity > 0.005;
    if (!this.root.visible) return;
    this.model.worldToLocal(this.part.getWorldPosition(this.stockCenter));
    const radius = mm(this.geometry.diameter) / 2;
    const frontX = this.stockCenter.x + mm(this.geometry.length) / 2;
    const backX = Math.min(frontX, Math.max(this.stockCenter.x - mm(this.geometry.length) / 2, this.chuck.position.x + 0.159));
    if (this.turret) this.model.worldToLocal(this.turret.head.localToWorld(this.toolPoint.copy(this.turret.toolTip)));
    else this.toolPoint.copy(this.stockCenter);

    for (let i = 0; i < this.jets.length; i++) {
      const jet = this.jets[i];
      this.model.worldToLocal(jet.outlet.getWorldPosition(jet.curve.v0));
      jet.curve.v2.copy(this.stockCenter);
      if (i === 0) {
        jet.curve.v2.x = (frontX + backX) / 2;
        jet.curve.v2.y += radius;
      } else {
        jet.curve.v2.x = THREE.MathUtils.clamp(this.toolPoint.x, backX, frontX);
        jet.curve.v2.z -= radius;
      }
      jet.curve.v1.lerpVectors(jet.curve.v0, jet.curve.v2, 0.5);
      jet.curve.v1.y += jet.curve.v0.distanceTo(jet.curve.v2) * 0.18;
      this.updateJet(jet);
      jet.impact.position.copy(jet.curve.v2);
      (jet.impact.material as THREE.MeshBasicMaterial).opacity = this.intensity * 0.85;
      this.updateSplash(jet);
    }
  }

  private updateJet(jet: CoolantJet): void {
    const positions = jet.mesh.geometry.getAttribute('position');
    const colors = jet.mesh.geometry.getAttribute('color');
    for (let i = 0; i <= JET_SEGMENTS; i++) {
      const fraction = i / JET_SEGMENTS;
      jet.curve.getPoint(fraction, this.point);
      jet.curve.getTangent(fraction, this.tangent);
      this.reference.set(0, Math.abs(this.tangent.y) < 0.95 ? 1 : 0, Math.abs(this.tangent.y) < 0.95 ? 0 : 1);
      this.normal.crossVectors(this.tangent, this.reference).normalize();
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      const wave = Math.sin(fraction * 75 - this.time * 22);
      const radius = NOZZLE_OUTLET_RADIUS * (1 + wave * 0.035);
      const shade = 0.97 + wave * 0.03;
      for (let j = 0; j <= JET_SIDES; j++) {
        const angle = j / JET_SIDES * Math.PI * 2;
        const n = i * (JET_SIDES + 1) + j;
        const ripple = 1 + Math.sin(angle * 3 + fraction * 28 - this.time * 15) * 0.035;
        const a = Math.cos(angle) * radius * ripple;
        const b = Math.sin(angle) * radius * ripple;
        positions.setXYZ(n, this.point.x + this.normal.x * a + this.binormal.x * b,
          this.point.y + this.normal.y * a + this.binormal.y * b,
          this.point.z + this.normal.z * a + this.binormal.z * b);
        colors.setXYZ(n, shade, shade, shade);
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    jet.mesh.geometry.computeBoundingSphere();
    jet.mesh.material.opacity = this.intensity * 0.92;
  }

  private updateSplash(jet: CoolantJet): void {
    // Short ballistic droplets originate at the impact, rather than filling
    // the enclosure with the old, uniformly distributed mist particles.
    for (let i = 0; i < SPLASH_DROPS; i++) {
      const seed = (i * 0.618034) % 1;
      const phase = (this.time * 2.8 + seed) % 1;
      const age = phase * 0.36;
      const angle = i * 2.39996;
      this.dropletVelocity.set(Math.cos(angle) * 0.22, 0.12 + seed * 0.28, Math.sin(angle) * 0.25);
      this.dropletVelocity.addScaledVector(jet.surfaceNormal, 0.22);
      // Tangential component from the rotating workpiece.
      this.dropletVelocity.y -= jet.surfaceNormal.z * 0.18;
      this.dropletVelocity.z += jet.surfaceNormal.y * 0.18;
      this.dropletPosition.copy(jet.curve.v2).addScaledVector(this.dropletVelocity, age);
      this.dropletPosition.y -= 0.5 * 5.5 * age * age;
      this.dropletVelocity.y -= 5.5 * age;
      this.dropletRotation.setFromUnitVectors(UP, this.dropletVelocity.normalize());
      const size = (0.0012 + seed * 0.0015) * (1 - THREE.MathUtils.smoothstep(phase, 0.65, 1));
      this.dropletScale.set(size, size * (2 + phase * 3), size);
      this.dropletMatrix.compose(this.dropletPosition, this.dropletRotation, this.dropletScale);
      jet.splash.setMatrixAt(i, this.dropletMatrix);
    }
    jet.splash.instanceMatrix.needsUpdate = true;
    jet.splash.material.opacity = this.intensity * 0.78;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.hoses.forEach(hose => hose.removeFromParent());
    this.jets.forEach(jet => jet.splash.dispose());
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(surface => surface.dispose());
  }
}
