import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  generate,
  netlist,
  auditCoils,
  sumVector,
} from '../lib/winding.ts';
import { generateAuto } from '../lib/autopitch.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

const params = {
  ...DEFAULTS,
  slots: 72,
  poles: 84,
  paths: 6,
  pitch: 1,
  turns: 50,
};
const reference = [
  [
    [1, 1, 2, 2],
    [3, 2, 2, 1],
    [8, 2, 7, 1],
    [8, 1, 9, 2],
  ],
  [
    [13, 1, 14, 2],
    [15, 2, 14, 1],
    [20, 2, 19, 1],
    [20, 1, 21, 2],
  ],
  [
    [25, 1, 26, 2],
    [27, 2, 26, 1],
    [32, 2, 31, 1],
    [32, 1, 33, 2],
  ],
  [
    [37, 1, 38, 2],
    [39, 2, 38, 1],
    [44, 2, 43, 1],
    [44, 1, 45, 2],
  ],
  [
    [49, 1, 50, 2],
    [51, 2, 50, 1],
    [56, 2, 55, 1],
    [56, 1, 57, 2],
  ],
  [
    [61, 1, 62, 2],
    [63, 2, 62, 1],
    [68, 2, 67, 1],
    [68, 1, 69, 2],
  ],
];

test('72-slot84-pole U phase matches all24 directed rows in the supplied Motor-CAD table', () => {
  for (const calculate of [generate, generateAuto]) {
    const r = calculate(params);
    assert.ok(r.ok);
    const d = r.design;
    const u = netlist(d).branches.filter((b) => b.phase === 'U');
    assert.deepEqual(
      u.map((b) => b.coils.map((c) => [c.go, c.goLayer, c.back, c.backLayer])),
      reference,
    );
    assert.ok(u.every((b) => b.coils.reduce((n, c) => n + c.turns, 0) === 200));
    assert.ok(
      d.phases.every(
        (s) => Math.abs(s.kw - Math.cos(Math.PI / 12) ** 2) < 1e-12,
      ),
    );
    assert.deepEqual(d.possiblePaths, [1, 2, 3, 4, 6, 12]);
    assert.ok(
      !d.issues.some((i) => i.code === 'W_LONG_PITCH'),
      'do not advise a pitch below the minimum one-slot coil',
    );
  }
});

test('tooth phase-origin convention scales across12/14 families and keeps equal branch harmonics', () => {
  for (const k of [1, 2, 3, 6, 12, 16])
    for (const paths of new Set([1, k, 2 * k]))
      for (const connection of ['star', 'delta'])
        for (const sequence of ['UVW', 'UWV']) {
          const p = {
            ...params,
            slots: 12 * k,
            poles: 14 * k,
            paths,
            connection,
            sequence,
          };
          const r = generate(p);
          assert.ok(r.ok, JSON.stringify(p));
          const d = r.design;
          assert.deepEqual(auditCoils(d.coils, p), []);
          assert.ok(
            d.phases.every(
              (s) => Math.abs(s.kw - Math.cos(Math.PI / 12) ** 2) < 1e-12,
            ),
          );
          for (const phase of ['U', 'V', 'W']) {
            const branches = netlist(d).branches.filter(
              (b) => b.phase === phase,
            );
            for (const h of [1, 3, 5, 7, 11, 13, 25]) {
              const base = sumVector(branches[0].coils, p, h);
              for (const branch of branches) {
                const v = sumVector(branch.coils, p, h);
                assert.ok(Math.hypot(v.re - base.re, v.im - base.im) < 1e-7);
              }
            }
          }
        }
});

test('tooth roofs expose arrows and six paths have local vertical terminals without a seam detour', () => {
  const d = generate(params).design;
  const u = d.coils.filter((c) => c.phase === 'U');
  const l = unrolledLayout(d, u);
  assert.equal(l.links.length, 18);
  assert.equal(l.leads.length, 12);
  assert.deepEqual(
    l.leads.filter((x) => x.kind === 'start').map((x) => x.coil.go),
    [1, 13, 25, 37, 49, 61],
  );
  assert.deepEqual(
    l.leads.filter((x) => x.kind === 'end').map((x) => x.coil.back),
    [9, 21, 33, 45, 57, 69],
  );
  assert.ok(l.leads.every((x) => x.points.every((p) => p.x === x.points[0].x)));
  assert.ok(l.coils.every((c) => c.pieces.length === 1));
  assert.ok(Object.values(l.roofArrows).every((arrows) => arrows.length === 2));
  assert.ok(
    l.coils.every((c) => Math.min(...c.pieces.flat().map((p) => p.y)) >= 64),
  );
  assert.ok(
    l.height < 650,
    'keep the tooth drawing compact enough to inspect in a viewport',
  );
});
