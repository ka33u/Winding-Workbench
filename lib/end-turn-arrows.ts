import type { Point } from './unrolled.ts';
import type { RouteArrow } from './route-clearance.ts';

export type EndTurnSegment = { id: string; a: Point; b: Point };

function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Search the full end turn. Crowded marks retain a white underlay instead of disappearing. */
export function endTurnArrows(
  segments: EndTurnSegment[],
  obstacles: EndTurnSegment[],
  left: number,
  right: number,
): Record<string, RouteArrow[]> {
  const result: Record<string, RouteArrow[]> = Object.fromEntries(
    segments.map((s) => [s.id, []]),
  );
  // Index nearby conductors once; dense, long-pitch plans should not scan
  // every wire or existing marker for each candidate position.
  const wireCells = new Map<string, EndTurnSegment[]>();
  for (const wire of [...segments, ...obstacles]) {
    for (
      let x = Math.floor((Math.min(wire.a.x, wire.b.x) - 6) / 32);
      x <= Math.floor((Math.max(wire.a.x, wire.b.x) + 6) / 32);
      x++
    ) {
      for (
        let y = Math.floor((Math.min(wire.a.y, wire.b.y) - 6) / 32);
        y <= Math.floor((Math.max(wire.a.y, wire.b.y) + 6) / 32);
        y++
      ) {
        const key = `${x},${y}`;
        if (!wireCells.has(key)) wireCells.set(key, []);
        wireCells.get(key)!.push(wire);
      }
    }
  }
  const occupied = new Map<string, Point[]>();
  const cell = (v: number) => Math.floor(v / 16);
  const markerGap = (p: Point) => {
    let gap = Infinity;
    for (let x = cell(p.x) - 1; x <= cell(p.x) + 1; x++) {
      for (let y = cell(p.y) - 1; y <= cell(p.y) + 1; y++) {
        for (const q of occupied.get(`${x},${y}`) ?? []) {
          gap = Math.min(gap, Math.hypot(p.x - q.x, p.y - q.y));
        }
      }
    }
    return gap;
  };
  for (const segment of segments) {
    const { a, b } = segment;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 10) continue;
    const ux = (b.x - a.x) / length,
      uy = (b.y - a.y) / length;
    const steps = Math.min(160, Math.max(8, Math.ceil(length / 2)));
    const candidates = [
      ...new Set([
        0.35,
        0.65,
        0.5,
        0.2,
        0.8,
        ...Array.from({ length: steps + 1 }, (_, i) => i / steps),
      ]),
    ]
      .map((t) => {
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        let clearance: number | undefined;
        let arrowGap: number | undefined;
        return {
          ...p,
          endGap: Math.min(t, 1 - t) * length,
          get clearance() {
            return (clearance ??= (
              wireCells.get(
                `${Math.floor(p.x / 32)},${Math.floor(p.y / 32)}`,
              ) ?? []
            ).reduce(
              (gap, s) =>
                s === segment ? gap : Math.min(gap, distance(p, s.a, s.b)),
              Infinity,
            ));
          },
          get arrowGap() {
            return (arrowGap ??= markerGap(p));
          },
        };
      })
      .filter((p) => p.x >= left + 5 && p.x <= right - 5 && p.endGap >= 4);
    let scale = 1;
    let point = candidates.find(
      (p) => p.endGap >= 6 && p.clearance >= 5.6 && p.arrowGap >= 12,
    );
    if (!point) {
      scale = 0.75;
      point = candidates.find((p) => p.clearance >= 4.6 && p.arrowGap >= 10);
    }
    const isolated = !point;
    if (!point) {
      // Stagger neighboring arrows along their own wires. The underlay clears
      // only the marker, preserving the end-turn geometry and current direction.
      point = candidates
        .filter((p) => p.arrowGap >= 10)
        .sort((a, b) => b.clearance - a.clearance || b.endGap - a.endGap)[0];
    }
    if (!point) continue;
    const key = `${cell(point.x)},${cell(point.y)}`;
    if (!occupied.has(key)) occupied.set(key, []);
    occupied.get(key)!.push(point);
    result[segment.id].push({
      x: point.x + 2 * scale * ux,
      y: point.y + 2 * scale * uy,
      angle: (Math.atan2(uy, ux) * 180) / Math.PI,
      scale,
      isolated,
    });
  }
  return result;
}
