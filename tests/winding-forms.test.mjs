import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, generate, netlist } from '../lib/winding.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

const concentricCases = [
  { slots: 24, poles: 4, layers: 1, paths: 1, pitch: 7 },
  { slots: 54, poles: 8, layers: 2, paths: 2, pitch: 8 },
  { slots: 360, poles: 12, layers: 2, paths: 12, pitch: 39 },
];
function design(params) {
  const r = generate({ ...DEFAULTS, ...params });
  assert.ok(r.ok, JSON.stringify(r.issues));
  return r.design;
}
const frontDepth = (r, l) =>
  l.top - Math.min(...r.pieces.flat().map((p) => p.y));
const backDepth = (r, l) =>
  Math.max(...r.returnPieces.flat().map((p) => p.y)) - l.bottom;

test('concentric inner/outer turns stay nested with distinct levels, even at long pitches', () => {
  for (const params of concentricCases) {
    const d = design({ ...params, windingType: 'concentric' });
    const before = JSON.stringify(netlist(d));
    const l = unrolledLayout(d, d.coils);
    for (const group of new Set(d.coils.map((c) => c.group))) {
      const routes = l.coils
        .filter((r) => r.coil.group === group)
        .sort((a, b) => Math.abs(a.coil.span) - Math.abs(b.coil.span));
      for (let i = 1; i < routes.length; i++) {
        assert.ok(
          frontDepth(routes[i], l) - frontDepth(routes[i - 1], l) >= 12,
        );
        assert.ok(backDepth(routes[i], l) - backDepth(routes[i - 1], l) >= 12);
      }
    }
    assert.equal(
      JSON.stringify(netlist(d)),
      before,
      'schematic geometry cannot change connectivity',
    );
  }
});

test('distinct concentric groups never share a horizontal end-turn run', () => {
  for (const params of concentricCases) {
    const d = design({ ...params, windingType: 'concentric' });
    const l = unrolledLayout(d, d.coils);
    for (const key of ['pieces', 'returnPieces']) {
      const segments = l.coils
        .flatMap((r) =>
          r[key].flatMap((p) =>
            p.slice(1).map((b, i) => ({ id: r.coil.id, a: p[i], b })),
          ),
        )
        .filter((s) => Math.abs(s.a.y - s.b.y) < 1e-7);
      for (let i = 0; i < segments.length; i++) {
        for (const b of segments.slice(i + 1)) {
          const a = segments[i];
          if (a.id === b.id || Math.abs(a.a.y - b.a.y) > 1e-7) continue;
          const overlap =
            Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
            Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x));
          assert.ok(
            overlap <= 1e-7,
            `${a.id} and ${b.id} visually shorted together`,
          );
        }
      }
    }
  }
});

test('chain loops use equal front/rear geometry while keeping the published 24-slot connection table', () => {
  for (const params of [
    { slots: 24, poles: 4, layers: 1, paths: 1, pitch: 5 },
    { slots: 48, poles: 4, layers: 1, paths: 2, pitch: 11 },
    { slots: 72, poles: 4, layers: 1, paths: 2, pitch: 17 },
  ]) {
    const d = design({ ...params, windingType: 'chain' });
    const l = unrolledLayout(d, d.coils);
    for (const r of l.coils) {
      assert.ok(Math.abs(frontDepth(r, l) - backDepth(r, l)) < 1e-7);
      assert.ok(Math.abs(frontDepth(r, l) - frontDepth(l.coils[0], l)) < 1e-7);
      for (const p of r.pieces.flat().filter((p) => p.y <= l.top)) {
        assert.ok(
          r.returnPieces
            .flat()
            .some(
              (q) =>
                Math.abs(q.x - p.x) < 1e-7 &&
                Math.abs(q.y - (l.bottom + l.top - p.y)) < 1e-7,
            ),
        );
      }
    }
    if (params.slots === 24)
      assert.deepEqual(
        d.coils.filter((c) => c.phase === 'U').map((c) => [c.go, c.back]),
        [
          [1, 6],
          [12, 7],
          [13, 18],
          [24, 19],
        ],
      );
  }
});

test('rear-turn bounds protect loops from series rails and preserve nesting under branch filters', () => {
  for (const params of [
    ...concentricCases.map((p) => ({ ...p, windingType: 'concentric' })),
    {
      slots: 24,
      poles: 4,
      layers: 1,
      paths: 1,
      pitch: 5,
      windingType: 'chain',
    },
  ]) {
    const d = design(params);
    const all = unrolledLayout(d, d.coils);
    const l = unrolledLayout(
      d,
      d.coils.filter((c) => c.phase === 'U' && c.path === 1),
    );
    const shifts = new Map();
    for (const r of l.coils) {
      const original = all.coils.find((c) => c.coil.id === r.coil.id);
      const shift = frontDepth(r, l) - frontDepth(original, all);
      const group = r.coil.group ?? r.coil.id;
      if (shifts.has(group))
        assert.equal(
          shift,
          shifts.get(group),
          'a filter moves the whole nested group together',
        );
      shifts.set(group, shift);
      assert.equal(backDepth(r, l) - backDepth(original, all), shift);
      assert.equal(r.go.x, original.go.x);
      assert.equal(r.back.x, original.back.x);
      assert.ok(r.returnPieces.flat().every((p) => p.y <= l.returnBottom));
    }
    for (const link of l.links)
      for (const piece of link.pieces) {
        for (let i = 1; i < piece.length; i++) {
          if (Math.abs(piece[i].y - piece[i - 1].y) < 1e-7)
            assert.ok(piece[i].y >= l.returnBottom + 20);
        }
      }
  }
});
