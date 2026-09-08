import type { Point } from './unrolled.ts';

export type RouteArrow = Point & { angle: number };
export type Bridge = {
  x1: number;
  x2: number;
  y: number;
  crossings: { x: number; route: string }[];
};
export type RouteDecoration = { bridges: Bridge[]; arrows: RouteArrow[] };
export type RoutedWire = { id: string; pieces: Point[][]; arrows: boolean };
type Segment = { id: string; a: Point; b: Point };
const EPS = 1e-6;

/** Separate orthogonal crossings and put direction marks only in clear gaps. */
export function decorateRoutes(
  routes: RoutedWire[],
): Record<string, RouteDecoration> {
  const segments: Segment[] = routes.flatMap((r) =>
    r.pieces.flatMap((p) =>
      p.slice(1).map((b, i) => ({ id: r.id, a: p[i], b })),
    ),
  );
  const verticals = segments
    .filter(
      (s) => Math.abs(s.a.x - s.b.x) < EPS && Math.abs(s.a.y - s.b.y) > EPS,
    )
    .sort((a, b) => a.a.x - b.a.x);
  const firstAt = (x: number) => {
    let lo = 0,
      hi = verticals.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (verticals[mid].a.x < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const result: Record<string, RouteDecoration> = {};
  for (const route of routes) {
    const decoration: RouteDecoration = { bridges: [], arrows: [] };
    result[route.id] = decoration;
    if (!route.arrows) continue;
    for (const piece of route.pieces) {
      for (let i = 1; i < piece.length; i++) {
        const a = piece[i - 1],
          b = piece[i];
        if (Math.abs(a.y - b.y) > EPS || Math.abs(a.x - b.x) < EPS) continue;
        const lo = Math.min(a.x, b.x),
          hi = Math.max(a.x, b.x),
          y = a.y;
        const nearby = verticals.slice(
          firstAt(lo - 10),
          firstAt(hi + 10 + EPS),
        );
        const crossings = nearby
          .filter(
            (s) =>
              s.id !== route.id &&
              s.a.x > lo + EPS &&
              s.a.x < hi - EPS &&
              y > Math.min(s.a.y, s.b.y) + EPS &&
              y < Math.max(s.a.y, s.b.y) - EPS,
          )
          .map((s) => ({ x: s.a.x, route: s.id }));
        const bridges: Bridge[] = [];
        for (const crossing of crossings) {
          const last = bridges.at(-1);
          if (last && crossing.x - last.crossings.at(-1)!.x <= 12) {
            last.x2 = crossing.x + 4;
            last.crossings.push(crossing);
          } else {
            bridges.push({
              x1: crossing.x - 4,
              x2: crossing.x + 4,
              y,
              crossings: [crossing],
            });
          }
        }
        decoration.bridges.push(...bridges);
        // Search the whole segment, not its midpoint. Avoid every vertical wire and bridge,
        // including the legs of this connection. A short crowded link needs no extra arrow.
        const blocked: [number, number][] = nearby
          .filter(
            (s) =>
              y >= Math.min(s.a.y, s.b.y) - 6 &&
              y <= Math.max(s.a.y, s.b.y) + 6,
          )
          .map((s) => [s.a.x - 10, s.a.x + 10]);
        blocked.push(
          ...bridges.map((j): [number, number] => [j.x1 - 6, j.x2 + 6]),
        );
        blocked.sort((a, b) => a[0] - b[0]);
        let cursor = lo + 12;
        const gaps: [number, number][] = [];
        for (const [start, end] of blocked) {
          if (end <= cursor || start >= hi - 12) continue;
          if (start > cursor) gaps.push([cursor, Math.min(start, hi - 12)]);
          cursor = Math.max(cursor, end);
        }
        if (cursor < hi - 12) gaps.push([cursor, hi - 12]);
        const clear = gaps
          .filter(([a, b]) => b - a >= 2)
          .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
        if (clear)
          decoration.arrows.push({
            x: (clear[0] + clear[1]) / 2 + (b.x > a.x ? 2 : -2),
            y,
            angle: b.x > a.x ? 0 : 180,
          });
      }
    }
  }
  return result;
}

/** The rectangle erases only the underpass; short tails reconnect the original rail. */
export function bridgePath(b: Bridge): string {
  return `M${b.x1 - 1},${b.y} H${b.x1} Q${(b.x1 + b.x2) / 2},${b.y - 8} ${b.x2},${b.y} H${b.x2 + 1}`;
}
