import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, generate, auditCoils, mod, PHASES } from '../lib/winding.ts';
import { generateAuto } from '../lib/autopitch.ts';
import { encodeProject, decodeProject, coilCSV } from '../lib/project.ts';
import { windingTools } from '../lib/webmcp.ts';

const design = (p) => {
  const r = generate({
    ...DEFAULTS,
    windingType: 'concentric',
    paths: 1,
    ...p,
  });
  assert.ok(r.ok, JSON.stringify(r.issues));
  return r.design;
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const slots = (d, phase) => {
  const a = Array(d.params.slots * d.params.layers).fill(0);
  for (const c of d.coils.filter((c) => c.phase === phase)) {
    a[(c.goLayer - 1) * d.params.slots + c.go - 1] += c.turns;
    a[(c.backLayer - 1) * d.params.slots + c.back - 1] -= c.turns;
  }
  return a;
};

test('24-slot four-pole single-layer concentric example has the published 1-8 and 2-7 nested coils', () => {
  // Slot-numbered drawing: JECRC Electrical Machine-II Unit-1, printed p.20.
  // Ansys RMxprt Concentric-Type Windings separately corroborates this topology.
  const d = design({ slots: 24, poles: 4, layers: 1, pitch: 7 });
  assert.equal(d.coils.length, 12);
  assert.deepEqual(
    d.coils.filter((c) => c.phase === 'U').map((c) => [c.go, c.back, c.span]),
    [
      [1, 8, 7],
      [2, 7, 5],
      [13, 20, 7],
      [14, 19, 5],
    ],
  );
  d.phases.forEach((p) => near(p.kw, Math.cos(Math.PI / 12)));
  assert.deepEqual(d.possiblePaths, [1, 2]);
  const automatic = generateAuto({ ...d.params, pitch: 1 });
  assert.ok(automatic.ok);
  assert.equal(automatic.design.params.pitch, 7);
});

test('nested double-layer groups preserve the complete phase/layer slot distribution of their lap precursor', () => {
  for (const [params, basePitch] of [
    [{ slots: 24, poles: 4, pitch: 4 }, 3],
    [{ slots: 24, poles: 4, pitch: 7 }, 6],
    [{ slots: 54, poles: 8, pitch: 8, paths: 2 }, 6],
    [{ slots: 360, poles: 12, pitch: 39, paths: 12 }, 30],
  ]) {
    const d = design({ ...params, layers: 2 });
    const lap = generate({ ...d.params, pitch: basePitch, windingType: 'lap' });
    assert.ok(lap.ok);
    for (const phase of PHASES)
      assert.deepEqual(slots(d, phase), slots(lap.design, phase));
    assert.equal(
      Math.max(...d.coils.map((c) => Math.abs(c.span))),
      d.params.pitch,
    );
    for (const group of new Set(d.coils.map((c) => c.group))) {
      const cs = d.coils.filter((c) => c.group === group);
      assert.equal(
        new Set(cs.map((c) => mod(2 * c.go + c.span, 2 * d.params.slots))).size,
        1,
      );
      const spans = cs.map((c) => Math.abs(c.span)).sort((a, b) => a - b);
      for (let i = 1; i < spans.length; i++)
        assert.equal(spans[i] - spans[i - 1], 2);
    }
    assert.equal(auditCoils(d.coils, d.params).length, 0);
  }
});

test('parallel concentric paths require matching span inventory even when complementary coils have equal EMF', () => {
  for (const connection of ['star', 'delta']) {
    const d = design({
      slots: 24,
      poles: 4,
      layers: 1,
      pitch: 7,
      paths: 2,
      connection,
    });
    for (const phase of PHASES)
      for (const path of [1, 2])
        assert.deepEqual(
          d.coils
            .filter((c) => c.phase === phase && c.path === path)
            .map((c) => Math.abs(c.span))
            .sort(),
          [5, 7],
        );
    const r = generate({ ...d.params, paths: 4 });
    assert.equal(r.ok, false);
    assert.equal(r.issues[0].code, 'E_PATH_PARTITION');
    const bad = structuredClone(d.coils);
    const counts = [0, 0];
    for (const c of bad.filter((c) => c.phase === 'U')) {
      c.path = Math.abs(c.span) === 7 ? 1 : 2;
      c.order = ++counts[c.path - 1];
    }
    const issues = auditCoils(bad, d.params);
    assert.ok(issues.some((i) => i.code === 'E_BRANCH_SPANS'));
    assert.ok(!issues.some((i) => i.code === 'E_BRANCH_EMF'));
  }
});

test('v2 preserves variable pitch; v1 imports explicitly remain lap and cannot masquerade as concentric', () => {
  const d = design({ slots: 24, poles: 4, layers: 1, pitch: 7 });
  const text = encodeProject(d),
    doc = JSON.parse(text);
  assert.equal(doc.schema, 'winding-studio/v2');
  assert.deepEqual(decodeProject(text), d.params);
  assert.ok(coilCSV(d).includes('SpanSlots'));
  assert.ok(coilCSV(d).includes('CoilGroup'));
  delete doc.params.windingType;
  assert.throws(() => decodeProject(JSON.stringify(doc)), /E_WINDING_TYPE/);
  doc.schema = 'winding-studio/v1';
  assert.equal(decodeProject(JSON.stringify(doc)).windingType, 'lap');
  doc.params.windingType = 'concentric';
  assert.throws(() => decodeProject(JSON.stringify(doc)), /E_FILE_SCHEMA/);
});

test('concentric validation and agent tool reject impossible groups without altering a valid design', () => {
  const d = design({ slots: 24, poles: 4, layers: 2, pitch: 7 });
  for (const [change, code] of [
    [{ pitch: 2 }, 'E_CONCENTRIC_NOT_FOUND'],
    [{ layers: 4 }, 'E_RANGE_LAYERS'],
    [{ windingType: 'future' }, 'E_WINDING_TYPE'],
  ]) {
    const r = generate({ ...d.params, ...change });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === code));
  }
  let applied = 0;
  const tool = windingTools({
    apply: () => applied++,
    read: () => ({ result: { ok: true, design: d }, phase: 'all' }),
    showPhase: () => {},
  })[0];
  const good = tool.execute({
    slots: 24,
    poles: 4,
    layers: 1,
    paths: 1,
    windingType: 'concentric',
  });
  assert.ok(good.ok);
  assert.equal(good.params.pitch, 7);
  assert.equal(applied, 1);
  assert.equal(
    tool.execute({
      slots: 24,
      poles: 4,
      layers: 1,
      paths: 1,
      windingType: 'concentric',
      pitch: 2,
    }).ok,
    false,
  );
  assert.equal(applied, 1);
});
