import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PHASES, generate, auditCoils } from '../lib/winding.ts';
import { generateAuto, autoPitchCandidates } from '../lib/autopitch.ts';
import { encodeProject, decodeProject, coilCSV } from '../lib/project.ts';
import { windingTools } from '../lib/webmcp.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

const base = PRESETS.find((p) => p.name === '单层交叉式').params;
function design(params) {
  const result = generate(params);
  assert.ok(result.ok, JSON.stringify(result.issues));
  return result.design;
}

test('18/2 agrees with the three coil pairs in Yue Hongbin example 1-2; 36/4 repeats them at the pole-pair period', () => {
  for (const poles of [2, 4]) {
    const d = design({ ...base, poles, slots: 9 * poles });
    const u = d.coils.filter((c) => c.phase === 'U');
    const pairs = u.map((c) => [c.go, c.back].sort((a, b) => a - b));
    const reference = [
      [1, 9],
      [2, 10],
      [11, 18],
    ];
    assert.deepEqual(
      pairs,
      Array.from({ length: poles / 2 }, (_, i) =>
        reference.map((pair) => pair.map((slot) => slot + 18 * i)),
      ).flat(),
    );
    assert.deepEqual(
      u.slice(0, 3).map((c) => c.span),
      [8, 8, -7],
    );
    for (const p of d.phases)
      assert.ok(Math.abs(p.kw - (1 + 2 * Math.cos(Math.PI / 9)) / 3) < 1e-12);
  }
});

test('crossed chain preserves slot occupancy, alternate group sizes and equal parallel branches at different pole counts', () => {
  for (const poles of [2, 4, 6, 8, 40]) {
    const slots = 9 * poles;
    const p = { ...base, poles, slots };
    const first = design(p);
    for (const paths of first.possiblePaths) {
      const d = design({ ...p, paths });
      assert.deepEqual(auditCoils(d.coils, d.params), []);
      assert.equal(d.coils.length, slots / 2);
      assert.equal(new Set(d.coils.flatMap((c) => [c.go, c.back])).size, slots);
      const groups = Object.groupBy(d.coils, (c) => c.group);
      assert.equal(Object.keys(groups).length, slots / 3);
      for (const ph of PHASES) {
        const sizes = Array.from(
          { length: poles },
          (_, i) => groups[`${ph}-G${i + 1}`].length,
        );
        for (let i = 0; i < sizes.length; i++)
          assert.equal(sizes[i] + sizes[(i + 1) % sizes.length], 3);
      }
      for (const group of Object.values(groups)) {
        assert.equal(new Set(group.map((c) => c.path)).size, 1);
        for (const c of group) {
          assert.equal(c.goLayer, 1);
          assert.equal(c.backLayer, 1);
          assert.equal(Math.abs(c.span), group.length === 1 ? 7 : 8);
        }
      }
      for (const ph of d.phases) assert.ok(ph.branchError < 1e-10);
    }
  }
  const normal = design(base),
    reversed = design({ ...base, sequence: 'UWV', connection: 'delta' });
  assert.deepEqual(
    normal.coils.filter((c) => c.phase === 'V').map((c) => [c.go, c.back]),
    reversed.coils.filter((c) => c.phase === 'W').map((c) => [c.go, c.back]),
  );
});

test('single-layer crossed concentric preset follows figure 10-31 nested 9/11 pairs and two-in/two-out slot pattern', () => {
  const d = design(PRESETS.find((p) => p.name === '单层交叉同心式').params);
  assert.equal(d.coils.length, 12);
  const starts = new Set(d.coils.map((c) => (c.span > 0 ? c.go : c.back)));
  for (let slot = 1; slot <= 24; slot++)
    assert.equal(starts.has(slot), (slot - 1) % 4 < 2);
  for (const group of Object.values(Object.groupBy(d.coils, (c) => c.group))) {
    const [inner, outer] = group.toSorted(
      (a, b) => Math.abs(a.span) - Math.abs(b.span),
    );
    assert.deepEqual([Math.abs(inner.span), Math.abs(outer.span)], [9, 11]);
    assert.equal(
      (2 * inner.go + inner.span + 48) % 48,
      (2 * outer.go + outer.span + 48) % 48,
    );
  }
});

test('front and rear show distinct long and short end turns at the actual coil slots', () => {
  const d = design(base);
  const layout = unrolledLayout(d, d.coils);
  const depths = new Map();
  for (const r of layout.coils) {
    const depth = layout.top - Math.min(...r.pieces.flat().map((p) => p.y));
    const rear =
      Math.max(...r.returnPieces.flat().map((p) => p.y)) - layout.bottom;
    assert.ok(Math.abs(depth - rear) < 1e-7);
    depths.set(Math.abs(r.coil.span), depth);
  }
  assert.ok(depths.get(8) > depths.get(7));
});

test('crossed-chain files, filtered CSV and browser tool preserve group, pitch and validation', () => {
  const d = design(base);
  const saved = encodeProject(d);
  assert.deepEqual(decodeProject(saved), base);
  const doc = JSON.parse(saved);
  assert.match(doc.conventions.model, /crossed chain/);
  assert.throws(
    () =>
      decodeProject(JSON.stringify({ ...doc, schema: 'winding-studio/v1' })),
    /E_FILE_SCHEMA/,
  );
  const rows = coilCSV(d, 'U', 1).split('\r\n');
  assert.equal(rows.length, 7);
  assert.ok(rows[1].endsWith('"8","U-G1"'));
  assert.ok(rows[3].endsWith('"-7","U-G2"'));
  assert.deepEqual(autoPitchCandidates(base), [8]);
  const tool = windingTools({ apply() {}, read() {}, showPhase() {} })[0];
  assert.ok(
    tool.inputSchema.properties.windingType.enum.includes('crossChain'),
  );
  const input = { ...base };
  delete input.pitch;
  assert.equal(tool.execute(input).params.pitch, 8);
  for (const [params, code] of [
    [{ pitch: 7 }, 'E_CROSS_PITCH'],
    [{ layers: 2 }, 'E_CROSS_LAYERS'],
    [{ slots: 54, poles: 8 }, 'E_CROSS_Q'],
    [{ slots: 60, poles: 4 }, 'E_CROSS_Q'],
  ]) {
    assert.ok(
      tool.execute({ ...base, ...params }).issues.some((i) => i.code === code),
    );
    if (!Object.hasOwn(params, 'pitch'))
      assert.ok(
        generateAuto({ ...base, ...params }).issues.some(
          (i) => i.code === code,
        ),
      );
  }
});
