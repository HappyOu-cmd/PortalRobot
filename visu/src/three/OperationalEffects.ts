import * as THREE from 'three';
import type { SceneActivity, VisualEffectSettings } from '../model/visualEffects';
import { COLORS } from './primitives';
import { createButtonGlow } from './buttonParts';

export interface SceneEffectAnchor {
  ground: THREE.Vector3;
  service: THREE.Vector3;
  /** Точка визуального центра круга активной операции. */
  operation?: THREE.Vector3;
  operationRadius?: number;
}

export interface SceneEffectAnchors {
  machines: SceneEffectAnchor[];
  magazines: SceneEffectAnchor[];
  portal: SceneEffectAnchor;
  cell: { center: THREE.Vector3; length: number; width: number };
}

export class OperationalEffects {
  readonly root = new THREE.Group();

  private readonly cellBoundaryPositions = new Float32Array(5 * 3);
  private readonly cellBoundaryGeometry = new THREE.BufferGeometry();
  private readonly cellBoundaryMaterial = new THREE.LineBasicMaterial({
    color: COLORS.red,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  private readonly cellBoundary = new THREE.Line(this.cellBoundaryGeometry, this.cellBoundaryMaterial);
  private readonly machineAlarmGlows: THREE.Group[] = [];
  private readonly magazineAlarmGlows: THREE.Group[] = [];
  private readonly portalAlarmGlow: THREE.Group;
  private time = 0;
  private settings: VisualEffectSettings;
  private reducedMotion = false;
  private motionMedia?: MediaQueryList;

  constructor(settings: VisualEffectSettings) {
    this.settings = settings;
    this.root.name = 'operational_effects';
    this.root.renderOrder = 8;

    this.cellBoundaryGeometry.setAttribute('position', new THREE.BufferAttribute(this.cellBoundaryPositions, 3));
    this.cellBoundary.visible = false;
    this.root.add(this.cellBoundary);

    for (let index = 0; index < 3; index++) {
      const glow = this.createAlarmGlow(`machine_alarm_glow_${index + 1}`, 1.18);
      this.machineAlarmGlows.push(glow);
      this.root.add(glow);
    }
    for (let index = 0; index < 2; index++) {
      const glow = this.createAlarmGlow(`magazine_alarm_glow_${index + 1}`, 0.82);
      this.magazineAlarmGlows.push(glow);
      this.root.add(glow);
    }
    this.portalAlarmGlow = this.createAlarmGlow('robot_alarm_glow', 0.72);
    this.root.add(this.portalAlarmGlow);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionMedia.matches;
      this.motionMedia.addEventListener('change', this.handleMotionPreference);
    }
  }

  setSettings(settings: VisualEffectSettings): void {
    this.settings = settings;
  }

  update(dt: number, activity: SceneActivity, anchors: SceneEffectAnchors): void {
    this.time += dt;
    this.updateObjectAlarmGlows(activity, anchors);
    if (!activity.live) {
      this.cellBoundary.visible = false;
      return;
    }

    this.updateAlarmEffects(activity, anchors);
  }

  dispose(): void {
    this.motionMedia?.removeEventListener('change', this.handleMotionPreference);
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose();
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private readonly handleMotionPreference = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
  };

  private updateAlarmEffects(activity: SceneActivity, anchors: SceneEffectAnchors): void {
    if (!this.settings.alarmBeacons) {
      // Object halos are the primary alarm indication and stay available even
      // when the optional full-cell boundary is disabled in settings.
      this.cellBoundary.visible = false;
      return;
    }

    this.updateCellBoundary(activity.alarmTargets.some((target) => target.kind === 'cell'), anchors.cell);
  }

  private createAlarmGlow(name: string, diameter: number): THREE.Group {
    const root = new THREE.Group();
    root.name = name;
    root.visible = false;
    // Two crossed planes keep the same red-button halo readable from front,
    // iso and side camera presets. Alarm intensity is intentionally lower than
    // the illuminated red pushbutton (0.48).
    for (const rotationY of [0, Math.PI / 2]) {
      const glow = createButtonGlow(0xff3020, diameter);
      glow.material.side = THREE.DoubleSide;
      glow.material.depthTest = false;
      glow.material.uniforms.strength.value = 0;
      // The same halo shader is used by the buttons.  Equipment is viewed
      // from farther away, so make the ring a little wider without making it
      // brighter than a lit button.
      glow.scale.setScalar(1.35);
      glow.rotation.y = rotationY;
      glow.renderOrder = 10;
      root.add(glow);
    }
    return root;
  }

  private setObjectAlarmGlow(root: THREE.Group, position: THREE.Vector3, active: boolean, pulse: number): void {
    root.position.copy(position);
    root.visible = active;
    // Keep the equipment alarm glow below the button glow (0.48), but make
    // it readable in the wide cell view: 0.10..0.20.
    const strength = active ? 0.10 + pulse * 0.10 : 0;
    root.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.ShaderMaterial)) return;
      child.material.uniforms.strength.value = strength;
    });
  }

  private updateObjectAlarmGlows(activity: SceneActivity, anchors: SceneEffectAnchors): void {
    const pulse = this.reducedMotion ? 0.45 : (Math.sin(this.time * 3.2) + 1) / 2;
    this.machineAlarmGlows.forEach((glow, index) => {
      const anchor = anchors.machines[index];
      const active = activity.alarmTargets.some((target) => target.kind === 'machine' && target.index === index);
      if (anchor) this.setObjectAlarmGlow(glow, anchor.service, active, pulse);
    });
    this.magazineAlarmGlows.forEach((glow, index) => {
      const anchor = anchors.magazines[index];
      const active = activity.alarmTargets.some((target) => target.kind === 'magazine' && target.index === index);
      if (anchor) this.setObjectAlarmGlow(glow, anchor.service, active, pulse);
    });
    this.setObjectAlarmGlow(
      this.portalAlarmGlow,
      anchors.portal.service,
      activity.alarmTargets.some((target) => target.kind === 'portal'),
      pulse,
    );
  }

  private updateCellBoundary(visible: boolean, cell: SceneEffectAnchors['cell']): void {
    this.cellBoundary.visible = visible;
    if (!visible) return;
    const halfLength = cell.length / 2;
    const halfWidth = cell.width / 2;
    const y = cell.center.y + 0.024;
    const left = cell.center.x - halfLength;
    const right = cell.center.x + halfLength;
    const near = cell.center.z - halfWidth;
    const far = cell.center.z + halfWidth;
    this.cellBoundaryPositions[0] = left;
    this.cellBoundaryPositions[1] = y;
    this.cellBoundaryPositions[2] = near;
    this.cellBoundaryPositions[3] = right;
    this.cellBoundaryPositions[4] = y;
    this.cellBoundaryPositions[5] = near;
    this.cellBoundaryPositions[6] = right;
    this.cellBoundaryPositions[7] = y;
    this.cellBoundaryPositions[8] = far;
    this.cellBoundaryPositions[9] = left;
    this.cellBoundaryPositions[10] = y;
    this.cellBoundaryPositions[11] = far;
    this.cellBoundaryPositions[12] = left;
    this.cellBoundaryPositions[13] = y;
    this.cellBoundaryPositions[14] = near;
    (this.cellBoundaryGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    const wave = this.reducedMotion ? 0.45 : (Math.sin(this.time * 4.6) + 1) / 2;
    this.cellBoundaryMaterial.opacity = 0.32 + wave * 0.42;
  }

}
