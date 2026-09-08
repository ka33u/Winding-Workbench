import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, DEFAULTS, PRESETS } from '../lib/winding.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

const eps = 1e-6;
function scene(layout) {
  return [
    ...layout.links.map((l) => ({ id: l.node, pieces: l.pieces })),
    ...layout.leads.map((l) => ({
      id: `lead:${l.coil.id}:${l.side}`,
      pieces: [l.points],
    })),
  ].flatMap((r) =>
    r.pieces.flatMap((p) =>
      p.slice(1).map((b, i) => ({ id: r.id, a: p[i], b })),
    ),
  );
}
function intersectsBox(a, b, cx, cy, rx, ry) {
  let enter = 0,
    exit = 1;
  for (const [key, lo, hi] of [
    ['x', cx - rx, cx + rx],
    ['y', cy - ry, cy + ry],
  ]) {
    const delta = b[key] - a[key];
    if (Math.abs(delta) < eps) {
      if (a[key] < lo || a[key] > hi) return false;
    } else {
      const t1 = (lo - a[key]) / delta,
        t2 = (hi - a[key]) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
      if (enter > exit) return false;
    }
  }
  return true;
}
const cases = [
  ...PRESETS.map((p) => p.params),
  { ...DEFAULTS, layers: 4 },
  { ...DEFAULTS, connection: 'delta', pitch: 9 },
];
function layouts() {
  return cases.flatMap((p) => {
    const d = generate(p).design;
    return [
      unrolledLayout(d, d.coils),
      unrolledLayout(
        d,
        d.coils.filter((c) => c.phase === 'V' && c.path === 1),
      ),
    ];
  });
}

test('terminal fanout preserves conductor order, so leads never cross each other or another terminal symbol', () => {
  for (const l of layouts()) {
    const leads = [...l.leads].sort((a, b) => a.points[0].x - b.points[0].x);
    for (let i = 1; i < leads.length; i++) {
      assert.ok(leads[i].points[0].x - leads[i - 1].points[0].x >= 8 - eps);
      assert.ok(leads[i].points[2].x - leads[i - 1].points[2].x >= 74 - eps);
    }
    for (const lead of leads) {
      assert.equal(lead.points[1].y, l.fanoutTop);
      assert.equal(lead.points[2].y, l.fanoutBottom);
      const end = lead.points.at(-1),
        id = `lead:${lead.coil.id}:${lead.side}`;
      for (const s of scene(l).filter((s) => s.id !== id))
        assert.equal(
          intersectsBox(s.a, s.b, end.x, end.y, 14, 15),
          false,
          'terminal arrow has a protected region',
        );
    }
  }
});

test('every lower-wire crossing is orthogonal and assigned one explicit bridge, with no overlapping collinear wires', () => {
  for (const l of layouts()) {
    const ss = scene(l);
    const lower = ss.filter((s) => Math.max(s.a.y, s.b.y) < l.fanoutTop);
    for (const s of lower)
      assert.ok(Math.abs(s.a.x - s.b.x) < eps || Math.abs(s.a.y - s.b.y) < eps);
    const horizontal = lower.filter((s) => Math.abs(s.a.y - s.b.y) < eps);
    const vertical = ss.filter((s) => Math.abs(s.a.x - s.b.x) < eps);
    for (const h of horizontal)
      for (const v of vertical) {
        if (
          h.id === v.id ||
          v.a.x <= Math.min(h.a.x, h.b.x) + eps ||
          v.a.x >= Math.max(h.a.x, h.b.x) - eps ||
          h.a.y <= Math.min(v.a.y, v.b.y) + eps ||
          h.a.y >= Math.max(v.a.y, v.b.y) - eps
        )
          continue;
        const bridges = l.decorations[h.id].bridges.filter(
          (j) =>
            Math.abs(j.y - h.a.y) < eps &&
            j.crossings.some(
              (c) => c.route === v.id && Math.abs(c.x - v.a.x) < eps,
            ),
        );
        assert.equal(bridges.length, 1);
        assert.ok(bridges[0].x1 < v.a.x && bridges[0].x2 > v.a.x);
      }
    for (let i = 0; i < ss.length; i++)
      for (let j = i + 1; j < ss.length; j++) {
        const a = ss[i],
          b = ss[j];
        if (a.id === b.id) continue;
        for (const [axis, along] of [
          ['x', 'y'],
          ['y', 'x'],
        ]) {
          if (
            Math.abs(a.a[axis] - a.b[axis]) > eps ||
            Math.abs(b.a[axis] - b.b[axis]) > eps ||
            Math.abs(a.a[axis] - b.a[axis]) > eps
          )
            continue;
          const overlap =
            Math.min(
              Math.max(a.a[along], a.b[along]),
              Math.max(b.a[along], b.b[along]),
            ) -
            Math.max(
              Math.min(a.a[along], a.b[along]),
              Math.min(b.a[along], b.b[along]),
            );
          assert.ok(
            overlap <= eps,
            'different electrical wires must not share a collinear run',
          );
        }
      }
  }
});

test('every crossover direction arrow has clearance from all other wire segments and bridge curves', () => {
  let arrows = 0;
  for (const l of layouts()) {
    const ss = scene(l);
    for (const [id, d] of Object.entries(l.decorations))
      for (const arrow of d.arrows) {
        arrows++;
        const centerX = arrow.x - (arrow.angle === 0 ? 2 : -2);
        for (const s of ss.filter((s) => s.id !== id))
          assert.equal(
            intersectsBox(s.a, s.b, centerX, arrow.y, 6, 5),
            false,
            `${id} arrow must not touch another wire`,
          );
        for (const j of d.bridges)
          if (Math.abs(j.y - arrow.y) < eps)
            assert.ok(centerX <= j.x1 - 6 || centerX >= j.x2 + 6);
      }
  }
  assert.ok(
    arrows > 0,
    'normal winding plans keep useful crossover direction arrows',
  );
});
