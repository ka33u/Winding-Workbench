import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  PRESETS,
  PHASES,
  generate,
  auditCoils,
  mmf,
  netlist,
} from '../lib/winding.ts';
import { encodeProject, decodeProject, coilCSV } from '../lib/project.ts';
import { generateAuto } from '../lib/autopitch.ts';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const design = (p) => {
  const r = generate({ ...DEFAULTS, ...p });
  assert.equal(r.ok, true, JSON.stringify(r.ok ? '' : r.issues));
  return r.design;
};

test('only single and double layers are accepted by generation, automatic pitch and imports', () => {
  for (const layers of [1, 2]) {
    const d = design({ layers, pitch: 9 });
    assert.equal(d.coils.length, (d.params.slots * layers) / 2);
    assert.equal(decodeProject(encodeProject(d)).layers, layers);
  }
  const doc = JSON.parse(encodeProject(design({})));
  for (const layers of [0, 1.5, 3, 4, 6, 8, 100, '2', null]) {
    const p = { ...DEFAULTS, layers };
    for (const calculate of [generate, generateAuto]) {
      const result = calculate(p);
      assert.equal(result.ok, false);
      assert.ok(
        result.issues.some(
          (i) =>
            i.code === 'E_RANGE_LAYERS' &&
            i.reason.includes('单层') &&
            i.fix.includes('双层'),
        ),
      );
    }
    doc.params.layers = layers;
    assert.throws(() => decodeProject(JSON.stringify(doc)), /E_RANGE_LAYERS/);
  }
});

test('published SWAT-EM reference examples and textbook pitch/distribution formula', () => {
  for (const [p, kw] of [
    [{ slots: 6, poles: 2, layers: 1, pitch: 3, paths: 1 }, 1],
    [
      { slots: 12, poles: 2, layers: 2, pitch: 5, paths: 1 },
      Math.cos(Math.PI / 12) ** 2,
    ],
    [
      { slots: 12, poles: 10, layers: 2, pitch: 1, paths: 2 },
      Math.cos(Math.PI / 12) ** 2,
    ],
    [
      { slots: 36, poles: 4, layers: 2, pitch: 8, paths: 4 },
      (Math.sin(Math.PI / 6) / (3 * Math.sin(Math.PI / 18))) *
        Math.sin((4 * Math.PI) / 9),
    ],
  ]) {
    const d = design(p);
    for (const s of d.phases) near(s.kw, kw);
  }
});
test('all user presets are valid and reproducible', () => {
  for (const p of PRESETS) {
    const a = design(p.params),
      b = design(p.params);
    assert.deepEqual(a.coils, b.coils);
    assert.deepEqual(a.phases, b.phases);
  }
});
test('single-layer full-pitch and tooth-coil designs', () => {
  for (const p of [
    { slots: 36, poles: 4, layers: 1, pitch: 9, paths: 2 },
    { slots: 12, poles: 10, layers: 1, pitch: 1, paths: 2 },
  ]) {
    const d = design(p);
    assert.equal(d.coils.length, p.slots / 2);
    assert.equal(auditCoils(d.coils, d.params).length, 0);
  }
});
test('invalid inputs fail with actionable codes; no NaN or infinite loop', () => {
  for (const [p, code] of [
    [{ poles: 3 }, 'E_POLES_ODD'],
    [{ slots: 35 }, 'E_PHASE_SLOT_COUNT'],
    [{ slots: 12, poles: 6 }, 'E_SLOT_STAR_SYMMETRY'],
    [{ layers: 3 }, 'E_RANGE_LAYERS'],
    [{ layers: 1, pitch: 8 }, 'E_SINGLE_PITCH'],
    [{ pitch: 36 }, 'E_PITCH_SPAN'],
    [{ paths: 5 }, 'E_PATH_COIL_COUNT'],
    [{ slots: NaN }, 'E_RANGE_SLOTS'],
    [{ poles: Infinity }, 'E_RANGE_POLES'],
    [{ turns: 0 }, 'E_RANGE_TURNS'],
    [{ slots: '36' }, 'E_RANGE_SLOTS'],
    [{ layers: 0 }, 'E_RANGE_LAYERS'],
    [{ frequency: 0 }, 'E_RANGE_FREQUENCY'],
    [{ connection: 'x' }, 'E_CONNECTION'],
    [{ sequence: 'x' }, 'E_SEQUENCE'],
  ]) {
    const r = generate({ ...DEFAULTS, ...p });
    assert.equal(r.ok, false, JSON.stringify(p));
    assert.ok(r.issues.some((i) => i.code === code));
    assert.ok(r.issues.every((i) => i.reason && i.fix && i.message));
  }
});
test('integer coil division alone does not qualify parallel paths', () => {
  const r = generate({ ...DEFAULTS, slots: 36, poles: 4, paths: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].code, 'E_PATH_PARTITION');
});
test('user 54-slot 8-pole double-layer pitch-6 design supports two equal branches, not four', () => {
  const params = { ...DEFAULTS, slots: 54, poles: 8, layers: 2, pitch: 6 };
  // Nine oriented slot phasors per phase belt, spaced by 20/3 degrees,
  // and a coil span of 160 electrical degrees give this independent formula.
  const kw = (Math.sin(Math.PI / 6) / (9 * Math.sin(Math.PI / 54))) *
    Math.sin(4 * Math.PI / 9);
  for (const connection of ['star', 'delta']) {
    for (const paths of [1, 2]) {
      const d = design({ ...params, connection, paths });
      assert.equal(d.coils.length, 54);
      assert.deepEqual(d.possiblePaths, [1, 2]);
      for (const phase of d.phases) {
        assert.equal(phase.count, 18);
        near(phase.kw, kw);
        near(phase.branchError, 0);
        assert.equal(phase.turns, 18 * params.turns / paths);
      }
      const branches = netlist(d).branches;
      assert.equal(branches.length, 3 * paths);
      assert.ok(branches.every((b) => b.coils.length === 18 / paths));
    }
    for (const calculate of [generate, generateAuto]) {
      const r = calculate({ ...params, connection, paths: 4 });
      assert.equal(r.ok, false);
      const error = r.issues.find((i) => i.code === 'E_PATH_COIL_COUNT');
      assert.ok(error);
      assert.match(error.reason, /每相 18 个/);
      assert.match(error.reason, /每路 4\.5 个/);
      assert.match(error.fix, /电势/);
    }
  }
});
test('slot, identity, direction, branch and order corruption are rejected', () => {
  const d = design({});
  const mutate = (fn) => {
    const cs = structuredClone(d.coils);
    fn(cs);
    return auditCoils(cs, d.params).map((i) => i.code);
  };
  assert.ok(
    mutate((cs) => {
      cs[1].go = cs[0].go;
      cs[1].goLayer = cs[0].goLayer;
    }).includes('E_SLOT_COLLISION'),
  );
  assert.ok(
    mutate((cs) => {
      cs[0].go = 999;
    }).includes('E_SLOT_RANGE'),
  );
  assert.ok(
    mutate((cs) => {
      cs[1].id = cs[0].id;
    }).includes('E_COIL_ID'),
  );
  assert.ok(
    mutate((cs) => {
      cs[0].turns++;
    }).includes('E_BRANCH_EMF'),
  );
  assert.ok(
    mutate((cs) => {
      cs[0].order = 99;
    }).includes('E_BRANCH_ORDER'),
  );
  assert.ok(
    mutate((cs) => {
      const c = cs[0];
      [c.go, c.back] = [c.back, c.go];
      [c.goLayer, c.backLayer] = [c.backLayer, c.goLayer];
    }).includes('E_PHASE_UNBALANCED'),
  );
  assert.ok(mutate((cs) => cs.pop()).includes('E_SLOT_EMPTY'));
});
test('Y and delta netlists have continuous series chains and correct external nodes', () => {
  for (const connection of ['star', 'delta']) {
    const d = design({ connection }),
      net = netlist(d);
    assert.equal(net.branches.length, 3 * d.params.paths);
    for (const b of net.branches) {
      assert.equal(b.coils[0].from, b.start);
      assert.equal(b.coils.at(-1).to, b.end);
      for (let i = 1; i < b.coils.length; i++)
        assert.equal(b.coils[i - 1].to, b.coils[i].from);
      assert.equal(b.start, 'L' + (PHASES.indexOf(b.phase) + 1));
      assert.equal(
        b.end,
        connection === 'star'
          ? 'N'
          : 'L' + (((PHASES.indexOf(b.phase) + 1) % 3) + 1),
      );
    }
    const ids = net.branches.flatMap((b) => b.coils.map((c) => c.id));
    assert.equal(new Set(ids).size, d.coils.length);
  }
});
test('phase-sequence reversal swaps V/W while preserving U and all factors', () => {
  const a = design({ sequence: 'UVW' }),
    b = design({ sequence: 'UWV' });
  const coords = (d) =>
    d.coils
      .filter((c) => c.phase === 'U')
      .map(({ go, back, goLayer, backLayer }) => [
        go,
        back,
        goLayer,
        backLayer,
      ]);
  assert.deepEqual(coords(a), coords(b));
  near(a.phases[1].angle, b.phases[2].angle);
  near(a.phases[2].angle, b.phases[1].angle);
});
test('MMF is zero-mean, zero at zero current, linear, and one electrical period repeatable', () => {
  const a = design({}),
    b = design({ current: 20 }),
    z = design({ current: 0 });
  for (const ph of ['all', ...PHASES]) {
    const va = mmf(a, 27, ph),
      vb = mmf(b, 27, ph),
      vc = mmf(a, 387, ph);
    near(
      va.reduce((s, n) => s + n, 0),
      0,
      1e-7,
    );
    va.forEach((n, i) => {
      near(vb[i], 2 * n);
      near(vc[i], n);
    });
    assert.ok(mmf(z, 0, ph).every((n) => n === 0));
  }
});
test('JSON is reproducible and treats externally modified derived results as untrusted', () => {
  const a = design({ slots: 12, poles: 10, pitch: 1 });
  const text = encodeProject(a);
  assert.deepEqual(decodeProject(text), a.params);
  const doc = JSON.parse(text);
  doc.coils = [];
  doc.analysis = {};
  assert.deepEqual(decodeProject(JSON.stringify(doc)), a.params);
  for (const malformed of [
    '',
    '{}',
    '[]',
    'null',
    '{"schema":"future"}',
    'x'.repeat(1_000_001),
  ])
    assert.throws(() => decodeProject(malformed));
  doc.params.slots = '12';
  assert.throws(() => decodeProject(JSON.stringify(doc)), /E_RANGE_SLOTS/);
});
test('CSV exports the selected coils with continuous net nodes', () => {
  const d = design({ layers: 2 });
  const text = coilCSV(d, 'V', 1);
  const rows = text.trim().split('\r\n');
  assert.equal(
    rows.length,
    1 + d.coils.filter((c) => c.phase === 'V' && c.path === 1).length,
  );
  assert.ok(rows.slice(1).every((r) => r.includes('"V"')));
  assert.match(rows[0], /NodeFrom/);
});
test('bounded parameter sweep: independent occupancy, vector and circuit invariants', () => {
  let success = 0,
    rejected = 0,
    maxMs = 0;
  for (const slots of [
    6, 9, 12, 18, 24, 27, 30, 36, 48, 54, 60, 72, 90, 96, 120,
  ])
    for (const poles of [2, 4, 6, 8, 10, 12, 14, 16, 20, 24])
      for (const layers of [1, 2]) {
        const pitch = Math.max(
          1,
          Math.round(slots / poles) -
            (layers === 1 && Math.round(slots / poles) % 2 === 0 ? 1 : 0),
        );
        const r = generate({
          ...DEFAULTS,
          slots,
          poles,
          layers,
          pitch,
          paths: 1,
        });
        if (!r.ok) {
          rejected++;
          continue;
        }
        success++;
        const d = r.design;
        maxMs = Math.max(maxMs, d.elapsed);
        const occupied = new Set();
        for (const c of d.coils) {
          occupied.add(`${c.go}/${c.goLayer}`);
          occupied.add(`${c.back}/${c.backLayer}`);
        }
        assert.equal(occupied.size, slots * layers);
        assert.equal(d.coils.length, (slots * layers) / 2);
        for (const s of d.phases) {
          assert.ok(s.kw > 0 && s.kw <= 1 + 1e-10);
          assert.ok(Number.isFinite(s.angle));
        }
        // Direct slot-side DFT, independent from the production coil-vector reducer.
        for (const ph of PHASES) {
          const slotAmp = Array(slots).fill(0);
          let turns = 0;
          for (const c of d.coils.filter((c) => c.phase === ph)) {
            slotAmp[c.go - 1] += c.turns;
            slotAmp[c.back - 1] -= c.turns;
            turns += c.turns;
          }
          for (const h of [1, 3, 5, 7, 11]) {
            let re = 0,
              im = 0;
            for (let s = 0; s < slots; s++) {
              re += slotAmp[s] * Math.cos((Math.PI * poles * h * s) / slots);
              im += slotAmp[s] * Math.sin((Math.PI * poles * h * s) / slots);
            }
            near(
              Math.hypot(re, im) / (2 * turns),
              d.harmonics[h - 1][ph],
              1e-8,
            );
          }
        }
      }
  assert.ok(success > 100);
  console.log(JSON.stringify({ sweep: { success, rejected, maxMs } }));
});
test('maximum supported size completes within a bounded budget and exports every coil', () => {
  const d = design({ slots: 360, poles: 12, layers: 2, pitch: 29, paths: 12 });
  assert.equal(d.coils.length, 360);
  assert.ok(d.elapsed < 2000, `too slow: ${d.elapsed}ms`);
  assert.equal(netlist(d).branches.length, 36);
  assert.equal(coilCSV(d).trim().split('\r\n').length, 361);
});
