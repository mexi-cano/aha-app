import type { PointGroup } from "signature_pad";

export function scaleSignatureData(
  groups: readonly PointGroup[],
  scaleX: number,
  scaleY: number,
): PointGroup[] {
  const penScale = Math.min(scaleX, scaleY);
  return groups.map((group) => ({
    ...group,
    dotSize: group.dotSize > 0 ? group.dotSize * penScale : group.dotSize,
    minWidth: group.minWidth * penScale,
    maxWidth: group.maxWidth * penScale,
    points: group.points.map((point) => ({
      ...point,
      x: point.x * scaleX,
      y: point.y * scaleY,
    })),
  }));
}
