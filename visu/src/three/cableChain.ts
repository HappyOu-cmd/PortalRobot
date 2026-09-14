import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Constant-length rolling U: local X is travel, local Y separates the runs.
 * The fixed end is (0, 0); the moving end is (travel, 2 * radius).
 * Both straight lengths stay nonnegative when |travel| <= straightLength.
 */
export function sampleChainPath(
  distance: number, travel: number, straightLength: number, radius: number,
  target: THREE.Vector3, tangent: THREE.Vector3,
): void {
  const bend = (straightLength + travel) / 2;
  const arc = Math.PI * radius;
  if (distance <= bend) {
    target.set(distance, 0, 0);
    tangent.set(1, 0, 0);
  } else if (distance < bend + arc) {
    const angle = (distance - bend) / radius;
    target.set(bend + radius * Math.sin(angle), radius * (1 - Math.cos(angle)), 0);
    tangent.set(Math.cos(angle), Math.sin(angle), 0);
  } else {
    target.set(bend - (distance - bend - arc), 2 * radius, 0);
    tangent.set(-1, 0, 0);
  }
}

export interface CableChain {
  root: THREE.Group;
  links: THREE.InstancedMesh;
  fixedEnd: THREE.Object3D;
  movingEnd: THREE.Object3D;
  radius: number;
  straightLength: number;
  length: number;
  update: (travel: number) => void;
}

export function createCableChain(
  name: string, maxTravel: number, radius: number, width: number, pitch: number,
): CableChain {
  const root = new THREE.Group();
  root.name = name;
  const straightLength = maxTravel + radius * 2;
  const length = straightLength + Math.PI * radius;
  const count = Math.ceil(length / pitch);
  const step = length / count;
  const thickness = width * 0.24;
  // One open rectangular link, instanced for the entire chain. No meshes or
  // geometry are created per frame; the crossbars remain visible on the bend.
  const pieces = [
    new THREE.BoxGeometry(step * 0.91, thickness, width * 0.12).translate(0, 0, -width * 0.44),
    new THREE.BoxGeometry(step * 0.91, thickness, width * 0.12).translate(0, 0, width * 0.44),
    new THREE.BoxGeometry(step * 0.27, thickness * 0.55, width),
  ];
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  const links = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x202428, roughness: 0.72, metalness: 0.08,
  }), count);
  links.name = `${name}_links`;
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  links.castShadow = true;
  links.receiveShadow = true;
  // A single conservative bound covers every pose (including both endpoints).
  links.boundingBox = new THREE.Box3(
    new THREE.Vector3(-maxTravel - pitch, -thickness, -width),
    new THREE.Vector3(straightLength + radius + pitch, 2 * radius + thickness, width),
  );
  links.boundingSphere = links.boundingBox.getBoundingSphere(new THREE.Sphere());
  root.add(links);
  const fixedEnd = new THREE.Object3D();
  fixedEnd.name = `${name}_fixed_end`;
  const movingEnd = new THREE.Object3D();
  movingEnd.name = `${name}_moving_end`;
  root.add(fixedEnd, movingEnd);
  const transform = new THREE.Object3D();
  const tangent = new THREE.Vector3();
  let previousTravel = NaN;
  const update = (travel: number) => {
    if (travel === previousTravel) return;
    previousTravel = travel;
    movingEnd.position.set(travel, 2 * radius, 0);
    for (let i = 0; i < count; i++) {
      sampleChainPath((i + 0.5) * step, travel, straightLength, radius, transform.position, tangent);
      transform.rotation.z = Math.atan2(tangent.y, tangent.x);
      transform.updateMatrix();
      links.setMatrixAt(i, transform.matrix);
    }
    links.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { root, links, fixedEnd, movingEnd, radius, straightLength, length, update };
}
