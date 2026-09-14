import * as THREE from 'three';
import type { EquipmentInspection, InspectionNode, InspectionTarget } from '../model/equipmentInspection';

export interface InspectionEntry {
  target: InspectionTarget;
  root: THREE.Object3D;
  parts: Partial<Record<InspectionNode, THREE.Object3D[]>>;
}

export function isObjectVisible(object: THREE.Object3D): boolean {
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return false;
  return true;
}

export function inspectionBounds(objects: THREE.Object3D[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const root of objects) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.inspectionOverlay) return;
      if (object instanceof THREE.InstancedMesh) {
        object.computeBoundingBox();
        if (object.boundingBox) bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      } else {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
  }
  return bounds;
}

/** Uses existing geometry and transforms; owns only overlay materials and the outline. */
export class EquipmentInspectionLayer {
  private hidden = new Map<THREE.Object3D, boolean>();
  private overlays: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private signature = '';
  private readonly outline = new THREE.Box3Helper(new THREE.Box3(), 0x1473e6);
  private readonly outlineMaterial = this.outline.material as THREE.LineBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.outline.visible = false;
    this.outlineMaterial.depthTest = false;
    this.outlineMaterial.transparent = true;
    this.outlineMaterial.opacity = 0.7;
    this.outline.renderOrder = 102;
    scene.add(this.outline);
  }

  restoreVisibility(): void {
    this.hidden.forEach((visible, object) => { object.visible = visible; });
    this.hidden.clear();
  }

  private clearOverlays(): void {
    for (const overlay of this.overlays) {
      overlay.removeFromParent();
      overlay.material.dispose();
    }
    this.overlays = [];
  }

  update(root: THREE.Object3D, entry: InspectionEntry | undefined, inspection: EquipmentInspection | null,
    elapsed: number, reducedMotion: boolean): void {
    if (!entry || !inspection) {
      this.restoreVisibility();
      this.clearOverlays();
      this.signature = '';
      this.outline.visible = false;
      return;
    }
    const ancestors = new Set<THREE.Object3D>();
    for (let parent: THREE.Object3D | null = entry.root; parent; parent = parent.parent) ancestors.add(parent);
    const isolate = (object: THREE.Object3D) => {
      if (object === entry.root) return;
      if (!ancestors.has(object)) {
        this.hidden.set(object, object.visible);
        object.visible = false;
      } else object.children.forEach(isolate);
    };
    isolate(root);

    const nodes = new Set(inspection.issues.filter((issue) => issue.severity === 'alarm').map((issue) => issue.node));
    const signature = `${entry.root.uuid}:${inspection.selectedNode}:${inspection.xray}:${[...nodes].sort().join(',')}:${Object.values(entry.parts).flat().map((part) => part.uuid).join(',')}`;
    if (signature !== this.signature) {
      this.clearOverlays();
      this.signature = signature;
      const seen = new Set<THREE.Object3D>();
      const tintedNodes = new Set([...nodes, ...(inspection.selectedNode ? [inspection.selectedNode] : [])]);
      for (const node of tintedNodes) {
        if (node === 'equipment') continue; // An unlocalized fault gets an outline, not invented faulty parts.
        for (const part of entry.parts[node] ?? []) {
          const meshes: THREE.Mesh[] = [];
          part.traverseVisible((object) => {
            if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh)
              && !object.userData.inspectionOverlay && !seen.has(object)) meshes.push(object);
          });
          for (const mesh of meshes) {
            seen.add(mesh);
            const surface = new THREE.MeshBasicMaterial({
              color: nodes.has(node) ? 0xf03539 : 0x1473e6, transparent: true, opacity: 0.28,
              depthTest: !inspection.xray, depthWrite: false, polygonOffset: true,
              polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
            });
            const overlay = new THREE.Mesh(mesh.geometry, surface);
            overlay.userData.inspectionOverlay = true;
            overlay.userData.alarm = nodes.has(node);
            overlay.renderOrder = 101;
            overlay.raycast = () => {};
            mesh.add(overlay);
            this.overlays.push(overlay);
          }
        }
      }
    }
    for (const overlay of this.overlays) {
      overlay.material.opacity = overlay.userData.alarm
        ? 0.32 + (reducedMotion ? 0 : Math.sin(elapsed * 3) * 0.10) : 0.18;
    }
    const selected = inspection.selectedNode;
    this.outlineMaterial.depthTest = !inspection.xray;
    const objects = selected && selected !== 'equipment' ? entry.parts[selected] ?? [] : nodes.has('equipment') ? [entry.root] : [];
    const bounds = inspectionBounds(objects);
    this.outline.visible = !bounds.isEmpty();
    this.outline.box.copy(bounds).expandByScalar(0.012);
    this.outlineMaterial.color.setHex(nodes.has(selected ?? 'equipment') ? 0xe13d43 : 0x1473e6);
  }

  dispose(): void {
    this.restoreVisibility();
    this.clearOverlays();
    this.outline.removeFromParent();
    this.outline.geometry.dispose();
    this.outlineMaterial.dispose();
  }
}
