import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PHASES, generate, auditCoils } from '../lib/winding.ts';
import { generateAuto } from '../lib/autopitch.ts';
import { encodeProject, decodeProject, coilCSV } from '../lib/project.ts';
import { windingTools } from '../lib/webmcp.ts';

const base = {
  ...DEFAULTS,
  slots: 24,
  poles: 4,
  layers: 1,
  paths: 1,
  pitch: 5,
  windingType: 'chain',
};
const valid = (p = {}) => {
  const r = generate({ ...base, ...p });
  assert.ok(r.ok, JSON.stringify(r.issues));
  return r.design;
};

test('single-layer chain matches the independent AHU 24-slot 4-pole coil and series-link table', () => {
  // AHU Motor Production Practice V1.31, PDF p.18, Fig.3-2 / Table3-4.
  // Its B/C numbering follows our UWV spatial convention. A circular list
  // can start at any coil; compare after rotating to the published terminal.
  const d = valid({ sequence: 'UWV' });
  const reference = {
    U: [
      [1, 6],
      [12, 7],
      [13, 18],
      [24, 19],
    ],
    V: [
      [9, 14],
      [20, 15],
      [21, 2],
      [8, 3],
    ],
    W: [
      [5, 10],
      [16, 11],
      [17, 22],
      [4, 23],
    ],
  };
  for (const ph of PHASES) {
    const coils = d.coils
      .filter((c) => c.phase === ph)
      .map((c) => [c.go, c.back]);
    const start = coils.findIndex((c) => c[0] === reference[ph][0][0]);
    assert.deepEqual(
      [...coils.slice(start), ...coils.slice(0, start)],
      reference[ph],
    );
  }
  d.phases.forEach((p) =>
    assert.ok(Math.abs(p.kw - Math.cos(Math.PI / 12)) < 1e-12),
  );
});

test('chain uses alternating slot placement, complete occupancy and equal odd spans across q=1,2,4,6', () => {
  for (const [slots, poles] of [
    [6, 2],
    [12, 4],
    [24, 4],
    [36, 6],
    [48, 4],
    [72, 4],
    [96, 8],
    [360, 30],
  ]) {
    const r = generateAuto({ ...base, slots, poles });
    assert.ok(r.ok, `${slots}/${poles}: ${JSON.stringify(r.issues)}`);
    const d = r.design;
    assert.equal(d.coils.length, slots / 2);
    assert.equal(new Set(d.coils.flatMap((c) => [c.go, c.back])).size, slots);
    assert.equal(d.params.pitch % 2, 1);
    for (const c of d.coils) {
      assert.equal(c.goLayer, 1);
      assert.equal(c.backLayer, 1);
      assert.equal(Math.abs(c.span), d.params.pitch);
      assert.equal((c.span > 0 ? c.go : c.back) % 2, 1);
    }
    assert.deepEqual(auditCoils(d.coils, d.params), []);
    for (const paths of d.possiblePaths) {
      const parallel = generate({ ...d.params, paths });
      assert.ok(parallel.ok, `${slots}/${poles}/${paths}`);
      parallel.design.phases.forEach((p) => assert.ok(p.branchError < 1e-10));
    }
  }
});

test('manual chain remains distinct from the generic single-layer lap matcher', () => {
  // This full-pitch q=1 arrangement admits many perfect matchings. Chain
  // must keep the fixed odd-slot placement rather than choose an arbitrary one.
  const d = valid({ slots: 12, poles: 4, pitch: 3 });
  assert.deepEqual(
    d.coils.map((c) => (c.span > 0 ? c.go : c.back)).sort((a, b) => a - b),
    [1, 3, 5, 7, 9, 11],
  );
  const uvw = valid(),
    uwv = valid({ sequence: 'UWV', connection: 'delta' });
  for (const [a, b] of [
    ['U', 'U'],
    ['V', 'W'],
    ['W', 'V'],
  ])
    assert.deepEqual(
      uvw.coils.filter((c) => c.phase === a).map((c) => [c.go, c.back]),
      uwv.coils.filter((c) => c.phase === b).map((c) => [c.go, c.back]),
    );
});

test('unsupported chain models fail explicitly instead of returning a lap layout', () => {
  for (const [change, code] of [
    [{ layers: 2 }, 'E_CHAIN_LAYERS'],
    [{ pitch: 4 }, 'E_CHAIN_PITCH'],
    [{ slots: 36 }, 'E_CHAIN_Q'],
    [{ slots: 54, poles: 8 }, 'E_CHAIN_Q'],
    [{ layers: 3 }, 'E_RANGE_LAYERS'],
  ]) {
    const r = generate({ ...base, ...change });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === code));
  }
  assert.equal(
    generateAuto({ ...base, slots: 36 }).issues[0].code,
    'E_CHAIN_Q',
  );
});

test('chain JSON, CSV and WebMCP keep the real model and validate before applying', () => {
  const d = valid(),
    encoded = encodeProject(d);
  assert.deepEqual(decodeProject(encoded), d.params);
  assert.match(encoded, /three-phase single-layer equal-pitch chain/);
  assert.equal(coilCSV(d).split('\r\n').length, 13);
  const old = JSON.parse(encoded);
  old.schema = 'winding-studio/v1';
  assert.throws(() => decodeProject(JSON.stringify(old)), /E_FILE_SCHEMA/);
  let applied = 0;
  const tool = windingTools({
    apply: () => applied++,
    read: () => ({ result: { ok: true, design: d }, phase: 'all' }),
    showPhase: () => {},
  })[0];
  assert.ok(tool.inputSchema.properties.windingType.enum.includes('chain'));
  const automatic = { ...base };
  delete automatic.pitch;
  const r = tool.execute(automatic);
  assert.ok(r.ok);
  assert.equal(r.params.pitch, 5);
  assert.equal(applied, 1);
  assert.equal(tool.execute({ ...automatic, layers: 2 }).ok, false);
  assert.equal(applied, 1);
});
