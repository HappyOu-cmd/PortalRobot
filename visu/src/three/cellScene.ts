import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  CellLayout,
  CellState,
  IndexedConveyorTestCommand,
  IndexedConveyorTestStatus,
  RobotCoordinateFrame,
} from '../model/types';
import { createMachine, disposeMachineRig, type MachineRig, updateMachineRig } from './machine';
import { createIndexedConveyor, type IndexedConveyorRig, updateIndexedConveyorRig } from './indexedConveyor';
import { createPortal, type PortalRig, updatePortalRig } from './portal';
import { COLORS, disposeObject, logicalPosition, material, mm } from './primitives';

export type CameraPreset = 'iso' | 'front' | 'top';

export interface ScreenAnchor {
  x: number;
  y: number;
  visible: boolean;
}

export interface EquipmentAnchors {
  machines: ScreenAnchor[];
  magazines: ScreenAnchor[];
}

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
  private indexedConveyorRigs: IndexedConveyorRig[] = [];
  private indexedConveyorTest: IndexedConveyorTestCommand = { id: 0, type: 'none', magazineId: 1 };
  private indexedConveyorStatusKeys = ['', ''];
  private state: CellState;
  private layout: CellLayout;
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private selectedMachine: number | null = null;
  private syncMagazineInventory = true;

  constructor(
    private readonly host: HTMLElement,
    layout: CellLayout,
    state: CellState,
    private readonly getRobotCoordinates: () => RobotCoordinateFrame,
    private readonly onMachineSelect: (index: number) => void,
    private readonly onMagazineSelect?: (magazineId: 1 | 2) => void,
    private readonly onAnchorsUpdate?: (anchors: EquipmentAnchors) => void,
    private readonly onIndexedConveyorTestStatus?: (magazineId: 1 | 2, status: IndexedConveyorTestStatus) => void,
  ) {
    this.layout = layout;
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    this.controls.minDistance = 5;
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    this.addLights();
    this.scene.add(this.cellRoot);
    this.rebuild(layout);
    this.setCamera('iso');

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
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
    this.layout = layout;
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
    this.indexedConveyorRigs = layout.indexedConveyors.map((config, index) => {
      const rig = createIndexedConveyor(config, (index + 1) as 1 | 2);
      rig.lastCommandId = this.indexedConveyorTest.id;
      this.cellRoot.add(rig.root);
      return rig;
    });
    this.scene.add(this.cellRoot);
    this.setSelectedMachine(this.selectedMachine);
  }

  setState(state: CellState): void {
    this.state = state;
  }

  setMagazineInventorySync(enabled: boolean): void {
    this.syncMagazineInventory = enabled;
  }

  setIndexedConveyorTest(command: IndexedConveyorTestCommand): void {
    this.indexedConveyorTest = command;
  }

  setSelectedMachine(index: number | null): void {
    this.selectedMachine = index;
    this.machineRigs.forEach((rig, machineIndex) => {
      rig.selection.visible = machineIndex === index;
    });
  }

  setCamera(preset: CameraPreset): void {
    const center = logicalPosition(this.layout.floor.lengthX * 0.5, this.layout.floor.widthY * 0.45, 900);
    const target = preset === 'front'
      ? logicalPosition(this.layout.floor.lengthX * 0.5, this.layout.floor.widthY * 0.45, -100)
      : center;
    if (preset === 'front') this.camera.position.set(center.x, 5.8, 14.5);
    if (preset === 'top') this.camera.position.set(center.x, 15.5, center.z + 0.01);
    if (preset === 'iso') this.camera.position.set(center.x + 4.2, 7.4, center.z + 13.6);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = [
      ...this.machineRigs.map((rig) => rig.root),
      ...this.indexedConveyorRigs.map((rig) => rig.root),
    ];
    const hit = this.raycaster.intersectObjects(roots, true)[0];
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
    if (!this.onAnchorsUpdate || this.indexedConveyorRigs.length === 0) return;
    const machineWidth = mm(this.layout.machine.sizeX);
    const machines = this.machineRigs.map((rig) => this.projectAnchor(
      rig.root.localToWorld(new THREE.Vector3(machineWidth / 2, 0.03, 0.58)),
    ));
    const magazines = this.indexedConveyorRigs.map((rig, index) => {
      const config = this.layout.indexedConveyors[index];
      const conveyorRows = config.zoneRowsY.reduce((sum, rows) => sum + rows, 0);
      return this.projectAnchor(rig.root.localToWorld(new THREE.Vector3(
        0,
        mm(config.workingHeight) + 0.14,
        -mm(conveyorRows * config.pitchY) / 2,
      )));
    });
    this.onAnchorsUpdate({ machines, magazines });
  }

  private readonly animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.portalRig) updatePortalRig(
      this.portalRig,
      this.state.robot,
      this.getRobotCoordinates(),
      this.layout,
      dt,
    );
    this.machineRigs.forEach((rig, index) => {
      const state = this.state.machines[index];
      if (state) updateMachineRig(rig, state, dt, this.layout.animation.mechanismResponse);
    });
    this.indexedConveyorRigs.forEach((rig, index) => {
      const magazineId = (index + 1) as 1 | 2;
      const command = this.indexedConveyorTest.magazineId === magazineId
        ? this.indexedConveyorTest
        : { ...this.indexedConveyorTest, type: 'none' as const };
      const status = updateIndexedConveyorRig(
        rig,
        command,
        dt,
        this.syncMagazineInventory ? this.state.magazines[index] : undefined,
      );
      const statusKey = `${status.moving}:${status.positionRows}:${status.loadedSlots}:${status.homed}`;
      if (statusKey !== this.indexedConveyorStatusKeys[index]) {
        this.indexedConveyorStatusKeys[index] = statusKey;
        this.onIndexedConveyorTestStatus?.(magazineId, status);
      }
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateEquipmentAnchors();
  };

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.controls.dispose();
    this.machineRigs.forEach(disposeMachineRig);
    disposeObject(this.cellRoot);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
