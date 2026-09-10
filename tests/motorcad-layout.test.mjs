import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, generate, netlist } from '../lib/winding.ts';
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
