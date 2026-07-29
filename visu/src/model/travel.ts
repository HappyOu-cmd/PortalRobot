import type { CellLayout } from './types';

export function getRobotTravelLimits(layout: CellLayout) {
  return {
    x: Math.max(100, layout.portal.lengthX),
    y: Math.max(100, layout.portal.widthY),
    z: Math.max(100, layout.portal.frameBottomZ - layout.robot.zBaseLength),
  };
}
