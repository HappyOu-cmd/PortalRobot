import * as THREE from 'three';
import type { SceneActivity, SceneAlarmTarget, SceneEquipmentTarget, VisualEffectSettings } from '../model/visualEffects';
import { COLORS } from './primitives';

export interface SceneEffectAnchor {
  ground: THREE.Vector3;
  service: THREE.Vector3;
}

export interface SceneEffectAnchors {
  machines: SceneEffectAnchor[];
  magazines: SceneEffectAnchor[];
  portal: SceneEffectAnchor;
  cell: { center: THREE.Vector3; length: number; width: number };
}

interface GroundMarker {
  root: THREE.Group;
  core: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

function keyForTarget(target: SceneAlarmTarget | SceneEquipmentTarget): string {
  return target.kind === 'machine' || target.kind === 'magazine'
    ? `${target.kind}:${target.index}`
    : target.kind;
}

function copyTargetAnchor(target: SceneEquipmentTarget, anchors: SceneEffectAnchors): SceneEffectAnchor | null {
  const values = target.kind === 'machine' ? anchors.machines : anchors.magazines;
  return values[target.index] ?? null;
}

export class OperationalEffects {
  readonly root = new THREE.Group();

  private readonly operationMarkers = new Map<string, GroundMarker>();
  private readonly alarmMarkers = new Map<string, GroundMarker>();
  private readonly cellBoundaryPositions = new Float32Array(5 * 3);
  private readonly cellBoundaryGeometry = new THREE.BufferGeometry();
  private readonly cellBoundaryMaterial = new THREE.LineBasicMaterial({
    color: COLORS.red,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  private readonly cellBoundary = new THREE.Line(this.cellBoundaryGeometry, this.cellBoundaryMaterial);
  private time = 0;
  private settings: VisualEffectSettings;
  private reducedMotion = false;
  private motionMedia?: MediaQueryList;

  constructor(settings: VisualEffectSettings) {
    this.settings = settings;
    this.root.name = 'operational_effects';
    this.root.renderOrder = 8;

    for (const kind of ['machine', 'magazine'] as const) {
      const count = kind === 'machine' ? 3 : 2;
      for (let index = 0; index < count; index += 1) {
        this.operationMarkers.set(`${kind}:${index}`, this.createMarker());
        this.alarmMarkers.set(`${kind}:${index}`, this.createMarker());
      }
    }
    this.alarmMarkers.set('portal', this.createMarker());

    this.cellBoundaryGeometry.setAttribute('position', new THREE.BufferAttribute(this.cellBoundaryPositions, 3));
    this.cellBoundary.visible = false;
    this.root.add(this.cellBoundary);

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
    if (!activity.live) {
      this.hideOperationEffects();
      this.hideAlarmEffects();
      return;
    }

    this.updateOperationEffects(activity, anchors);
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

  private createMarker(): GroundMarker {
    const root = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.46, 40),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.52, 40),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    core.rotation.x = -Math.PI / 2;
    pulse.rotation.x = -Math.PI / 2;
    root.visible = false;
    root.add(core, pulse);
    this.root.add(root);
    return { root, core, pulse };
  }

  private updateOperationEffects(activity: SceneActivity, anchors: SceneEffectAnchors): void {
    if (!this.settings.operationHighlight) {
      this.hideOperationEffects();
      return;
    }

    const visibleKeys = new Set<string>();
    activity.activeMagazines.forEach((index) => {
      const target = { kind: 'magazine' as const, index };
      const anchor = copyTargetAnchor(target, anchors);
      if (!anchor) return;
      const isTarget = activity.operationTarget?.kind === target.kind && activity.operationTarget.index === target.index;
      this.updateMarker(this.operationMarkers.get(keyForTarget(target)), anchor, isTarget ? COLORS.blue : COLORS.amber, isTarget ? 1 : 0.55);
      visibleKeys.add(keyForTarget(target));
    });
    this.operationMarkers.forEach((marker, key) => {
      if (!visibleKeys.has(key)) marker.root.visible = false;
    });

  }

  private updateAlarmEffects(activity: SceneActivity, anchors: SceneEffectAnchors): void {
    if (!this.settings.alarmBeacons) {
      this.hideAlarmEffects();
      return;
    }

    const visibleKeys = new Set<string>();
    let cellAlarm = false;
    activity.alarmTargets.forEach((target) => {
      if (target.kind === 'cell') {
        cellAlarm = true;
        return;
      }
      if (target.kind === 'machine') return;
      const key = keyForTarget(target);
      const anchor = target.kind === 'portal'
        ? anchors.portal
        : 'index' in target
          ? copyTargetAnchor(target, anchors)
          : null;
      if (!anchor) return;
      this.updateMarker(this.alarmMarkers.get(key), anchor, COLORS.red, 1.25);
      visibleKeys.add(key);
    });
    this.alarmMarkers.forEach((marker, key) => {
      if (!visibleKeys.has(key)) marker.root.visible = false;
    });
    this.updateCellBoundary(cellAlarm, anchors.cell);
  }

  private updateMarker(marker: GroundMarker | undefined, anchor: SceneEffectAnchor, color: number, intensity: number): void {
    if (!marker) return;
    marker.root.visible = true;
    marker.root.position.copy(anchor.ground);
    marker.root.position.y += 0.015;
    marker.root.scale.set(1, 1, 1);
    marker.core.material.color.setHex(color);
    marker.pulse.material.color.setHex(color);
    const wave = this.reducedMotion ? 0.35 : (Math.sin(this.time * 4.6) + 1) / 2;
    marker.core.material.opacity = 0.18 + wave * 0.18 * intensity;
    marker.pulse.material.opacity = this.reducedMotion ? 0 : (1 - wave) * 0.36 * intensity;
    const pulseScale = this.reducedMotion ? 1 : 1 + wave * 0.68;
    marker.core.scale.setScalar(this.reducedMotion ? 1 : 1 + wave * 0.08);
    marker.pulse.scale.setScalar(pulseScale);
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

  private hideOperationEffects(): void {
    this.operationMarkers.forEach((marker) => { marker.root.visible = false; });
  }

  private hideAlarmEffects(): void {
    this.alarmMarkers.forEach((marker) => { marker.root.visible = false; });
    this.cellBoundary.visible = false;
  }

}
