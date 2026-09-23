import * as THREE from 'three';
import type { CellLayout } from '../model/types';
import { WorkshopAssets } from './workshopAssets';
import { createForklift, updateForklift, type ForkliftRig } from './forklift';
import { FORKLIFT, getWorkshopLayout, WorkshopTraffic, type TrafficFrame, type WorkshopLayout } from './workshopTraffic';
import { ForkliftDriver } from './forkliftDriver';

function createSurfaces(a: WorkshopAssets) {
  const concrete = a.grain('concrete'); concrete.repeat.set(30, 22);
  const wood = a.grain('wood');
  const cardboard = a.grain('cardboard');
  return {
    floor: a.surface(0xc0c2bb, { map: concrete, roughness: 0.92, metalness: 0, bumpMap: concrete, bumpScale: 0.006 }),
    wood: a.surface(0xb18a53, { map: wood, roughness: 0.92, metalness: 0 }),
    woodDark: a.surface(0x82643e, { map: wood, roughness: 0.95, metalness: 0 }),
    carton: a.surface(0xb59465, { map: cardboard, roughness: 0.96, metalness: 0 }),
    yellow: a.surface(0xdab436, { roughness: 0.88, metalness: 0 }),
    white: a.surface(0xdeddd0, { roughness: 0.9 }),
    dark: a.surface(0x3e4647, { roughness: 0.7, metalness: 0.4 }),
    rack: a.surface(0x3e6673, { roughness: 0.55, metalness: 0.5 }),
    orange: a.surface(0xc97c3a, { roughness: 0.62, metalness: 0.3 }),
    steel: a.surface(0x88928f, { roughness: 0.6, metalness: 0.5 }),
    wall: a.surface(0xd5d8d2, { roughness: 0.86 }),
    green: a.surface(0x658c7c, { roughness: 0.95 }),
    stripe: a.surface(0x3b3c35, { roughness: 0.9 }),
    seam: a.surface(0x9a9f98, { roughness: 1 }),
    strap: a.surface(0x353b33, { roughness: 0.55 }),
    shipping: a.label('COMPONENTS\nPR-042 / 280 kg', '#e7e1cc', '#333a36', true),
  };
}
type Surfaces = ReturnType<typeof createSurfaces>;

function pallet(a: WorkshopAssets, s: Surfaces, parent: THREE.Object3D, x: number, y: number, z: number): void {
  const root = new THREE.Group(); root.position.set(x, y, z); parent.add(root);
  for (const px of [-0.47, 0, 0.47]) {
    a.box(root, s.woodDark, [0.14, 0.022, 1.1], [px, 0.011, 0]);
    for (const pz of [-0.44, 0, 0.44]) a.box(root, s.woodDark, [0.14, 0.10, 0.14], [px, 0.072, pz]);
  }
  for (let i = 0; i < 7; i++) a.box(root, s.wood, [1.2, 0.022, 0.12], [0, 0.133, -0.48 + i * 0.16]);
}

/** A reinforced shipping box on skids: forks can enter above the stationary pallet. */
function crate(a: WorkshopAssets, s: Surfaces): THREE.Group {
  const root = new THREE.Group(); root.name = 'ShippingBox';
  a.box(root, s.carton, [1.08, 0.88, 0.94], [0, 0.44, 0], true);
  for (const x of [-0.49, 0.49]) {
    a.box(root, s.wood, [0.085, 0.06, 0.94], [x, -0.03, 0]);
    for (const z of [-0.47, 0.47]) a.box(root, s.wood, [0.07, 0.89, 0.025], [x, 0.445, z]);
  }
  for (const z of [-0.483, 0.483]) for (const y of [0.055, 0.825]) a.box(root, s.wood, [1.08, 0.055, 0.022], [0, y, z]);
  for (const x of [-0.28, 0.28]) {
    a.box(root, s.strap, [0.021, 0.004, 0.947], [x, 0.884, 0]);
    for (const z of [-0.473, 0.473]) a.box(root, s.strap, [0.021, 0.88, 0.004], [x, 0.44, z]);
  }
  a.box(root, s.woodDark, [0.003, 0.003, 0.84], [0, 0.886, 0]);
  a.decal(root, s.shipping, 0.42, 0.22, [0, 0.49, 0.481]);
  a.decal(root, s.shipping, 0.42, 0.22, [-0.546, 0.49, 0]).rotation.y = -Math.PI / 2;
  a.batch(root);
  return root;
}

function buildEnvironment(a: WorkshopAssets, s: Surfaces, layout: WorkshopLayout, parent: THREE.Group): void {
  const root = new THREE.Group(); root.name = 'WorkshopBuilding'; parent.add(root);
  const { minX, minZ, maxZ, cellRight, cellLeft, laneX, bayX, nearZ, farZ } = layout;
  const right = cellRight + 1.7;
  const width = right - minX, depth = maxZ - minZ;
  a.decal(root, s.floor, width, depth, [(right + minX) / 2, -0.014, (maxZ + minZ) / 2], true);
  // Saw-cut concrete joints, including the area underneath the cell.
  for (let x = minX + 2.8; x < right; x += 2.8) a.box(root, s.seam, [0.009, 0.001, depth], [x, -0.012, (maxZ + minZ) / 2]);
  for (let z = minZ + 2.8; z < maxZ; z += 2.8) a.box(root, s.seam, [width, 0.001, 0.009], [(right + minX) / 2, -0.012, z]);
  const paint = (x: number, z: number, w: number, d: number, material = s.yellow) => {
    const mesh = a.box(root, material, [w, 0.002, d], [x, -0.007, z]); mesh.castShadow = false;
  };
  for (const side of [-1, 1]) {
    paint(laneX + side * 1.9, (maxZ + minZ) / 2, 0.075, depth - 0.6);
    paint(laneX + side * 1.99, (maxZ + minZ) / 2, 0.028, depth - 0.6);
  }
  // Wheel-polished strips are subtle enough to remain concrete, not black asphalt.
  const wear = a.surface(0x92978f, { transparent: true, opacity: 0.14, depthWrite: false, roughness: 0.94 });
  for (const side of [-1, 1]) a.decal(root, wear, 0.19, depth - 0.8,
    [laneX + side * 0.52, -0.009, (maxZ + minZ) / 2], true);
  for (const z of [nearZ, farZ]) {
    for (const side of [-1, 1]) {
      paint(bayX + side * 0.78, z, 0.055, 1.5);
      paint(bayX, z + side * 0.75, 1.61, 0.055);
    }
    const label = a.label(z === nearZ ? '01 / PICK UP' : '02 / STORAGE', '#b4b7ae', '#41483e');
    a.decal(root, label, 1.6, 0.45, [bayX, -0.005, z + 1.06], true);
    pallet(a, s, root, bayX, 0, z);
    for (const side of [-1, 1]) {
      const x = bayX + 0.84, pz = z + side * 1.0;
      a.box(root, s.dark, [0.28, 0.045, 0.28], [x, 0.0225, pz]);
      a.tube(root, s.yellow, 0.074, [x, 0.045, pz], [x, 0.8, pz]);
      for (const y of [0.25, 0.55]) a.tube(root, s.stripe, 0.076, [x, y, pz], [x, y + 0.10, pz]);
    }
  }
  const speed = a.label('5\nSLOW', '#c6c5b5', '#494d40');
  a.decal(root, speed, 1.35, 1.25, [laneX, -0.004, (nearZ + farZ) / 2], true);
  for (const z of [nearZ + 2.4, farZ - 2.4]) for (const direction of [-1, 1]) {
    const x = laneX + direction * 0.55;
    paint(x, z, 0.12, 0.6, s.white);
    for (const sign of [-1, 1]) {
      const mesh = a.box(root, s.white, [0.11, 0.002, 0.38], [x + sign * 0.11, -0.005, z + direction * 0.22]);
      mesh.rotation.y = direction * sign * Math.PI / 4; mesh.castShadow = false;
    }
  }
  // Pedestrian apron stays outside the robot's operator access area.
  paint((cellLeft + cellRight) / 2, 1.32, cellRight - cellLeft, 0.85, s.green);
  for (const z of [0.855, 1.785]) paint((cellLeft + cellRight) / 2, z, cellRight - cellLeft, 0.04, s.white);
  for (const x of [cellLeft + 0.5, cellRight - 0.5]) {
    const sign = a.label('PEDESTRIANS', '#658c7c', '#e2e4d9');
    a.decal(root, sign, 1.7, 0.5, [x + (x < 0 ? 0.5 : -0.5), -0.004, 1.32], true);
  }
  for (const x of [cellLeft + 1, cellRight - 0.6]) {
    a.tube(root, s.yellow, 0.04, [x, 0.05, 0.52], [x, 0.86, 0.52]);
    a.tube(root, s.yellow, 0.04, [x + 1.05, 0.05, 0.52], [x + 1.05, 0.86, 0.52]);
    a.tube(root, s.yellow, 0.04, [x, 0.86, 0.52], [x + 1.05, 0.86, 0.52]);
  }

  // Open-front factory shell; the roof is deliberately open for the HMI camera.
  a.box(root, s.wall, [width, 4.7, 0.15], [(right + minX) / 2, 2.35, minZ - 0.03]);
  a.box(root, s.rack, [width, 0.7, 0.045], [(right + minX) / 2, 0.42, minZ + 0.06]);
  for (let x = minX + 0.5; x < right; x += 4.1) {
    a.box(root, s.steel, [0.16, 4.8, 0.24], [x, 2.4, minZ + 0.1]);
    a.box(root, s.yellow, [0.24, 0.6, 0.3], [x, 0.3, minZ + 0.1]);
    a.box(root, s.dark, [0.10, 0.10, 3.8], [x, 4.6, minZ + 1.85]);
    const glow = a.surface(0xf4f5e9, { emissive: 0xf4eed8, emissiveIntensity: 1.7 });
    a.box(root, s.dark, [1.6, 0.085, 0.22], [x, 4.46, minZ + 1.75]);
    a.box(root, glow, [1.48, 0.015, 0.18], [x, 4.412, minZ + 1.75]);
  }
  a.box(root, s.steel, [width, 0.14, 0.17], [(right + minX) / 2, 4.1, minZ + 0.15]);
  const shutterX = cellLeft - 2.6;
  a.box(root, s.dark, [3.3, 3.8, 0.11], [shutterX, 1.9, minZ + 0.1]);
  for (let y = 0.14; y < 3.7; y += 0.15) a.box(root, s.steel, [3.1, 0.132, 0.045], [shutterX, y, minZ + 0.17]);
  a.decal(root, a.label('DISPATCH / 02', '#3e6673', '#eeeade'), 2.2, 0.48, [shutterX, 4.12, minZ + 0.25]);
  for (let i = 0; i < 3; i++) {
    const x = cellLeft + 3.1 + i * 3.5;
    a.box(root, s.dark, [2.5, 0.85, 0.055], [x, 3.25, minZ + 0.10]);
    a.box(root, a.surface(0xa5bbc0, { roughness: 0.3, metalness: 0.25 }), [2.35, 0.7, 0.018], [x, 3.25, minZ + 0.14]);
    a.box(root, s.steel, [0.045, 0.8, 0.06], [x, 3.25, minZ + 0.18]);
  }
  // Narrow racks run along the outside of the marked forklift aisle.
  const rackX = cellLeft - 7.43;
  for (const z of [-3.5, -6.2, -8.9]) {
    for (const dx of [-0.4, 0.4]) for (const dz of [-1.15, 1.15]) {
      a.box(root, s.rack, [0.055, 3.25, 0.065], [rackX + dx, 1.625, z + dz]);
      a.box(root, s.yellow, [0.13, 0.36, 0.15], [rackX + dx, 0.18, z + dz]);
    }
    for (const y of [0.2, 1.25, 2.3]) {
      for (const dx of [-0.42, 0.42]) a.box(root, s.orange, [0.06, 0.10, 2.38], [rackX + dx, y, z]);
      a.box(root, s.woodDark, [0.84, 0.038, 2.26], [rackX, y + 0.068, z]);
      for (const dz of [-0.68, 0.13, 0.74]) {
        if (y === 1.25 && dz === 0.13) continue;
        a.box(root, s.carton, [0.64, 0.54, 0.52], [rackX, y + 0.36, z + dz], true);
        a.decal(root, s.shipping, 0.24, 0.15, [rackX + 0.326, y + 0.38, z + dz]).rotation.y = Math.PI / 2;
      }
    }
    for (const dz of [-1.14, 1.14]) a.tube(root, s.steel, 0.013,
      [rackX - 0.4, 0.24, z + dz], [rackX + 0.4, 3.14, z + dz]);
  }
  // Buffer stock beyond the machines adds depth without filling service aisles.
  for (const x of [cellLeft + 2, cellLeft + 4, cellLeft + 7.5, cellLeft + 9.1]) {
    const z = layout.cellBack - 2.8;
    pallet(a, s, root, x, 0, z);
    const stock = crate(a, s); stock.position.set(x, FORKLIFT.cargoBottom, z); root.add(stock);
  }
  for (let i = 0; i < 4; i++) pallet(a, s, root, bayX + 2.15, i * 0.146, farZ + 0.2);
  // A fire point and service cabinet make the distant wall read as a working shop.
  a.box(root, s.wall, [0.85, 1.75, 0.4], [cellRight - 1.2, 0.875, layout.cellBack - 1.8], true);
  a.box(root, s.dark, [0.045, 0.14, 0.025], [cellRight - 1.0, 0.9, layout.cellBack - 1.59]);
  const fire = a.surface(0xad3e32, { roughness: 0.45, metalness: 0.25 });
  a.tube(root, fire, 0.105, [cellRight - 2.1, 0.1, layout.cellBack - 1.8], [cellRight - 2.1, 0.66, layout.cellBack - 1.8]);
  a.tube(root, s.dark, 0.018, [cellRight - 2.1, 0.66, layout.cellBack - 1.8], [cellRight - 2.1, 0.78, layout.cellBack - 1.8]);
  a.batch(root);
}

export class Workshop {
  readonly root = new THREE.Group();
  readonly traffic: WorkshopTraffic;
  readonly forklift: ForkliftRig;
  readonly cargo: THREE.Group;
  private readonly assets = new WorkshopAssets();
  private driver?: ForkliftDriver;
  private disposed = false;
  private elapsed = 0;
  private readonly cargoPosition = new THREE.Vector3();
  private readonly cargoRotation = new THREE.Quaternion();

  constructor(layout: CellLayout, loadDriver = true) {
    this.root.name = 'Workshop';
    const workshopLayout = getWorkshopLayout(layout);
    this.traffic = new WorkshopTraffic(workshopLayout);
    const surfaces = createSurfaces(this.assets);
    buildEnvironment(this.assets, surfaces, workshopLayout, this.root);
    this.forklift = createForklift(this.assets); this.root.add(this.forklift.root);
    this.cargo = crate(this.assets, surfaces); this.cargo.name = 'TransportedShippingBox'; this.root.add(this.cargo);
    this.apply(this.traffic.sample(0), 0);
    // Scenery never intercepts equipment picks, including clicks through the aisle.
    this.root.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; });
    if (loadDriver) this.loadDriver();
  }

  private loadDriver(): void {
    void ForkliftDriver.create()
      .then((driver) => {
        if (this.disposed) { driver.dispose(); return; }
        this.driver = driver;
        this.forklift.root.add(driver.root);
        driver.update(0, this.forklift.root, this.forklift.steeringWheel, false);
      }).catch((error: unknown) => console.warn('Не удалось загрузить водителя погрузчика:', error));
  }

  update(dt: number, paused: boolean): void {
    if (this.disposed || paused) return;
    this.elapsed += Math.max(0, Math.min(dt, 0.05));
    const frame = this.traffic.sample(this.elapsed);
    this.apply(frame, dt);
    this.driver?.update(dt, this.forklift.root, this.forklift.steeringWheel, frame.speed < -0.01);
  }

  private apply(frame: TrafficFrame, dt: number): void {
    updateForklift(this.forklift, frame, this.elapsed, dt);
    if (frame.cargo === 'forks') {
      this.forklift.cargoAnchor.updateWorldMatrix(true, false);
      this.forklift.cargoAnchor.getWorldPosition(this.cargoPosition);
      this.forklift.cargoAnchor.getWorldQuaternion(this.cargoRotation);
      this.cargo.position.copy(this.root.worldToLocal(this.cargoPosition));
      this.root.getWorldQuaternion(this.cargo.quaternion).invert().multiply(this.cargoRotation);
    } else {
      this.cargo.position.set(this.traffic.layout.bayX, FORKLIFT.cargoBottom,
        frame.cargo === 'near' ? this.traffic.layout.nearZ : this.traffic.layout.farZ);
      // Both docking positions face +X, so the box keeps its physical orientation.
      this.cargo.rotation.set(0, Math.PI / 2, 0);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driver?.dispose();
    this.root.removeFromParent();
    this.assets.dispose();
    this.root.clear();
  }
}
