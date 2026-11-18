import { netlist, type Coil, type Winding } from './winding.ts';
import { endTurnArrows } from './end-turn-arrows.ts';
import {
  decorateRoutes,
  type RouteDecoration,
  type RouteArrow,
} from './route-clearance.ts';

export type Point = { x: number; y: number };
export type CoilRoute = {
  coil: Coil;
  pieces: Point[][];
  /** Rear end-turn illustration; never an extra edge in the electrical netlist. */
  returnPieces: Point[][];
  go: Point;
  back: Point;
};
export type SeriesRoute = {
  from: Coil;
  to: Coil;
  node: string;
  pieces: Point[][];
  lane: number;
};
export type LeadRoute = {
  coil: Coil;
  kind: 'start' | 'end' | 'continuation';
  side: 'go' | 'back';
  node: string;
  caption: string;
  detail: string;
  points: Point[];
  labelRow: number;
};
export type UnrolledLayout = {
  width: number;
  height: number;
  left: number;
  right: number;
  step: number;
  top: number;
  bottom: number;
  /** Lowest rear end turn; series rails and the cropped view must clear it. */
  returnBottom: number;
  terminalY: number;
  slotWidth: number;
  coils: CoilRoute[];
  links: SeriesRoute[];
  leads: LeadRoute[];
  decorations: Record<string, RouteDecoration>;
  roofArrows: Record<string, RouteArrow[]>;
  returnArrows: Record<string, RouteArrow[]>;
  fanoutTop: number;
  fanoutBottom: number;
};
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
export const polylinePath = (points: Point[]) =>
  points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .join(' ');

/** Clip translated copies of one directed path at the periodic stator cut. */
export function periodicPieces(
  points: Point[],
  left: number,
  right: number,
): Point[][] {
  const period = right - left;
  const result: Point[][] = [];
  for (const shift of [-period, 0, period]) {
    let current: Point[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = { x: points[i - 1].x + shift, y: points[i - 1].y };
      const b = { x: points[i].x + shift, y: points[i].y };
      const dx = b.x - a.x;
      let lo = 0,
        hi = 1;
      if (Math.abs(dx) < 1e-9) {
        if (a.x < left || a.x > right) continue;
      } else {
        const t1 = (left - a.x) / dx,
          t2 = (right - a.x) / dx;
        lo = Math.max(0, Math.min(t1, t2));
        hi = Math.min(1, Math.max(t1, t2));
        if (lo >= hi) continue;
      }
      const start = { x: a.x + dx * lo, y: a.y + (b.y - a.y) * lo };
      const end = { x: a.x + dx * hi, y: a.y + (b.y - a.y) * hi };
      if (!current.length || !same(current.at(-1)!, start)) {
        if (current.length > 1) result.push(current);
        current = [start];
      }
      if (!same(start, end)) current.push(end);
    }
    if (current.length > 1) result.push(current);
  }
  return result;
}

export function unrolledLayout(
  design: Winding,
  visible: Coil[],
): UnrolledLayout {
  const { slots, layers, windingType } = design.params;
  const shown = new Set(visible.map((c) => c.id));
  const rawLinks: { from: Coil; to: Coil; node: string }[] = [];
  const rawLeads: Omit<LeadRoute, 'points' | 'labelRow'>[] = [];
  for (const branch of netlist(design).branches) {
    for (let i = 0; i < branch.coils.length; i++) {
      const c = branch.coils[i];
      if (!shown.has(c.id)) continue;
      const prev = branch.coils[i - 1],
        next = branch.coils[i + 1];
      if (next && shown.has(next.id))
        rawLinks.push({ from: c, to: next, node: c.to });
      if (!prev || !shown.has(prev.id)) {
        rawLeads.push({
          coil: c,
          side: 'go',
          node: c.from,
          kind: prev ? 'continuation' : 'start',
          caption: prev ? c.from : `${c.phase}1 / a${c.path}`,
          detail: prev ? `接 ${prev.id}` : c.from,
        });
      }
      if (!next || !shown.has(next.id)) {
        rawLeads.push({
          coil: c,
          side: 'back',
          node: c.to,
          kind: next ? 'continuation' : 'end',
          caption: next ? c.to : `${c.phase}2 / a${c.path}`,
          detail: next ? `接 ${next.id}` : c.to,
        });
      }
    }
  }
  const left = 72;
  // Keep conductors and terminal captions legible at intrinsic scale.
  const width = Math.max(
    1200,
    slots * Math.max(32, layers * 8 + 12) + left * 2,
    rawLeads.length * 32 + left * 2,
  );
  const right = width - left,
    period = right - left,
    step = period / slots;
  const gap = layers === 1 ? 0 : 8;
  const x = (slot: number, layer: number) =>
    left + (slot - 0.5) * step + (layer - (layers + 1) / 2) * gap;
  // One-slot tooth coils need enough end-turn height to distinguish the two
  // narrow legs and place arrows. Distributed coils keep their shallow roof.
  const toothCoils =
    visible.length > 0 && visible.every((c) => Math.abs(c.span) === 1);
  // Use complete groups for nesting ranks so a branch filter cannot collapse
  // the space of a hidden inner coil. Only visible groups need routing tiers.
  const groupSpans = new Map<string, number[]>();
  const groupLevels = new Map<string, number>();
  if (windingType === 'concentric') {
    const groups = new Map<string, Coil[]>();
    const shownGroups = new Set(visible.map((c) => c.group ?? c.id));
    for (const c of design.coils) {
      const key = c.group ?? c.id;
      if (!shownGroups.has(key)) continue;
      if (!groupSpans.has(key)) groupSpans.set(key, []);
      groupSpans.get(key)!.push(Math.abs(c.span));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    for (const [key, spans] of groupSpans)
      groupSpans.set(
        key,
        [...new Set(spans)].sort((a, b) => a - b),
      );
    // Different groups may overlap in the unrolled projection. Allocate whole
    // nested groups together so their flat end turns never share a drawn run.
    const tiers: [number, number][][] = [];
    for (const [key, group] of groups) {
      const intervals = group.map((c) => {
        const a = x(c.go, c.goLayer);
        const b =
          x(c.back, c.backLayer) + ((c.go + c.span - c.back) / slots) * period;
        return {
          rank: groupSpans.get(key)!.indexOf(Math.abs(c.span)),
          pieces: periodicPieces(
            [
              { x: a, y: 0 },
              { x: b, y: 0 },
            ],
            left,
            right,
          ).map((p): [number, number] => [
            Math.min(p[0].x, p.at(-1)!.x),
            Math.max(p[0].x, p.at(-1)!.x),
          ]),
        };
      });
      let level = 0;
      while (
        intervals.some(({ rank, pieces }) =>
          pieces.some(([lo, hi]) =>
            (tiers[level + rank] ?? []).some(
              ([a, b]) => hi + 12 >= a && b + 12 >= lo,
            ),
          ),
        )
      )
        level++;
      groupLevels.set(key, level);
      for (const { rank, pieces } of intervals) {
        tiers[level + rank] ??= [];
        tiers[level + rank].push(...pieces);
      }
    }
  }
  const formDepth = (c: Coil) =>
    windingType === 'concentric'
      ? 30 +
        14 *
          (groupLevels.get(c.group ?? c.id)! +
            groupSpans.get(c.group ?? c.id)!.indexOf(Math.abs(c.span)))
      : windingType === 'crossChain'
        ? Math.abs(c.span) === 8
          ? 64
          : 44
        : Math.min(72, Math.max(38, Math.abs(c.span) * step * 0.22));
  const formHeight = Math.max(0, ...visible.map(formDepth));
  const top = windingType === 'lap' ? (toothCoils ? 172 : 98) : 60 + formHeight,
    bottom = top + 148;
  // Chamfered concentric end turns keep a common centre and visibly separate
  // every size. Chain turns mirror front/rear to form equal-width chain links.
  const concentricTurn = (a: number, b: number, y: number, depth: number) => {
    const corner = Math.min(10, Math.abs(b - a) / 4);
    const sign = Math.sign(b - a),
      direction = Math.sign(depth);
    return [
      { x: a, y },
      { x: a, y: y + depth - direction * corner },
      { x: a + sign * corner, y: y + depth },
      { x: b - sign * corner, y: y + depth },
      { x: b, y: y + depth - direction * corner },
      { x: b, y },
    ];
  };
  const coils = visible.map((coil): CoilRoute => {
    const a = x(coil.go, coil.goLayer),
      backX = x(coil.back, coil.backLayer);
    const delta = coil.span;
    const b = backX + ((coil.go + delta - coil.back) / slots) * period;
    const rise =
      windingType !== 'lap'
        ? formDepth(coil)
        : toothCoils
          ? 108
          : Math.min(42, Math.max(22, Math.abs(b - a) * 0.14));
    const rearDepth =
      windingType === 'lap'
        ? Math.min(18, Math.max(9, Math.abs(b - a) * 0.1))
        : rise;
    const front =
      windingType === 'concentric'
        ? concentricTurn(a, b, top, -rise)
        : [
            { x: a, y: top },
            { x: (a + b) / 2, y: top - rise },
            { x: b, y: top },
          ];
    const rear =
      windingType === 'concentric'
        ? concentricTurn(b, a, bottom, rearDepth)
        : [
            { x: b, y: bottom },
            { x: (a + b) / 2, y: bottom + rearDepth },
            { x: a, y: bottom },
          ];
    const points = [{ x: a, y: bottom }, ...front, { x: b, y: bottom }];
    return {
      coil,
      pieces: periodicPieces(points, left, right),
      returnPieces: periodicPieces(rear, left, right),
      go: { x: a, y: bottom },
      back: { x: backX, y: bottom },
    };
  });
  const returnBottom = Math.max(
    bottom,
    ...coils.flatMap((c) => c.returnPieces.flat().map((p) => p.y)),
  );
  const connectionTop = Math.max(bottom + 40, returnBottom + 22);
  // Route short spans first so nested crossovers sit below their inner connections.
  // This removes avoidable crossings without changing the series order in the netlist.
  const span = (link: (typeof rawLinks)[number]) => {
    const length = Math.abs(
      x(link.from.back, link.from.backLayer) - x(link.to.go, link.to.goLayer),
    );
    return Math.min(length, period - length);
  };
  rawLinks.sort((a, b) => span(a) - span(b));
  const lanes: [number, number][][] = [];
  const links = rawLinks.map((link): SeriesRoute => {
    const a = x(link.from.back, link.from.backLayer);
    let b = x(link.to.go, link.to.goLayer);
    if (b - a > period / 2) b -= period;
    if (a - b > period / 2) b += period;
    const intervals = periodicPieces(
      [
        { x: a, y: 0 },
        { x: b, y: 0 },
      ],
      left,
      right,
    ).map((piece): [number, number] => [
      Math.min(piece[0].x, piece.at(-1)!.x),
      Math.max(piece[0].x, piece.at(-1)!.x),
    ]);
    let lane = lanes.findIndex((occupied) =>
      intervals.every(([lo, hi]) =>
        occupied.every(([a, b]) => hi + 12 < a || b + 12 < lo),
      ),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(...intervals);
    // Reserve the actual rear-turn envelope, including nested/chain loops.
    const y = connectionTop + lane * 16;
    const points = [
      { x: a, y: bottom },
      { x: a, y },
      { x: b, y },
      { x: b, y: bottom },
    ];
    return { ...link, lane, pieces: periodicPieces(points, left, right) };
  });
  const wireBottom = connectionTop + Math.max(0, lanes.length - 1) * 16;
  const fanoutTop = wireBottom + 24;
  const fanoutBottom = fanoutTop + 36;
  const terminalY = fanoutBottom + (toothCoils ? 112 : 36);
  const leadAnchors = rawLeads
    .map((lead) => ({
      ...lead,
      anchor: x(
        lead.side === 'go' ? lead.coil.go : lead.coil.back,
        lead.side === 'go' ? lead.coil.goLayer : lead.coil.backLayer,
      ),
    }))
    .sort((a, b) => a.anchor - b.anchor || a.coil.id.localeCompare(b.coil.id));
  const positions: number[] = [];
  const terminalMargin = Math.min(32, step / 2 - gap / 2);
  leadAnchors.forEach((lead, i) => {
    positions[i] = Math.max(
      lead.anchor,
      left + terminalMargin,
      i ? positions[i - 1] + 32 : 0,
    );
  });
  for (let i = positions.length - 1; i >= 0; i--)
    positions[i] = Math.min(
      positions[i],
      i === positions.length - 1
        ? right - terminalMargin
        : positions[i + 1] - 32,
    );
  // Keep the electrical terminals close to their actual slot. Label width is
  // handled below the symbols, instead of pushing nearby leads sideways.
  const labelRows: number[] = [];
  const leads = leadAnchors.map(({ anchor, ...lead }, i): LeadRoute => {
    const half = Math.max(
      38,
      lead.caption.length * 3.6 + 8,
      lead.detail.length * 3.6 + 8,
    );
    let labelRow = labelRows.findIndex((end) => positions[i] - half > end + 8);
    if (labelRow < 0) labelRow = labelRows.length;
    labelRows[labelRow] = positions[i] + half;
    return {
      ...lead,
      labelRow,
      points: [
        { x: anchor, y: bottom },
        { x: anchor, y: fanoutTop },
        { x: positions[i], y: fanoutBottom },
        { x: positions[i], y: terminalY },
      ],
    };
  });
  const decorations = decorateRoutes([
    ...links.map((link) => ({
      id: link.node,
      pieces: link.pieces,
      arrows: true,
    })),
    ...leads.map((lead) => ({
      id: `lead:${lead.coil.id}:${lead.side}`,
      pieces: [lead.points],
      arrows: false,
    })),
  ]);
  const roofSegments = coils
    .flatMap(({ coil, pieces }) =>
      pieces.flatMap((p) =>
        p.slice(1).map((b, i) => ({ id: coil.id, a: p[i], b })),
      ),
    )
    .filter(({ a, b }) => a.y <= top && b.y <= top);
  const roofArrows = endTurnArrows(
    roofSegments,
    [],
    left,
    right,
    windingType === 'concentric',
  );
  const returnArrows = endTurnArrows(
    coils.flatMap(({ coil, returnPieces }) =>
      returnPieces.flatMap((p) =>
        p.slice(1).map((b, i) => ({ id: coil.id, a: p[i], b })),
      ),
    ),
    [
      ...links.map((link) => ({ id: link.node, pieces: link.pieces })),
      ...leads.map((lead) => ({ id: lead.node, pieces: [lead.points] })),
    ].flatMap(({ id, pieces }) =>
      pieces.flatMap((p) => p.slice(1).map((b, i) => ({ id, a: p[i], b }))),
    ),
    left,
    right,
    windingType === 'concentric',
  );
  return {
    decorations,
    roofArrows,
    returnArrows,
    fanoutTop,
    fanoutBottom,
    width,
    height: terminalY + 100 + Math.max(0, labelRows.length - 1) * 38,
    left,
    right,
    step,
    top,
    bottom,
    returnBottom,
    terminalY,
    slotWidth: Math.max(18, Math.min(step - 9, layers * 8 + 10)),
    coils,
    links,
    leads,
  };
}
