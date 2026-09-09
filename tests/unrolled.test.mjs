import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, generate, netlist } from '../lib/winding.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
function assertDirectedPath(pieces, from, to, layout) {
  const remaining = [...pieces];
  const samePeriodicPoint = (a, b) =>
    near(a, b) ||
    (Math.abs(a.y - b.y) < 1e-6 &&
      Math.abs(Math.abs(a.x - b.x) - (layout.right - layout.left)) < 1e-6);
  let point = from;
  while (remaining.length) {
    const index = remaining.findIndex((piece) =>
      samePeriodicPoint(point, piece[0]),
    );
    assert.ok(
      index >= 0,
      'a directed wire fragment must continue at the same point or the matching periodic cut',
    );
    point = remaining.splice(index, 1)[0].at(-1);
  }
  assert.ok(near(point, to), 'wire must reach the intended physical conductor');
}
function check(d, cs = d.coils) {
  const layout = unrolledLayout(d, cs),
    byId = new Map(layout.coils.map((r) => [r.coil.id, r]));
  const expected = netlist(d).branches;
  for (const route of layout.coils) {
    assertDirectedPath(route.pieces, route.go, route.back, layout);
    const vertical = route.pieces
      .flatMap((piece) => piece.slice(1).map((b, i) => [piece[i], b]))
      .filter(
        ([a, b]) =>
          Math.abs(a.x - b.x) < 1e-6 &&
          Math.abs(a.y - b.y) >= layout.bottom - layout.top - 1e-6,
      );
    assert.equal(
      vertical.length,
      2,
      'each visible coil has exactly two full slot sides',
    );
  }
  for (const link of layout.links) {
    assertDirectedPath(
      link.pieces,
      byId.get(link.from.id).back,
      byId.get(link.to.id).go,
      layout,
    );
    const branch = expected.find(
      (b) => b.phase === link.from.phase && b.path === link.from.path,
    );
    const index = branch.coils.findIndex((c) => c.id === link.from.id);
    assert.equal(branch.coils[index + 1].id, link.to.id);
    assert.equal(branch.coils[index].to, link.node);
    assert.equal(branch.coils[index + 1].from, link.node);
  }
  for (const route of layout.coils) {
    assert.equal(
      layout.links.filter((l) => l.to.id === route.coil.id).length +
        layout.leads.filter(
          (l) => l.coil.id === route.coil.id && l.side === 'go',
        ).length,
      1,
    );
    assert.equal(
      layout.links.filter((l) => l.from.id === route.coil.id).length +
        layout.leads.filter(
          (l) => l.coil.id === route.coil.id && l.side === 'back',
        ).length,
      1,
    );
  }
  const points = [
    ...layout.coils.flatMap((r) => r.pieces.flat()),
    ...layout.links.flatMap((r) => r.pieces.flat()),
    ...layout.leads.flatMap((r) => r.points),
  ];
  assert.ok(
    points.every(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= layout.left - 1e-6 &&
        p.x <= layout.right + 1e-6 &&
        p.y >= 0 &&
        p.y < layout.height,
    ),
  );
  const terminals = layout.leads
    .map((l) => l.points.at(-1).x)
    .sort((a, b) => a - b);
  assert.ok(terminals.slice(1).every((x, i) => x - terminals[i] >= 74 - 1e-6));
  return layout;
}

test('unrolled roof paths and every bottom series link follow the electrical netlist, including wrapped and long-pitch coils', () => {
  for (const p of [
    ...PRESETS.map((p) => p.params),
    { ...DEFAULTS, slots: 54, poles: 8, layers: 2, paths: 2, pitch: 6 },
    { ...DEFAULTS, pitch: 28 },
    { ...DEFAULTS, slots: 6, poles: 2, pitch: 3, layers: 1, paths: 1 },
  ]) {
    const r = generate(p);
    assert.ok(r.ok);
    const layout = check(r.design);
    const branches = netlist(r.design).branches;
    assert.equal(layout.links.length, r.design.coils.length - branches.length);
    assert.equal(layout.leads.length, 2 * branches.length);
    assert.ok(layout.leads.every((l) => l.kind !== 'continuation'));
  }
});

test('phase and path filters retain whole branches; partial branches retain explicit continuation ports', () => {
  const d = generate(DEFAULTS).design;
  const oneBranch = check(
    d,
    d.coils.filter((c) => c.phase === 'V' && c.path === 1),
  );
  assert.equal(oneBranch.leads.length, 2);
  const pair = check(
    d,
    d.coils.filter(
      (c) => c.phase === 'V' && c.path === 1 && c.order > 1,
    ),
  );
  assert.ok(pair.leads.some((l) => l.kind === 'continuation'));
  assert.ok(
    pair.leads
      .filter((l) => l.kind === 'continuation')
      .every((l) => l.node.includes(':n') && l.detail.startsWith('接 ')),
  );
});

test('Y and delta terminal captions carry the actual phase start/end nodes', () => {
  for (const connection of ['star', 'delta']) {
    const d = generate({ ...DEFAULTS, connection }).design;
    const layout = check(d);
    for (const branch of netlist(d).branches) {
      const begin = layout.leads.find(
        (l) => l.coil.id === branch.coils[0].id && l.side === 'go',
      );
      const end = layout.leads.find(
        (l) => l.coil.id === branch.coils.at(-1).id && l.side === 'back',
      );
      assert.equal(begin.node, branch.coils[0].from);
      assert.equal(end.node, branch.coils.at(-1).to);
      assert.equal(begin.kind, 'start');
      assert.equal(end.kind, 'end');
    }
  }
});

test('maximum double-layer model preserves route continuity and readable conductor spacing', () => {
  const d = generate({
    ...DEFAULTS,
    slots: 360,
    poles: 12,
    layers: 2,
    paths: 12,
  }).design;
  const layout = check(d);
  assert.equal(layout.coils.length, 360);
  assert.ok(layout.width >= 360 * 32);
  const coords = new Map();
  for (const r of layout.coils)
    for (const [slot, x] of [
      [r.coil.go, r.go.x],
      [r.coil.back, r.back.x],
    ]) {
      if (!coords.has(slot)) coords.set(slot, []);
      coords.get(slot).push(x);
    }
  for (const xs of coords.values()) {
    xs.sort((a, b) => a - b);
    assert.equal(xs.length, 2);
    assert.ok(xs.slice(1).every((x, i) => x - xs[i] >= 8 - 1e-6));
  }
});
