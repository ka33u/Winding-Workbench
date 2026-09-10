import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  generate,
  netlist,
  PHASES,
  sumVector,
  auditCoils,
} from '../lib/winding.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

test('18-slot reference follows circular coil groups, with U start at slot 1 and tail at slot 15', () => {
  const d = generate({
    ...DEFAULTS,
    slots: 18,
    poles: 4,
    paths: 1,
    layers: 2,
    pitch: 4,
  }).design;
  const branch = netlist(d).branches.find((b) => b.phase === 'U');
  assert.deepEqual(
    branch.coils.map((c) => [c.go, c.goLayer, c.back, c.backLayer]),
    [
      [1, 1, 5, 2],
      [2, 1, 6, 2],
      [10, 2, 6, 1],
      [10, 1, 14, 2],
      [11, 1, 15, 2],
      [1, 2, 15, 1],
    ],
  );
  const l = unrolledLayout(d, branch.coils);
  assert.equal(l.links.length, 5);
  assert.equal(l.leads.find((x) => x.kind === 'start').coil.go, 1);
  assert.equal(l.leads.find((x) => x.kind === 'end').coil.back, 15);
  assert.ok(
    l.leads.every((x) =>
      x.points.every((p) => Math.abs(p.x - x.points[0].x) < 1e-6),
    ),
    'sparse terminal leads stay vertical rather than bending into empty space',
  );
  assert.ok(
    l.height < 500,
    'single-phase developed drawing keeps terminal whitespace compact',
  );
  const roofPoints = l.coils
    .flatMap((c) => c.pieces.flat())
    .filter((p) => p.y < l.top);
  assert.ok(
    roofPoints.every((p) => l.top - p.y <= 42),
    'end turns have a shallow profile',
  );
  assert.ok(
    Object.values(l.roofArrows).flat().length > 0,
    'clear roof slopes carry direction markers',
  );
});

test('54-slot 24-pole three-path U table matches all 18 rows in the supplied Motor-CAD screenshot', () => {
  const d = generate({
    ...DEFAULTS,
    slots: 54,
    poles: 24,
    paths: 3,
    pitch: 2,
    turns: 50,
  }).design;
  const branches = netlist(d).branches.filter((b) => b.phase === 'U');
  const expected = [
    [
      [1, 1, 3, 2],
      [6, 1, 8, 2],
      [10, 2, 8, 1],
      [10, 1, 12, 2],
      [15, 1, 17, 2],
      [19, 2, 17, 1],
    ],
    [
      [19, 1, 21, 2],
      [24, 1, 26, 2],
      [28, 2, 26, 1],
      [28, 1, 30, 2],
      [33, 1, 35, 2],
      [37, 2, 35, 1],
    ],
    [
      [37, 1, 39, 2],
      [42, 1, 44, 2],
      [46, 2, 44, 1],
      [46, 1, 48, 2],
      [51, 1, 53, 2],
      [1, 2, 53, 1],
    ],
  ];
  assert.deepEqual(
    branches.map((b) =>
      b.coils.map((c) => [c.go, c.goLayer, c.back, c.backLayer]),
    ),
    expected,
  );
  for (const b of branches)
    assert.equal(
      b.coils.reduce((s, c) => s + c.turns, 0),
      300,
    );
  const l = unrolledLayout(
    d,
    branches.flatMap((b) => b.coils),
  );
  assert.equal(l.links.length, 15);
  assert.deepEqual(
    l.leads.filter((x) => x.kind === 'start').map((x) => x.coil.go),
    [1, 19, 37],
  );
  assert.deepEqual(
    l.leads.filter((x) => x.kind === 'end').map((x) => x.coil.back),
    [17, 35, 53],
  );
  assert.ok(
    l.leads.every((x) => x.points.every((p) => p.x === x.points[0].x)),
    'nearby captions must not bend these six leads away from their slots',
  );
  const maxCrossover = Math.max(
    ...l.links.flatMap((x) =>
      x.pieces.map(
        (p) => Math.max(...p.map((x) => x.x)) - Math.min(...p.map((x) => x.x)),
      ),
    ),
  );
  assert.ok(
    maxCrossover <= 3 * l.step,
    'all reference crossovers stay within neighboring coil groups',
  );
});

test('consecutive parallel groups generalize across pole/slot repeats, path counts, phase sequences and connections', () => {
  for (const scale of [1, 2, 3])
    for (const paths of [1, 2, 3, 6])
      for (const sequence of ['UVW', 'UWV'])
        for (const connection of ['star', 'delta']) {
          const p = {
            ...DEFAULTS,
            slots: 54 * scale,
            poles: 24 * scale,
            pitch: 2,
            paths,
            sequence,
            connection,
          };
          const r = generate(p);
          assert.ok(r.ok, JSON.stringify(p));
          const d = r.design;
          assert.deepEqual(auditCoils(d.coils, p), []);
          for (const phase of PHASES) {
            const branches = netlist(d).branches.filter(
              (b) => b.phase === phase,
            );
            for (const h of [1, 3, 5, 7, 11, 13, 25]) {
              const reference = sumVector(branches[0].coils, p, h);
              for (const b of branches) {
                const v = sumVector(b.coils, p, h);
                assert.ok(
                  Math.hypot(v.re - reference.re, v.im - reference.im) < 1e-7,
                );
              }
            }
            const l = unrolledLayout(
              d,
              branches.flatMap((b) => b.coils),
            );
            assert.ok(
              l.links.every((link) =>
                link.pieces.every(
                  (piece) =>
                    Math.max(...piece.map((x) => x.x)) -
                      Math.min(...piece.map((x) => x.x)) <=
                    3 * l.step + 1e-6,
                ),
              ),
            );
          }
        }
});

test('published 24-slot U table now retains the same circular series order without reversing coil sides', () => {
  const d = generate({
    ...DEFAULTS,
    slots: 24,
    poles: 4,
    paths: 1,
    layers: 2,
    pitch: 6,
    turns: 50,
  }).design;
  const u = netlist(d).branches.find((b) => b.phase === 'U').coils;
  assert.deepEqual(
    u.map((c) => [c.go, c.goLayer, c.back, c.backLayer, c.turns]),
    [
      [1, 1, 7, 2, 50],
      [2, 1, 8, 2, 50],
      [13, 2, 7, 1, 50],
      [14, 2, 8, 1, 50],
      [13, 1, 19, 2, 50],
      [14, 1, 20, 2, 50],
      [1, 2, 19, 1, 50],
      [2, 2, 20, 1, 50],
    ],
  );
  assert.ok(
    d.phases.every((p) => Math.abs(p.kw - Math.cos(Math.PI / 12)) < 1e-12),
  );
});

test('branch routing also improves earlier lap cases and preserves the short concentric benchmark', () => {
  for (const [slots, poles, paths, pitch, windingType, maxSpan, totalSpan] of [
    [54, 8, 2, 6, 'lap', 7, 272],
    [36, 4, 2, 8, 'lap', 9, 236],
    [72, 8, 4, 8, 'lap', 9, 466],
    [54, 8, 2, 8, 'concentric', 8, 312],
    [24, 4, 2, 7, 'concentric', 6, 102],
  ]) {
    const d = generate({
      ...DEFAULTS,
      slots,
      poles,
      paths,
      pitch,
      windingType,
    }).design;
    const spans = netlist(d).branches.flatMap((b) =>
      b.coils.slice(1).map((c, i) => {
        const n = Math.abs(c.go - b.coils[i].back);
        return Math.min(n, slots - n);
      }),
    );
    assert.ok(Math.max(...spans) <= maxSpan);
    assert.ok(spans.reduce((a, b) => a + b, 0) <= totalSpan);
  }
});
