import { netlist, mod, type Coil, type Winding } from './winding.ts';

export type Point = { x: number; y: number };
export type CoilRoute = {
  coil: Coil;
  pieces: Point[][];
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
};
export type UnrolledLayout = {
  width: number;
  height: number;
  left: number;
  right: number;
  step: number;
  top: number;
  bottom: number;
  terminalY: number;
  slotWidth: number;
  coils: CoilRoute[];
  links: SeriesRoute[];
  leads: LeadRoute[];
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
  const { slots, layers, pitch } = design.params;
  const shown = new Set(visible.map((c) => c.id));
  const rawLinks: { from: Coil; to: Coil; node: string }[] = [];
  const rawLeads: Omit<LeadRoute, 'points'>[] = [];
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
  // Keep conductors and terminal captions legible at intrinsic scale, including 8 layers.
  const width = Math.max(
    1200,
    slots * Math.max(32, layers * 8 + 12) + left * 2,
    rawLeads.length * 74 + left * 2,
  );
  const right = width - left,
    period = right - left,
    step = period / slots;
  const gap = layers === 1 ? 0 : 8;
  const x = (slot: number, layer: number) =>
    left + (slot - 0.5) * step + (layer - (layers + 1) / 2) * gap;
  const top = 156 + Math.max(0, layers / 2 - 1) * 6,
    bottom = top + 176;
  const coils = visible.map((coil): CoilRoute => {
    const a = x(coil.go, coil.goLayer),
      backX = x(coil.back, coil.backLayer);
    const delta = mod(coil.back - coil.go, slots) === pitch ? pitch : -pitch;
    const b = backX + ((coil.go + delta - coil.back) / slots) * period;
    const rise =
      Math.min(110, Math.max(28, Math.abs(b - a) * 0.32)) +
      Math.floor((coil.goLayer - 1) / 2) * 6;
    const points = [
      { x: a, y: bottom },
      { x: a, y: top },
      { x: (a + b) / 2, y: top - rise },
      { x: b, y: top },
      { x: b, y: bottom },
    ];
    return {
      coil,
      pieces: periodicPieces(points, left, right),
      go: { x: a, y: bottom },
      back: { x: backX, y: bottom },
    };
  });
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
        occupied.every(([a, b]) => hi + 5 < a || b + 5 < lo),
      ),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(...intervals);
    const y = bottom + 28 + lane * (layers > 2 ? 7 : 9);
    const shoulder = Math.sign(b - a) * Math.min(14, Math.abs(b - a) / 3);
    const points = [
      { x: a, y: bottom },
      { x: a, y: bottom + 10 },
      { x: a + shoulder, y },
      { x: b - shoulder, y },
      { x: b, y: bottom + 10 },
      { x: b, y: bottom },
    ];
    return { ...link, lane, pieces: periodicPieces(points, left, right) };
  });
  const wireBottom =
    bottom + 28 + Math.max(0, lanes.length - 1) * (layers > 2 ? 7 : 9);
  const terminalY = Math.max(bottom + 215, wireBottom + 130);
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
  leadAnchors.forEach((lead, i) => {
    positions[i] = Math.max(
      lead.anchor,
      left + 32,
      i ? positions[i - 1] + 74 : 0,
    );
  });
  for (let i = positions.length - 1; i >= 0; i--)
    positions[i] = Math.min(
      positions[i],
      i === positions.length - 1 ? right - 32 : positions[i + 1] - 74,
    );
  const leads = leadAnchors.map(({ anchor, ...lead }, i): LeadRoute => {
    const bend = wireBottom + 28 + (i % 6) * 8;
    return {
      ...lead,
      points: [
        { x: anchor, y: bottom },
        { x: anchor, y: bend },
        { x: positions[i], y: bend },
        { x: positions[i], y: terminalY },
      ],
    };
  });
  return {
    width,
    height: terminalY + 100,
    left,
    right,
    step,
    top,
    bottom,
    terminalY,
    slotWidth: Math.max(18, Math.min(step - 9, layers * 8 + 10)),
    coils,
    links,
    leads,
  };
}
