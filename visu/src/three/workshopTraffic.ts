import * as THREE from 'three';
import type { CellLayout } from '../model/types';

// Metres, Y up. The front camera looks from +Z: the workshop is at negative X.
// The path follows the front axle; the rear wheels steer, as on a real forklift.
export const FORKLIFT = { wheelbase: 1.5, frontRadius: 0.32, rearRadius: 0.255, cargoZ: 1.12,
  forkTop: 0.195, palletTop: 0.144, cargoBottom: 0.204, travelLift: 0.28, travelTilt: -0.055 } as const;

export interface WorkshopLayout {
  cellLeft: number;
  cellRight: number;
  cellBack: number;
  laneX: number;
  bayX: number;
  nearZ: number;
  farZ: number;
  minX: number;
  minZ: number;
  maxZ: number;
}

export function getWorkshopLayout(layout: CellLayout): WorkshopLayout {
  const cellLeft = Math.min(0, layout.portal.position.x / 1000 - 0.65,
    ...layout.machine.machines.map(({ position }) => position.x / 1000)) - 0.2;
  const cellRight = Math.max(layout.floor.lengthX / 1000,
    ...layout.machine.machines.map(({ position }) => (position.x + layout.machine.sizeX) / 1000));
  const cellBack = Math.min(-layout.floor.widthY / 1000,
    ...layout.machine.machines.map(({ position }) => -(position.y + layout.machine.sizeY) / 1000));
  return { cellLeft, cellRight, cellBack, laneX: cellLeft - 5.2, bayX: cellLeft - 1.05,
    nearZ: -1.5, farZ: Math.min(-9.5, cellBack - 4.8), minX: cellLeft - 8,
    minZ: Math.min(-14, cellBack - 9.3), maxZ: 3.4 };
}

export type CargoLocation = 'near' | 'far' | 'forks';
interface Pose { x: number; z: number; yaw: number; lift: number; tilt: number }
export interface TrafficFrame extends Pose {
  cargo: CargoLocation;
  cargoBay: 'near' | 'far';
  phase: string;
  speed: number;
  steering: number;
  wheelDistance: number;
}
interface Phase {
  name: string;
  duration: number;
  from: Pose;
  to: Pose;
  cargo: CargoLocation;
  cargoBay: 'near' | 'far';
  path?: THREE.Curve<THREE.Vector3>;
  reverse: boolean;
  distance: number;
  startDistance: number;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const point = (x: number, z: number) => new THREE.Vector3(x, 0, z);

class SteeringArc extends THREE.CubicBezierCurve3 {
  override getTangent(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    // Three r166 otherwise estimates tangents by finite differences, including
    // one-sided estimates at the docks. Exact endpoints prevent a cargo jump.
    const a = 3 * (1 - t) ** 2, b = 6 * (1 - t) * t, c = 3 * t * t;
    return target.set(a * (this.v1.x - this.v0.x) + b * (this.v2.x - this.v1.x) + c * (this.v3.x - this.v2.x),
      0, a * (this.v1.z - this.v0.z) + b * (this.v2.z - this.v1.z) + c * (this.v3.z - this.v2.z)).normalize();
  }
}

function route(points: THREE.Vector3[], curved = false): THREE.Curve<THREE.Vector3> {
  return curved ? new SteeringArc(points[0], points[1], points[2], points[3]) : new THREE.LineCurve3(points[0], points[1]);
}

/** Deterministic animation only: never reads or writes PLC state. */
export class WorkshopTraffic {
  readonly phases: readonly Phase[];
  readonly duration: number;
  private readonly cycleDistance: number;

  constructor(readonly layout: WorkshopLayout) {
    const phases: Phase[] = [];
    const radius = 2;
    const stageX = layout.laneX + radius;
    const dockX = layout.bayX - FORKLIFT.cargoZ;
    let pose: Pose = { x: stageX, z: layout.nearZ, yaw: Math.PI / 2, lift: 0, tilt: 0 };
    let cargo: CargoLocation = 'near';
    let cargoBay: 'near' | 'far' = 'near';
    let distance = 0;
    const add = (name: string, duration: number, to: Partial<Pose> = {}, path?: Phase['path'], reverse = false) => {
      const end = { ...pose, ...to };
      const length = path?.getLength() ?? 0;
      phases.push({ name, duration, from: { ...pose }, to: end, cargo, cargoBay, path, reverse,
        distance: length, startDistance: distance });
      distance += length * (reverse ? -1 : 1);
      pose = end;
    };
    const drive = (name: string, path: NonNullable<Phase['path']>, reverse: boolean, speed: number) => {
      const end = path.getPointAt(1);
      const tangent = path.getTangentAt(1).multiplyScalar(reverse ? -1 : 1);
      add(name, Math.max(1.4, path.getLength() / speed * 1.25),
        { x: end.x, z: end.z, yaw: Math.atan2(tangent.x, tangent.z) }, path, reverse);
    };
    const straight = (name: string, x: number, z: number, reverse: boolean, speed = 0.65) =>
      drive(name, route([point(pose.x, pose.z), point(x, z)]), reverse, speed);
    const arc = (bay: 'near' | 'far', departing: boolean) => {
      const z = bay === 'near' ? layout.nearZ : layout.farZ;
      const side = bay === 'near' ? 1 : -1;
      const k = radius * 0.55228475;
      const pts = [point(stageX, z), point(stageX - k, z),
        point(layout.laneX, z + side * (radius - k)), point(layout.laneX, z + side * radius)];
      drive(departing ? 'Выезд из места погрузки' : 'Поворот к поддону',
        route(departing ? pts : pts.reverse(), true), departing, 0.55);
    };
    const dock = (bay: 'near' | 'far', pickup: boolean) => {
      const z = bay === 'near' ? layout.nearZ : layout.farZ;
      if (!pickup) add('Выравнивание мачты', 1.2, { tilt: 0 });
      straight('Точный подъезд к поддону', dockX, z, false, 0.3);
      add('Остановка у поддона', 0.7);
      if (pickup) {
        // Close the 9 mm entry clearance before transferring ownership.
        add('Подвод вил под коробку', 0.45, { lift: FORKLIFT.cargoBottom - FORKLIFT.forkTop });
        cargo = 'forks';
        cargoBay = bay;
        add('Подъём коробки', 2.3, { lift: FORKLIFT.travelLift });
        add('Наклон мачты назад', 1.2, { tilt: FORKLIFT.travelTilt });
      } else {
        add('Укладка коробки на поддон', 2.3, { lift: FORKLIFT.cargoBottom - FORKLIFT.forkTop });
        cargo = bay;
        cargoBay = bay;
        add('Освобождение вил', 0.6, { lift: 0 });
      }
      straight('Отъезд задним ходом', stageX, z, true, 0.4);
      arc(bay, true);
      add('Остановка перед сменой направления', 1.1);
    };
    const travelTo = (bay: 'near' | 'far') => {
      const z = bay === 'near' ? layout.nearZ - radius : layout.farZ + radius;
      straight('Перевозка по проезду', layout.laneX, z, false, 1.15);
      // Approach from the other end of the aisle, with continuous heading.
      const side = bay === 'near' ? -1 : 1;
      const k = radius * 0.55228475;
      const bayZ = bay === 'near' ? layout.nearZ : layout.farZ;
      drive('Поворот к поддону', route([point(layout.laneX, z),
        point(layout.laneX, z - side * k), point(stageX - k, bayZ), point(stageX, bayZ)], true), false, 0.55);
    };
    add('Ожидание погрузки', 1.5);
    dock('near', true);
    travelTo('far');
    dock('far', false);
    add('Ожидание обратного груза', 3.5);
    arc('far', false);
    dock('far', true);
    travelTo('near');
    dock('near', false);
    add('Ожидание следующего рейса', 3.5);
    arc('near', false);
    this.phases = phases;
    this.duration = phases.reduce((total, phase) => total + phase.duration, 0);
    this.cycleDistance = distance;
  }

  sample(seconds: number): TrafficFrame {
    const cycles = Math.floor(Math.max(0, seconds) / this.duration);
    let time = Math.max(0, seconds) % this.duration;
    let phase = this.phases[this.phases.length - 1];
    for (const candidate of this.phases) {
      phase = candidate;
      if (time < phase.duration) break;
      time -= phase.duration;
    }
    const t = THREE.MathUtils.clamp(time / phase.duration, 0, 1);
    // Trapezoidal speed: acceleration/braking over 20% of each move.
    const ramp = 0.2;
    const progress = t < ramp ? t * t / (2 * ramp * (1 - ramp))
      : t > 1 - ramp ? 1 - (1 - t) ** 2 / (2 * ramp * (1 - ramp)) : (t - ramp / 2) / (1 - ramp);
    const velocity = Math.min(t / ramp, 1, (1 - t) / ramp) / (1 - ramp);
    const sign = phase.reverse ? -1 : 1;
    const position = phase.path?.getPointAt(progress);
    const tangent = phase.path?.getTangentAt(progress);
    let steering = 0;
    if (phase.path && phase.distance > 0.01) {
      const a = Math.max(0, progress - 0.005);
      const b = Math.min(1, progress + 0.005);
      const ta = phase.path.getTangentAt(a);
      const tb = phase.path.getTangentAt(b);
      const delta = Math.atan2(tb.x * ta.z - tb.z * ta.x, ta.dot(tb));
      steering = -Math.atan(FORKLIFT.wheelbase * delta / ((b - a) * phase.distance) * sign);
    }
    return { x: position?.x ?? phase.from.x, z: position?.z ?? phase.from.z,
      yaw: tangent ? Math.atan2(tangent.x * sign, tangent.z * sign) : phase.from.yaw,
      lift: THREE.MathUtils.lerp(phase.from.lift, phase.to.lift, smooth(t)),
      tilt: THREE.MathUtils.lerp(phase.from.tilt, phase.to.tilt, smooth(t)),
      cargo: phase.cargo, cargoBay: phase.cargoBay, phase: phase.name,
      speed: sign * phase.distance / phase.duration * velocity, steering,
      wheelDistance: cycles * this.cycleDistance + phase.startDistance + sign * phase.distance * progress };
  }
}
