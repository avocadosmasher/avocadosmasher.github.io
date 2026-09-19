import { describe, expect, it } from 'vitest';
import { graphNodeDiameter, graphNodeSize, graphNodeSpacing, separateNodes } from '../../src/lib/fragments';

function closestPair(points: { x: number; y: number }[]) {
  let closest = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    closest = Math.min(closest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  }
  return closest;
}

describe('H02: graph node size and spacing', () => {
  it('spaces centers by two largest nodes plus a gap', () => {
    expect(graphNodeSpacing).toBe(graphNodeSize.max * 2 + graphNodeSize.gap);
  });

  it('grows with degree but never beyond the maximum', () => {
    expect(graphNodeDiameter(0, 10)).toBe(graphNodeSize.min);
    expect(graphNodeDiameter(10, 10)).toBe(graphNodeSize.max);
    expect(graphNodeDiameter(50, 10)).toBe(graphNodeSize.max);
    expect(graphNodeDiameter(3, 0)).toBe(graphNodeSize.min);
    expect(graphNodeDiameter(2, 10)).toBeGreaterThan(graphNodeSize.min);
    expect(graphNodeDiameter(2, 10)).toBeLessThan(graphNodeDiameter(5, 10));
  });

  it('leaves already separated nodes untouched', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const before = structuredClone(points);
    expect(separateNodes(points, graphNodeSpacing)).toBe(true);
    expect(points).toEqual(before);
  });

  it('separates coincident nodes', () => {
    const points = Array.from({ length: 5 }, () => ({ x: 10, y: 10 }));
    expect(separateNodes(points, graphNodeSpacing)).toBe(true);
    expect(closestPair(points)).toBeGreaterThanOrEqual(graphNodeSpacing);
  });

  it('guarantees the minimum distance for 500 crowded nodes', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const points = Array.from({ length: 500 }, () => ({ x: random() * 400, y: random() * 400 }));
    expect(separateNodes(points, graphNodeSpacing)).toBe(true);
    expect(closestPair(points)).toBeGreaterThanOrEqual(graphNodeSpacing);
  });
});
