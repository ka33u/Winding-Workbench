import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAuto } from '../lib/autopitch.ts';
import { DEFAULTS, generate, auditCoils } from '../lib/winding.ts';
import { decodeProject, encodeProject } from '../lib/project.ts';

test('four motor inputs resolve full-pitch, odd single-layer and concentrated designs', () => {
  const cases = [
    {
      slots: 36,
      poles: 4,
      paths: 2,
      layers: 2,
      pitch: 9,
      kw: Math.sin(Math.PI / 6) / (3 * Math.sin(Math.PI / 18)),
    },
    {
      slots: 24,
      poles: 4,
      paths: 1,
      layers: 1,
      pitch: 5,
      kw: Math.cos(Math.PI / 12),
    },
    {
      slots: 12,
      poles: 10,
      paths: 2,
      layers: 2,
      pitch: 1,
      kw: Math.cos(Math.PI / 12) ** 2,
    },
    { slots: 3, poles: 4, paths: 1, layers: 2, pitch: 1, kw: Math.sqrt(3) / 2 },
  ];
  for (const { pitch, kw, ...input } of cases) {
    // Auto mode must ignore a stale or emptied pitch after changing slots/poles.
    const p = { ...DEFAULTS, ...input, pitch: NaN };
    const r = generateAuto(p);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.design.params.pitch, pitch);
    assert.ok(Math.abs(r.design.phases[0].kw - kw) < 1e-10);
    assert.deepEqual(auditCoils(r.design.coils, r.design.params), []);
    assert.ok(Number.isNaN(p.pitch));
    const restored = decodeProject(encodeProject(r.design));
    assert.equal(restored.pitch, pitch);
    assert.deepEqual(generate(restored).design.coils, r.design.coils);
  }
  // The named short-pitch preset is still exactly y8 in manual mode.
  assert.equal(generate(DEFAULTS).design.params.pitch, 8);
});

test('automatic search distinguishes invalid inputs from a failed bounded search', () => {
  const odd = generateAuto({ ...DEFAULTS, poles: 3 });
  assert.equal(odd.ok, false);
  assert.ok(odd.issues.some((i) => i.code === 'E_POLES_ODD'));
  assert.ok(!odd.issues.some((i) => i.code === 'E_AUTO_PITCH_NOT_FOUND'));
  const rejected = generateAuto({ ...DEFAULTS, paths: 3 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.issues[0].code, 'E_AUTO_PITCH_NOT_FOUND');
  assert.match(rejected.issues[0].reason, /9 个/);
  assert.ok(rejected.issues.some((i) => i.code === 'E_PATH_PARTITION'));
  assert.ok(rejected.issues.every((i) => i.reason && i.fix));
  const invalidTurns = generateAuto({ ...DEFAULTS, turns: 0 });
  assert.equal(invalidTurns.issues[0].code, 'E_RANGE_TURNS');
});

test('automatic pitch supports the largest double-layer model and does not alter other parameters', () => {
  const p = {
    ...DEFAULTS,
    slots: 360,
    poles: 12,
    paths: 12,
    layers: 2,
    sequence: 'UWV',
    connection: 'delta',
    turns: 10000,
  };
  const r = generateAuto(p);
  assert.ok(r.ok);
  assert.equal(r.design.coils.length, 360);
  assert.equal(r.design.params.pitch, 30);
  for (const key of Object.keys(p))
    if (key !== 'pitch') assert.equal(r.design.params[key], p[key]);
  assert.deepEqual(auditCoils(r.design.coils, r.design.params), []);
});
