import type { CellLayout } from '../model/types';

// Confirmed dimensions from «Доп. Скриношоты 2», in millimetres.
// Bay lengths and the transverse gap are measured between inner post faces.
export const PORTAL_MEASUREMENTS = {
  bayClearSpansX: [2715, 1995, 2767, 1995, 2715],
  supportSize: 120, // User-selected structural section for the portal posts.
  clearWidthY: 1092,
  supportHeightZ: 2233, // Floor to the top of the post, below its 20 mm cap.
  zProfileLength: 2036.5,
  gripperBodyLength: 145.6,
  gripperBodyRadius: 85.33,
};

// Existing mounting allowances, distinct from the measured frame dimensions.
export const PORTAL_MOUNTING = {
  endOverhangX: 350,
  railEndMarginX: 420,
  railClearanceY: 240,
  supportCapHeight: 20,
  endArmHeight: 42.25,
};

export function getPortalRailClearanceMm(frameDepthY: number, zColumnWidth: number): number {
  return Math.max(PORTAL_MOUNTING.railClearanceY, frameDepthY / 2 + zColumnWidth / 2 + 120);
}

export function getPortalSupportHeightMm(portal: CellLayout['portal']): number {
  return portal.frameBottomZ - PORTAL_MOUNTING.supportCapHeight;
}

/** Shared by the structural posts and their attached enclosure, in local mm. */
export function getPortalPostXsMm(portal: CellLayout['portal']): number[] {
  const frameStart = -Math.max(PORTAL_MOUNTING.railEndMarginX, portal.supportSize * 2);
  const frameLength = portal.lengthX - frameStart * 2;
  const endOverhang = Math.max(PORTAL_MOUNTING.endOverhangX, portal.supportSize * 1.8);
  const gaps = portal.bayClearSpansX?.length ? portal.bayClearSpansX : PORTAL_MEASUREMENTS.bayClearSpansX;
  const scale = (frameLength + endOverhang * 2 - gaps.length * portal.supportSize)
    / gaps.reduce((sum, gap) => sum + gap, 0);
  const positions = [frameStart - endOverhang];
  for (const gap of gaps) positions.push(positions[positions.length - 1] + gap * scale + portal.supportSize);
  return positions;
}

const postCentreSpanX = PORTAL_MEASUREMENTS.bayClearSpansX.reduce((sum, gap) => sum + gap, 0)
  + PORTAL_MEASUREMENTS.bayClearSpansX.length * PORTAL_MEASUREMENTS.supportSize;

// lengthX/widthY describe the visual travel, not the outside frame dimensions.
export const MEASURED_PORTAL_LAYOUT = {
  lengthX: postCentreSpanX - 2 * (PORTAL_MOUNTING.endOverhangX + PORTAL_MOUNTING.railEndMarginX),
  widthY: PORTAL_MEASUREMENTS.clearWidthY + PORTAL_MEASUREMENTS.supportSize - 2 * PORTAL_MOUNTING.railClearanceY,
  frameBottomZ: PORTAL_MEASUREMENTS.supportHeightZ + PORTAL_MOUNTING.supportCapHeight,
  supportSize: PORTAL_MEASUREMENTS.supportSize,
  bayClearSpansX: [...PORTAL_MEASUREMENTS.bayClearSpansX],
};
