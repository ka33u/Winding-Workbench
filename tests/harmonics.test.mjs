import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialSpectrum } from '../lib/harmonics.ts';
import { generate, DEFAULTS } from '../lib/winding.ts';
import { encodeProject } from '../lib/project.ts';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const design = (p) => {
  const r = generate({ ...DEFAULTS, ...p });
  assert.ok(r.ok);
  return r.design;
};
test('mechanical order p equals the electrical fundamental for different pole counts', () => {
  for (const p of [
    { slots: 12, poles: 10, pitch: 1 },
    { slots: 36, poles: 4, pitch: 8 },
    { slots: 72, poles: 8, pitch: 8 },
    { slots: 9, poles: 8, pitch: 1, paths: 1 },
  ]) {
    const d = design(p),
      mech = spatialSpectrum(d, 'mechanical', 60),
      el = spatialSpectrum(d, 'electrical', 10);
    for (const ph of ['U', 'V', 'W'])
      for (const h of [1, 3, 5])
        near(mech[(h * d.params.poles) / 2 - 1][ph], el[h - 1][ph]);
    assert.equal(mech[d.params.poles / 2 - 1].fundamental, true);
    assert.equal(el[0].sequence, 'same');
  }
});
test('12-slot/10-pole tooth winding exposes its mechanical subharmonic', () => {
  const rows = spatialSpectrum(
    design({ slots: 12, poles: 10, pitch: 1 }),
    'mechanical',
    12,
  );
  // Each phase has two neighboring tooth axes; kp=kd=sin(n*pi/12) for n=1 or 5.
  near(rows[0].U, Math.sin(Math.PI / 12) ** 2);
  near(rows[4].U, Math.sin((5 * Math.PI) / 12) ** 2);
  near(rows[0].electricalOrder, 0.2);
  assert.equal(rows[0].fundamental, false);
  assert.equal(rows[4].mechanicalOrder, 5);
  assert.equal(rows[4].fundamental, true);
});
test('known three-phase harmonic sequences are relative to the fundamental in both phase sequences', () => {
  for (const sequence of ['UVW', 'UWV']) {
    const rows = spatialSpectrum(
      design({ slots: 36, poles: 4, pitch: 9, sequence }),
      'electrical',
      7,
    );
    assert.equal(rows[0].sequence, 'same');
    assert.equal(rows[2].sequence, 'zero');
    assert.equal(rows[4].sequence, 'reverse');
    assert.equal(rows[6].sequence, 'same');
    assert.equal(rows[1].sequence, 'none');
  }
});
test('spectrum range validation and full project export preserve explicit bases', () => {
  const d = design({ slots: 12, poles: 10, pitch: 1 });
  for (const max of [0, -1, NaN, Infinity, 1.5, 241])
    assert.throws(() => spatialSpectrum(d, 'mechanical', max));
  assert.throws(() => spatialSpectrum(d, 'wrong', 25));
  const doc = JSON.parse(encodeProject(d));
  assert.equal(doc.analysis.mechanicalHarmonics[4].fundamental, true);
  near(doc.analysis.harmonics[0].U, doc.analysis.mechanicalHarmonics[4].U);
});
