import * as THREE from 'three';

// Native Headman CNC-1 coordinates: the centre, quill and tailstock housing
// share the brushedsteel mesh with the bed, spindle face and turret.
const TAILSTOCK_BOUNDS = new THREE.Box3(
  new THREE.Vector3(0.4025, 0.65, 0.355),
  new THREE.Vector3(0.6825, 1.08, 0.515),
).expandByScalar(0.00001);
const BED_CORNERS = [
  new THREE.Vector3(0.4325, 0.65, 0.355),
  new THREE.Vector3(0.4325, 0.65, 0.515),
  new THREE.Vector3(0.6825, 0.65, 0.515),
  new THREE.Vector3(0.6825, 0.65, 0.355),
];

/** Remove the complete tailstock and close its footprint on the bed. */
export function removeMachineTailstock(steel: THREE.Mesh): boolean {
  const source = steel.geometry;
  const positions = source.getAttribute('position');
  const normals = source.getAttribute('normal');
  if (!positions || !normals) return false;
  const index = source.getIndex();
  const count = index?.count ?? positions.count;
  const retained: number[] = [];
  const point = new THREE.Vector3();

  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset);
    const onTailstock = triangle.every(vertex =>
      TAILSTOCK_BOUNDS.containsPoint(point.fromBufferAttribute(positions, vertex)));
    if (!onTailstock) retained.push(...triangle);
  }
  if (retained.length === count) return false;

  // The source bed is triangulated around the fused housing. Reuse its
  // existing upward-facing vertices to fill the rectangular opening.
  const bed: number[] = [];
  for (const corner of BED_CORNERS) {
    const vertex = retained.find(candidate => normals.getY(candidate) > 0.999
      && point.fromBufferAttribute(positions, candidate).distanceToSquared(corner) < 1e-10);
    if (vertex === undefined) return false;
    bed.push(vertex);
  }
  retained.push(bed[0], bed[1], bed[2], bed[0], bed[2], bed[3]);

  // Compact every attribute, so removed faces leave no unused vertices.
  const indexed = source.clone();
  indexed.setIndex(retained);
  steel.geometry = indexed.toNonIndexed();
  indexed.dispose();
  source.dispose();
  steel.geometry.computeBoundingBox();
  steel.geometry.computeBoundingSphere();
  return true;
}
