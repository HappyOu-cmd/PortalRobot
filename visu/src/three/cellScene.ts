import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  CellLayout,
  CellState,
  RobotCoordinateFrame,
} from '../model/types';
import { DEFAULT_DRIFT_SETTINGS, type DriftSettings, type DriftTelemetry, type EasterEggMode } from '../model/easterEggs';
import {
  DEFAULT_VISUAL_EFFECT_SETTINGS,
  EMPTY_SCENE_ACTIVITY,
  type SceneActivity,
  type SceneEquipmentTarget,
  type VisualEffectSettings,
} from '../model/visualEffects';
import { EasterEggController } from './easterEggs';
import { createMachine, disposeMachineRig, type MachineRig, updateMachineRig } from './machine';
import { createPortal, type PortalRig, updatePortalRig } from './portal';
import { createEnclosure, type EnclosureRig, updateEnclosure } from './enclosure';
import { createControlCabinets, disposeControlCabinets, updateControlCabinets, type ControlCabinetsRig } from './controlCabinets';
import { createMpgPendant, disposeMpgPendant, updateMpgPendant, type MpgPendantRig } from './mpgPendant';
import { createStaticMagazine, type StaticMagazineRig, updateStaticMagazineRig } from './staticMagazine';
import { OperationalEffects, type SceneEffectAnchors } from './OperationalEffects';
import { COLORS, disposeObject, logicalPosition, material, mm } from './primitives';
import { inspectionKey, inspectionSlot, type EquipmentInspection, type InspectionTarget, type InspectionNode } from '../model/equipmentInspection';
import { EquipmentInspectionLayer, inspectionBounds, isObjectVisible, type InspectionEntry } from './equipmentInspection';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top';

export interface ScreenAnchor {
  x: number;
  y: number;
  visible: boolean;
}

export interface EquipmentAnchors {
  machines: ScreenAnchor[];
  magazines: ScreenAnchor[];
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

interface CameraFlight {
  elapsed: number;
  duration: number;
  startPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  startFov: number;
  end: CameraPose;
}

const getRenderPixelRatio = (): number => Math.min(2, Math.max(1, window.devicePixelRatio || 1));

export class CellScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly clock = new THREE.Clock();
  private cellRoot = new THREE.Group();
  private machineRigs: MachineRig[] = [];
  private portalRig?: PortalRig;
  private enclosureRig?: EnclosureRig;
  private controlCabinetsRig?: ControlCabinetsRig;
  private mpgPendantRig?: MpgPendantRig;
  private staticMagazineRigs: StaticMagazineRig[] = [];
  private easterEggController?: EasterEggController;
  private easterEggMode: EasterEggMode = 'off';
  private easterEggRevision = 0;
  private operationalEffects?: OperationalEffects;
  private state: CellState;
  private layout: CellLayout;
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private selectedMachine: number | null = null;
  private cameraPreset: CameraPreset = 'iso';
  private driftSettings: DriftSettings = DEFAULT_DRIFT_SETTINGS;
  private visualEffects: VisualEffectSettings = DEFAULT_VISUAL_EFFECT_SETTINGS;
  private sceneActivity: SceneActivity = EMPTY_SCENE_ACTIVITY;
  private focusTarget: SceneEquipmentTarget | null = null;
  private activeFocusKey: string | null = null;
  private cameraFlight?: CameraFlight;
  private inspection: EquipmentInspection | null = null;
  private inspectionEnabled = false;
  private inspectionLayer: EquipmentInspectionLayer;
  private inspectionEntries: InspectionEntry[] = [];
  private inspectionModelSignature = '';
  private inspectionCameraKey = '';
  private savedCamera?: CameraPose;
  private pointerDown: { id: number; x: number; y: number; moved: boolean } | null = null;
  private activePointers = new Set<number>();
  private inspectionElapsed = 0;
  private slotMarker?: THREE.Mesh;
  private effectAnchors: SceneEffectAnchors = {
    machines: [],
    magazines: [],
    portal: { ground: new THREE.Vector3(), service: new THREE.Vector3() },
    cell: { center: new THREE.Vector3(), length: 0, width: 0 },
  };

  constructor(
    private readonly host: HTMLElement,
    layout: CellLayout,
    state: CellState,
    private readonly getRobotCoordinates: () => RobotCoordinateFrame,
    private readonly onMachineSelect: (index: number) => void,
    private readonly onMagazineSelect?: (magazineId: 1 | 2) => void,
    private readonly onAnchorsUpdate?: (anchors: EquipmentAnchors) => void,
    private readonly onDriftTelemetry?: (telemetry: DriftTelemetry) => void,
    private readonly onEquipmentInspect?: (target: InspectionTarget, node?: InspectionNode) => void,
  ) {
    this.layout = layout;
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(getRenderPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'cell-canvas';
    this.host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 18, 34);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.addEventListener('start', this.cancelCameraFlight);

    this.addLights();
    this.inspectionLayer = new EquipmentInspectionLayer(this.scene);
    this.scene.add(this.cellRoot);
    this.rebuild(layout);
    this.setCamera('iso');

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerCancel);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resizeObserver.observe(this.renderer.domElement);
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.resize();
    this.animate();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xaab6c0, 2.25));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0002;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9e0ff, 1.1);
    fill.position.set(-7, 5, -4);
    this.scene.add(fill);
  }

  private createFloor(layout: CellLayout): THREE.Group {
    const root = new THREE.Group();
    const length = mm(layout.floor.lengthX);
    const width = mm(layout.floor.widthY);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, width), material(COLORS.floor, { roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(length / 2, -0.012, -width / 2);
    floor.receiveShadow = true;
    root.add(floor);

    const grid = new THREE.GridHelper(Math.max(length, width), Math.round(Math.max(length, width) / 0.5), COLORS.grid, 0xd6dfe6);
    grid.position.set(length / 2, 0.002, -width / 2);
    (grid.material as THREE.Material).opacity = 0.46;
    (grid.material as THREE.Material).transparent = true;
    root.add(grid);

    const boundary = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(length, 0.018, width)),
      new THREE.LineBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.65 }),
    );
    boundary.position.set(length / 2, 0.006, -width / 2);
    root.add(boundary);
    return root;
  }

  rebuild(layout: CellLayout): void {
    this.inspectionLayer?.update(this.cellRoot, undefined, null, 0, true);
    this.inspectionEntries = [];
    this.inspectionModelSignature = '';
    this.inspectionCameraKey = '';
    this.slotMarker = undefined;
    this.layout = layout;
    if (this.controlCabinetsRig) disposeControlCabinets(this.controlCabinetsRig);
    if (this.mpgPendantRig) disposeMpgPendant(this.mpgPendantRig);
    this.easterEggController?.dispose();
    this.easterEggController = undefined;
    this.operationalEffects?.dispose();
    this.operationalEffects = undefined;
    this.machineRigs.forEach(disposeMachineRig);
    this.scene.remove(this.cellRoot);
    disposeObject(this.cellRoot);
    this.cellRoot = new THREE.Group();
    this.cellRoot.name = 'Cell';
    this.cellRoot.add(this.createFloor(layout));
    this.machineRigs = layout.machine.machines.map((_, index) => createMachine(layout, index));
    this.machineRigs.forEach((rig) => this.cellRoot.add(rig.root));
    this.portalRig = createPortal(layout);
    this.cellRoot.add(this.portalRig.root);
    this.enclosureRig = createEnclosure(layout);
    this.cellRoot.add(this.enclosureRig.root);
    this.controlCabinetsRig = createControlCabinets(layout);
    this.cellRoot.add(this.controlCabinetsRig.root);
    const buttonPost = this.enclosureRig.buttonStations.find(({ id }) => id === 'magazine-1-front');
    this.mpgPendantRig = createMpgPendant(layout, buttonPost?.rig.root.position.y ?? 1.15);
    this.cellRoot.add(this.mpgPendantRig.root);
    this.staticMagazineRigs = layout.staticMagazines.map((config, index) => {
      const rig = createStaticMagazine(
        config,
        layout.partGeometry,
        layout.productPartMaterials,
        (index + 1) as 1 | 2,
      );
      this.cellRoot.add(rig.root);
      return rig;
    });
    this.easterEggController = new EasterEggController(layout, this.onDriftTelemetry, this.driftSettings);
    this.easterEggController.setMode(this.easterEggMode, this.easterEggRevision);
    this.cellRoot.add(this.easterEggController.root);
    this.effectAnchors = {
      machines: this.machineRigs.map(() => ({ ground: new THREE.Vector3(), service: new THREE.Vector3() })),
      magazines: this.staticMagazineRigs.map(() => ({
        ground: new THREE.Vector3(),
        service: new THREE.Vector3(),
        operation: new THREE.Vector3(),
      })),
      portal: { ground: new THREE.Vector3(), service: new THREE.Vector3() },
      cell: { center: new THREE.Vector3(), length: mm(layout.floor.lengthX), width: mm(layout.floor.widthY) },
    };
    this.operationalEffects = new OperationalEffects(this.visualEffects);
    this.cellRoot.add(this.operationalEffects.root);
    this.scene.add(this.cellRoot);
    this.setSelectedMachine(this.selectedMachine);
    this.activeFocusKey = null;
  }

  setState(state: CellState): void {
    this.state = state;
  }

  setInspectionEnabled(enabled: boolean): void { this.inspectionEnabled = enabled; }
  refocusInspection(): void { this.inspectionCameraKey = ''; }

  setInspection(inspection: EquipmentInspection | null): void {
    const modeChanged = !!inspection !== !!this.inspection;
    if (inspection && !this.inspection) {
      this.savedCamera = { position: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
      this.controls.minDistance = 0.08;
    }
    if (!inspection && this.inspection) {
      this.inspectionLayer.update(this.cellRoot, undefined, null, 0, true);
      this.inspectionCameraKey = '';
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 26;
      this.setSelectedMachine(this.selectedMachine);
      this.activeFocusKey = this.visualEffects.cameraFocus && this.focusTarget ? `${this.focusTarget.kind}:${this.focusTarget.index}` : 'preset';
      if (this.savedCamera) this.startCameraFlight(this.savedCamera, 0.26);
      this.savedCamera = undefined;
    }
    this.inspection = inspection;
    if (modeChanged) this.resize();
  }

  private refreshInspectionEntries(): void {
    const signature = this.machineRigs.map((rig) => rig.door?.uuid ?? 'loading').join(',');
    if (signature === this.inspectionModelSignature && this.inspectionEntries.length) return;
    this.inspectionModelSignature = signature;
    const entries: InspectionEntry[] = [];
    const parts = (...objects: (THREE.Object3D | undefined)[]) => objects.filter((object): object is THREE.Object3D => !!object);
    this.machineRigs.forEach((rig, index) => entries.push({ target: { kind: 'machine', index }, root: rig.root,
      parts: { door: parts(rig.door), hatch: parts(rig.hatch, rig.hatchMechanism?.actuator),
        'hatch-lock': parts(rig.hatchMechanism?.lock), chuck: parts(rig.chuck) } }));
    if (this.portalRig) {
      const rig = this.portalRig;
      entries.push({ target: { kind: 'robot' }, root: rig.root, parts: {
        'axis-x': parts(rig.root.getObjectByName('axis_x_servo')), 'axis-y': parts(rig.root.getObjectByName('axis_y_servo')),
        'axis-z': parts(rig.root.getObjectByName('axis_z_servo')), 'gripper-1': [rig.gripper.gripper1],
        'gripper-2': [rig.gripper.gripper2], rotation: parts(rig.root.getObjectByName('gripper_rotary_actuator'), rig.root.getObjectByName('gripper_hub')),
      } });
    }
    this.staticMagazineRigs.forEach((rig, index) => {
      const cassette: THREE.Object3D[] = [];
      rig.root.traverse((object) => { if (object.name.includes('cassette') && object instanceof THREE.Mesh) cassette.push(object); });
      entries.push({ target: { kind: 'magazine', index }, root: rig.root, parts: { cassette } });
    });
    this.enclosureRig?.buttonStations.forEach(({ id, rig }) => entries.push({ target: { kind: 'station', id }, root: rig.root,
      parts: { 'emergency-stop': [rig.emergencyStop.root] } }));
    if (this.controlCabinetsRig) {
      const rig = this.controlCabinetsRig;
      for (const side of ['front', 'rear'] as const) {
        const button = side === 'front' ? rig.frontEmergencyStop : rig.rearEmergencyStop;
        if (button.root.parent) entries.push({ target: { kind: 'cabinet', side }, root: button.root.parent,
          parts: { 'emergency-stop': [button.root],
            'phase-relay': parts(rig.root.getObjectByName('rear_cabinet_phase_relay_warning')),
            'safety-relay': parts(rig.root.getObjectByName('rear_cabinet_phase_relay_warning')) } });
      }
      entries.push({ target: { kind: 'air' }, root: rig.airPreparation.root, parts: { pressure: parts(
        rig.airPreparation.root.getObjectByName('air_pressure_gauge'), rig.airPreparation.root.getObjectByName('air_pressure_switch')) } });
    }
    for (const entry of entries) {
      entry.root.userData.inspectionTarget = entry.target;
      for (const [node, objects] of Object.entries(entry.parts)) for (const object of objects) object.userData.inspectionNode = node;
    }
    this.inspectionEntries = entries;
  }

  private updateInspection(): void {
    this.refreshInspectionEntries();
    const inspection = this.inspection;
    const entry = inspection ? this.inspectionEntries.find((item) => inspectionKey(item.target) === inspectionKey(inspection.target)) : undefined;
    if (this.slotMarker) this.slotMarker.visible = false;
    if (entry && inspection?.target.kind === 'magazine') {
      const rig = this.staticMagazineRigs[inspection.target.index];
      const slot = inspectionSlot(this.state, inspection.target);
      if (slot !== null) {
        if (!this.slotMarker) {
          this.slotMarker = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 40), new THREE.MeshBasicMaterial({ color: 0x677e92 }));
          this.slotMarker.name = 'inspection_slot_location';
          this.slotMarker.rotation.x = -Math.PI / 2;
          this.slotMarker.userData.inspectionNode = 'slot';
        }
        rig.root.add(this.slotMarker);
        this.slotMarker.scale.setScalar(Math.min(rig.pitchX, rig.pitchY) * 0.88);
        this.slotMarker.position.set(-4.5 * rig.pitchX + (slot % 10) * rig.pitchX, rig.workingHeight + 0.005, -Math.floor(slot / 10) * rig.pitchY);
        this.slotMarker.visible = true;
        entry.parts.slot = [this.slotMarker];
      } else entry.parts.slot = [];
    }
    if (entry && inspection) {
      this.machineRigs.forEach((rig) => { rig.selection.visible = false; });
      const cameraKey = `${inspectionKey(inspection.target)}:${inspection.selectedNode}:${this.inspectionModelSignature}`;
      if (cameraKey !== this.inspectionCameraKey) {
        const selectedParts = inspection.selectedNode ? entry.parts[inspection.selectedNode] : undefined;
        let bounds = inspectionBounds(selectedParts?.length ? selectedParts : [entry.root]);
        if (bounds.isEmpty()) bounds = new THREE.Box3().setFromCenterAndSize(entry.root.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(1, 1, 1));
        const target = bounds.getCenter(new THREE.Vector3());
        const radius = Math.max(0.045, bounds.getSize(new THREE.Vector3()).length() / 2);
        const halfFov = THREE.MathUtils.degToRad(32 / 2);
        const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
        const distance = radius / Math.sin(limitingFov) * 1.16;
        this.controls.maxDistance = Math.max(26, distance * 1.3);
        const rear = inspection.target.kind === 'air' || (inspection.target.kind === 'cabinet' && inspection.target.side === 'rear')
          || (inspection.target.kind === 'station' && inspection.target.id.endsWith('rear'));
        const offset = new THREE.Vector3(0.35, inspection.target.kind === 'magazine' ? 0.9 : 0.4, rear ? -1 : 1).normalize().multiplyScalar(distance);
        this.startCameraFlight({ target, position: target.clone().add(offset), fov: 32 }, 0.42);
        this.inspectionCameraKey = cameraKey;
      }
    }
    this.inspectionLayer.update(this.cellRoot, entry, inspection, this.inspectionElapsed,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  setEasterEgg(mode: EasterEggMode, revision = 0): void {
    const controlledCameraBefore = this.easterEggController?.controlsCamera ?? false;
    this.easterEggMode = mode;
    this.easterEggRevision = revision;
    this.easterEggController?.setMode(mode, revision);
    const controlledCameraNow = this.easterEggController?.controlsCamera ?? false;
    this.controls.enabled = !controlledCameraNow;
    if (controlledCameraBefore && !controlledCameraNow) this.setCamera(this.cameraPreset);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = controlledCameraNow ? 38 : 18;
      this.scene.fog.far = controlledCameraNow ? 86 : 34;
    }
  }

  setDriftSettings(settings: DriftSettings): void {
    this.driftSettings = settings;
    this.easterEggController?.setDriftSettings(settings);
  }

  setVisualEffects(settings: VisualEffectSettings): void {
    this.visualEffects = settings;
    this.operationalEffects?.setSettings(settings);
    this.activeFocusKey = null;
  }

  setSceneActivity(activity: SceneActivity): void {
    this.sceneActivity = activity;
  }

  setFocusTarget(target: SceneEquipmentTarget | null): void {
    const sameTarget = target?.kind === this.focusTarget?.kind && target?.index === this.focusTarget?.index;
    if (sameTarget) return;
    this.focusTarget = target ? { ...target } : null;
    this.activeFocusKey = null;
  }

  setSelectedMachine(index: number | null): void {
    this.selectedMachine = index;
    this.machineRigs.forEach((rig, machineIndex) => {
      rig.selection.visible = machineIndex === index;
    });
  }

  setCamera(preset: CameraPreset): void {
    this.cameraPreset = preset;
    if (this.easterEggController?.controlsCamera) return;
    if (this.inspection) { this.inspectionCameraKey = ''; return; }
    this.cameraFlight = undefined;
    this.applyCameraPose(this.createPresetCameraPose());
    this.activeFocusKey = null;
  }

  getZoomLevel(): number {
    const distanceRange = this.controls.maxDistance - this.controls.minDistance;
    if (distanceRange <= 0) return 0;
    const distance = this.camera.position.distanceTo(this.controls.target);
    return THREE.MathUtils.clamp(
      (this.controls.maxDistance - distance) / distanceRange,
      0,
      1,
    );
  }

  setZoomLevel(level: number): void {
    if (this.easterEggController?.controlsCamera) return;
    const normalized = THREE.MathUtils.clamp(level, 0, 1);
    const distance = THREE.MathUtils.lerp(
      this.controls.maxDistance,
      this.controls.minDistance,
      normalized,
    );
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (offset.lengthSq() < 0.000001) offset.set(0, 0, 1);
    offset.setLength(distance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  private createPresetCameraPose(): CameraPose {
    // The rigid Z ram extends above the bridge even when the tool is raised.
    // Frame the full home-height envelope, not only the machines below it.
    const portalTop = this.portalRig
      ? mm(this.layout.portal.position.z + this.layout.portal.frameBottomZ
        + this.layout.portal.frameThicknessZ + this.layout.robot.yBeamHeight * 0.72)
        - this.portalRig.zHomeDrop + this.portalRig.mastLength + 0.24
      : 4;
    const center = logicalPosition(this.layout.floor.lengthX * 0.5, this.layout.floor.widthY * 0.45, 0);
    const target = center.clone();
    target.y = portalTop * 0.38;
    const position = new THREE.Vector3();
    if (this.cameraPreset === 'front') position.set(center.x, target.y + 4, 14.5);
    if (this.cameraPreset === 'side') position.set(center.x + 14.5, target.y + 4, center.z);
    if (this.cameraPreset === 'top') position.set(center.x, 15.5, center.z + 0.01);
    if (this.cameraPreset === 'iso') position.set(center.x + 4.2, target.y + 6.5, center.z + 13.6);
    return { position, target, fov: 34 };
  }

  private createFocusCameraPose(anchor: THREE.Vector3): CameraPose {
    const target = anchor.clone();
    const position = target.clone().add(new THREE.Vector3(0, 2.85, 6.65));
    return { position, target, fov: 32 };
  }

  private applyCameraPose(pose: CameraPose): void {
    this.camera.position.copy(pose.position);
    this.camera.fov = pose.fov;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(pose.target);
    this.camera.lookAt(pose.target);
    this.controls.update();
  }

  private startCameraFlight(end: CameraPose, duration = 0.7): void {
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.cameraFlight = undefined;
      this.applyCameraPose(end);
      return;
    }
    this.cameraFlight = {
      elapsed: 0,
      duration,
      startPosition: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      startFov: this.camera.fov,
      end,
    };
  }

  private updateCameraFocus(dt: number): void {
    if (this.easterEggController?.controlsCamera) return;
    const target = this.visualEffects.cameraFocus ? this.focusTarget : null;
    const key = target ? `${target.kind}:${target.index}` : 'preset';
    if (!this.inspection && key !== this.activeFocusKey) {
      const anchor = target
        ? (target.kind === 'machine' ? this.effectAnchors.machines : this.effectAnchors.magazines)[target.index]?.service
        : null;
      if (target && !anchor) return;
      this.activeFocusKey = key;
      this.startCameraFlight(anchor ? this.createFocusCameraPose(anchor) : this.createPresetCameraPose());
    }
    const flight = this.cameraFlight;
    if (!flight) return;
    flight.elapsed = Math.min(flight.duration, flight.elapsed + dt);
    const progress = flight.duration === 0 ? 1 : flight.elapsed / flight.duration;
    const eased = 1 - (1 - progress) ** 3;
    this.camera.position.lerpVectors(flight.startPosition, flight.end.position, eased);
    this.controls.target.lerpVectors(flight.startTarget, flight.end.target, eased);
    this.camera.fov = THREE.MathUtils.lerp(flight.startFov, flight.end.fov, eased);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    if (progress >= 1) this.cameraFlight = undefined;
  }

  private readonly cancelCameraFlight = (): void => {
    this.cameraFlight = undefined;
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.renderer.domElement.clientWidth || this.host.clientWidth);
    const height = Math.max(1, this.renderer.domElement.clientHeight || this.host.clientHeight);
    const pixelRatio = getRenderPixelRatio();
    if (Math.abs(this.renderer.getPixelRatio() - pixelRatio) > 0.001) {
      this.renderer.setPixelRatio(pixelRatio);
    }
    const aspect = width / height;
    if (this.inspection && Math.abs(this.camera.aspect - aspect) > 0.001) this.inspectionCameraKey = '';
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.activePointers.add(event.pointerId);
    if (event.button !== 0 || this.activePointers.size > 1) { this.pointerDown = null; return; }
    this.pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerDown && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 6) this.pointerDown.moved = true;
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    this.pointerDown = null;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.id !== event.pointerId || down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = this.inspectionEnabled ? this.inspectionEntries.map((entry) => entry.root) : [
      ...this.machineRigs.map((rig) => rig.root),
      ...this.staticMagazineRigs.map((rig) => rig.root),
    ];
    const hit = this.raycaster.intersectObjects(roots.filter(isObjectVisible), true).find((item) => isObjectVisible(item.object));
    if (this.inspectionEnabled && this.onEquipmentInspect) {
      let object: THREE.Object3D | null = hit?.object ?? null;
      let node: InspectionNode | undefined;
      while (object) {
        node ??= object.userData.inspectionNode as InspectionNode | undefined;
        if (object.userData.inspectionTarget) {
          event.stopPropagation();
          this.onEquipmentInspect(object.userData.inspectionTarget as InspectionTarget, this.inspection ? node : undefined);
          return;
        }
        object = object.parent;
      }
      return;
    }
    let selected: THREE.Object3D | null = hit?.object ?? null;
    while (selected && !Number.isInteger(selected.userData.machineIndex) && !Number.isInteger(selected.userData.magazineId)) {
      selected = selected.parent;
    }
    if (selected && Number.isInteger(selected.userData.machineIndex)) {
      event.stopPropagation();
      this.onMachineSelect(selected.userData.machineIndex as number);
    } else if (selected && Number.isInteger(selected.userData.magazineId)) {
      event.stopPropagation();
      this.onMagazineSelect?.(selected.userData.magazineId as 1 | 2);
    }
  };

  private projectAnchor(position: THREE.Vector3): ScreenAnchor {
    const projected = position.clone().project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * this.host.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * this.host.clientHeight,
      visible: projected.z >= -1 && projected.z <= 1
        && projected.x >= -1.1 && projected.x <= 1.1
        && projected.y >= -1.1 && projected.y <= 1.1,
    };
  }

  private updateEquipmentAnchors(): void {
    if (!this.onAnchorsUpdate || this.staticMagazineRigs.length === 0) return;
    const machineWidth = mm(this.layout.machine.sizeX);
    const machines = this.machineRigs.map((rig) => this.projectAnchor(
      rig.root.localToWorld(new THREE.Vector3(machineWidth / 2, 0.03, 0.58)),
    ));
    const magazines = this.staticMagazineRigs.map((rig, index) => {
      const config = this.layout.staticMagazines[index];
      return this.projectAnchor(rig.root.localToWorld(new THREE.Vector3(
        0,
        mm(config.workingHeight) + 0.14,
        -mm((12 - 1) * config.pitchY) / 2,
      )));
    });
    this.onAnchorsUpdate({ machines, magazines });
  }

  private updateEffectAnchors(): void {
    const machineWidth = mm(this.layout.machine.sizeX);
    const machineDepth = mm(this.layout.machine.sizeY);
    const machineHeight = mm(this.layout.machine.sizeZ);
    this.machineRigs.forEach((rig, index) => {
      const anchor = this.effectAnchors.machines[index];
      if (!anchor) return;
      if (rig.chuck) {
        rig.chuck.getWorldPosition(anchor.ground);
        anchor.ground.y = 0.012;
      } else {
        // Пока GLB не загрузился, используем положение патрона внутри габарита модели.
        rig.root.localToWorld(anchor.ground.set(machineWidth * 0.3, 0.012, -machineDepth * 0.3));
      }
      rig.root.localToWorld(anchor.service.set(machineWidth / 2, machineHeight * 0.46, -machineDepth * 0.04));
      // Выделяем рабочую зону вокруг патрона, не захватывая стружкоотвод.
      anchor.operationRadius = Math.min(machineWidth * 0.46, machineDepth * 0.78);
    });
    this.staticMagazineRigs.forEach((rig, index) => {
      const anchor = this.effectAnchors.magazines[index];
      const config = this.layout.staticMagazines[index];
      if (!anchor || !config) return;
      const centerZ = -mm((12 - 1) * config.pitchY) / 2;
      rig.root.localToWorld(anchor.ground.set(0, 0.012, centerZ));
      rig.root.localToWorld(anchor.service.set(0, mm(config.workingHeight) + 0.12, centerZ));
      // Для круга активной операции берём центр кассеты, а не проекцию на пол.
      if (anchor.operation) {
        rig.root.localToWorld(anchor.operation.set(0, mm(config.workingHeight), centerZ));
      }
    });
    if (this.portalRig) {
      this.portalRig.gripperMount.getWorldPosition(this.effectAnchors.portal.service);
      this.effectAnchors.portal.ground.copy(this.effectAnchors.portal.service);
      this.effectAnchors.portal.ground.y = 0.012;
    }
    this.effectAnchors.cell.center.copy(logicalPosition(
      this.layout.floor.lengthX / 2,
      this.layout.floor.widthY / 2,
      0,
    ));
  }

  private readonly animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.inspectionElapsed += dt;
    this.inspectionLayer.restoreVisibility();
    if (this.controlCabinetsRig) updateControlCabinets(this.controlCabinetsRig, this.state.controlCabinets, dt, !!this.inspection);
    if (this.mpgPendantRig) updateMpgPendant(this.mpgPendantRig, this.state.mpgPendant, dt);
    if (this.enclosureRig) updateEnclosure(
      this.enclosureRig,
      this.state.enclosureDoors,
      dt,
      this.layout.animation.mechanismResponse,
      this.visualEffects.enclosureOpacity,
      this.state.buttonStations,
      this.state.magazines.map((magazine) => magazine.state.enabled),
    );
    if (this.portalRig) {
      const alarmTargetActive = this.sceneActivity.alarmTargets.some((target) => target.kind === 'portal');
      updatePortalRig(
        this.portalRig,
        this.state.robot,
        this.getRobotCoordinates(),
        this.layout,
        dt,
        alarmTargetActive,
        !!this.inspection,
      );
    }
    this.machineRigs.forEach((rig, index) => {
      const state = this.state.machines[index];
      const alarmTargetActive = this.sceneActivity.alarmTargets.some(
        (target) => target.kind === 'machine' && target.index === index,
      );
      if (state) updateMachineRig(rig, state, dt, this.layout, alarmTargetActive, !!this.inspection);
    });
    this.staticMagazineRigs.forEach((rig, index) => {
      const alarmTargetActive = this.sceneActivity.alarmTargets.some(
        (target) => target.kind === 'magazine' && target.index === index,
      );
      updateStaticMagazineRig(
        rig,
        this.state.magazines[index] ?? this.state.magazines[0],
        dt,
        alarmTargetActive,
        !!this.inspection,
      );
    });
    this.updateEffectAnchors();
    this.operationalEffects?.update(dt, this.sceneActivity, this.effectAnchors);
    this.easterEggController?.update(dt, this.camera);
    this.updateInspection();
    if (!this.easterEggController?.controlsCamera) {
      this.updateCameraFocus(dt);
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
    this.updateEquipmentAnchors();
  };

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    if (this.controlCabinetsRig) disposeControlCabinets(this.controlCabinetsRig);
    if (this.mpgPendantRig) disposeMpgPendant(this.mpgPendantRig);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerCancel);
    this.inspectionLayer.dispose();
    this.controls.removeEventListener('start', this.cancelCameraFlight);
    this.controls.dispose();
    this.easterEggController?.dispose();
    this.easterEggController = undefined;
    this.operationalEffects?.dispose();
    this.operationalEffects = undefined;
    this.machineRigs.forEach(disposeMachineRig);
    disposeObject(this.cellRoot);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

}
